import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api/vault';
import { openPdf } from '../pdf/pdfjs';
import { compareReadingOrder, FAMILIES, matchesFilters, pageOf } from '../annotations';
import useFullscreen from '../hooks/useFullscreen';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import useReviewProgress from '../hooks/useReviewProgress';
import PageView from './PageView';
import AnnotationPanel from './AnnotationPanel';
import SearchPanel from './SearchPanel';
import CoverageBar from './CoverageBar';
import ShortcutHelp from './ShortcutHelp';
import Icon from './Icon';
import { rememberRecent } from './DocumentPicker';

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const PAGE_GAP = 16;
const VIEWED_DWELL_MS = 1200;
const DEFAULT_FILTERS = { families: new Set(FAMILIES.map((f) => f.id)), state: 'open', mine: false, text: '' };

export default function ReviewWorkspace({ docRef, user, onExit }) {
    const rootRef = useRef(null);
    const [scrollEl, setScrollEl] = useState(null);
    const pageEls = useRef(new Map());

    const [doc, setDoc] = useState(null);
    const [pdfDoc, setPdfDoc] = useState(null);
    const [pageSizes, setPageSizes] = useState([]);
    const [loadState, setLoadState] = useState({ phase: 'loading', message: 'Loading document…' });

    const [annotations, setAnnotations] = useState([]);
    const [userNames, setUserNames] = useState({});
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [selectedId, setSelectedId] = useState(null);
    const [tool, setTool] = useState('select');
    const [draft, setDraft] = useState(null);

    const [zoom, setZoom] = useState('fit-width');
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [currentPage, setCurrentPage] = useState(1);
    const [panel, setPanel] = useState('comments');
    const [panelOpen, setPanelOpen] = useState(true);
    const [showHelp, setShowHelp] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const searchInputRef = useRef(null);

    const fullscreen = useFullscreen(rootRef);
    const progress = useReviewProgress(doc || { versionId: `${docRef.id}_pending` }, user.id);

    // ---- loading -------------------------------------------------------------------------
    useEffect(() => {
        let cancelled = false;
        let loadedPdf = null;
        (async () => {
            try {
                const meta = await api.getDocument(docRef.id, docRef.major, docRef.minor);
                if (cancelled) return;
                setDoc(meta);
                rememberRecent(meta);
                setLoadState({ phase: 'loading', message: 'Downloading viewable rendition…' });
                const [bytes, notes] = await Promise.all([api.getViewableRendition(meta), api.getAnnotations(meta)]);
                if (cancelled) return;
                setLoadState({ phase: 'loading', message: 'Preparing pages…' });
                loadedPdf = await openPdf(bytes);
                const sizes = [];
                for (let i = 1; i <= loadedPdf.numPages; i++) {
                    const page = await loadedPdf.getPage(i);
                    const vp = page.getViewport({ scale: 1 });
                    sizes.push({ width: vp.width, height: vp.height });
                }
                if (cancelled) return;
                setPdfDoc(loadedPdf);
                setPageSizes(sizes);
                setAnnotations(notes);
                setLoadState({ phase: 'ready' });
                api.getUserNames(notes.map((a) => a.created_by_user__sys)).then((names) => !cancelled && setUserNames(names)).catch(() => {});
            } catch (e) {
                console.error('[review-mode] load failed', e);
                if (!cancelled) setLoadState({ phase: 'error', message: e.message || String(e) });
            }
        })();
        return () => {
            cancelled = true;
            loadedPdf?.destroy();
        };
    }, [docRef.id, docRef.major, docRef.minor]);

    const reloadAnnotations = useCallback(async () => {
        if (!doc) return;
        const notes = await api.getAnnotations(doc);
        setAnnotations(notes);
        const missing = notes.map((a) => String(a.created_by_user__sys)).filter((id) => id && !userNames[id]);
        if (missing.length) {
            const names = await api.getUserNames(missing);
            setUserNames((prev) => ({ ...prev, ...names }));
        }
    }, [doc, userNames]);

    // ---- layout & zoom ---------------------------------------------------------------------
    useEffect(() => {
        if (!scrollEl) return undefined;
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            setContainerSize({ width, height });
        });
        observer.observe(scrollEl);
        return () => observer.disconnect();
    }, [scrollEl]);

    const scale = useMemo(() => {
        if (typeof zoom === 'number') return zoom;
        if (!pageSizes.length || !containerSize.width) return 1;
        const maxW = Math.max(...pageSizes.map((s) => s.width));
        const maxH = Math.max(...pageSizes.map((s) => s.height));
        const fitWidth = (containerSize.width - 48) / maxW;
        if (zoom === 'fit-page') return Math.max(0.1, Math.min(fitWidth, (containerSize.height - 2 * PAGE_GAP) / maxH));
        return Math.max(0.1, fitWidth);
    }, [zoom, pageSizes, containerSize]);

    // Keep the reader's place when the scale changes.
    const anchorRef = useRef(null);
    const prevScale = useRef(scale);
    if (prevScale.current !== scale && scrollEl) {
        anchorRef.current = { ratio: scrollEl.scrollTop / Math.max(1, scrollEl.scrollHeight) };
        prevScale.current = scale;
    }
    useLayoutEffect(() => {
        if (anchorRef.current && scrollEl) {
            scrollEl.scrollTop = anchorRef.current.ratio * scrollEl.scrollHeight;
            anchorRef.current = null;
        }
    }, [scale, scrollEl]);

    const zoomBy = useCallback((direction) => {
        const next = direction > 0
            ? ZOOM_STEPS.find((z) => z > scale + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
            : [...ZOOM_STEPS].reverse().find((z) => z < scale - 0.001) ?? ZOOM_STEPS[0];
        setZoom(next);
    }, [scale]);

    // ---- navigation ------------------------------------------------------------------------
    const registerElement = useCallback((pageNumber, el) => {
        if (el) pageEls.current.set(pageNumber, el);
        else pageEls.current.delete(pageNumber);
    }, []);

    const goToPage = useCallback((pageNumber, behavior = 'auto') => {
        const el = pageEls.current.get(pageNumber);
        if (!el || !scrollEl) return;
        scrollEl.scrollTo({ top: el.offsetTop - PAGE_GAP, behavior });
    }, [scrollEl]);

    const revealAnnotation = useCallback((annotation) => {
        const pageEl = pageEls.current.get(pageOf(annotation));
        if (!pageEl || !scrollEl) return;
        const mark = pageEl.querySelector(`[data-annotation-id="${CSS.escape(String(annotation.id__sys))}"]`);
        const offset = mark ? mark.offsetTop : 0;
        scrollEl.scrollTo({ top: pageEl.offsetTop + offset - scrollEl.clientHeight / 3, behavior: 'smooth' });
    }, [scrollEl]);

    const visibility = useRef(new Map());
    const dwellTimers = useRef(new Map());
    const { markViewed } = progress;
    const onVisibility = useCallback((pageNumber, ratio, coverage) => {
        visibility.current.set(pageNumber, Math.max(ratio, coverage));
        let best = 1;
        let bestScore = -1;
        visibility.current.forEach((score, n) => {
            if (score > bestScore) {
                best = n;
                bestScore = score;
            }
        });
        setCurrentPage(best);

        const timers = dwellTimers.current;
        if (ratio >= 0.5 || coverage >= 0.6) {
            if (!timers.has(pageNumber)) {
                timers.set(pageNumber, setTimeout(() => {
                    timers.delete(pageNumber);
                    markViewed(pageNumber);
                }, VIEWED_DWELL_MS));
            }
        } else if (timers.has(pageNumber)) {
            clearTimeout(timers.get(pageNumber));
            timers.delete(pageNumber);
        }
    }, [markViewed]);
    useEffect(() => () => dwellTimers.current.forEach(clearTimeout), []);

    // ---- annotations -----------------------------------------------------------------------
    const sorted = useMemo(() => [...annotations].sort(compareReadingOrder), [annotations]);
    const visible = useMemo(() => sorted.filter((a) => matchesFilters(a, filters, user.id)), [sorted, filters, user.id]);
    const byPage = useMemo(() => {
        const map = new Map();
        visible.forEach((a) => {
            const n = pageOf(a);
            if (!map.has(n)) map.set(n, []);
            map.get(n).push(a);
        });
        return map;
    }, [visible]);

    const select = useCallback((id, { reveal = true } = {}) => {
        setSelectedId(id);
        setPanel('comments');
        setPanelOpen(true);
        const annotation = annotations.find((a) => a.id__sys === id);
        if (annotation && reveal) revealAnnotation(annotation);
    }, [annotations, revealAnnotation]);

    const stepAnnotation = useCallback((direction) => {
        if (!visible.length) return;
        const idx = visible.findIndex((a) => a.id__sys === selectedId);
        let next;
        if (idx === -1) {
            next = direction > 0
                ? visible.find((a) => pageOf(a) >= currentPage) || visible[0]
                : [...visible].reverse().find((a) => pageOf(a) <= currentPage) || visible[visible.length - 1];
        } else {
            next = visible[(idx + direction + visible.length) % visible.length];
        }
        select(next.id__sys);
    }, [visible, selectedId, currentPage, select]);

    const onDraft = useCallback((value) => {
        setDraft(value);
        setSelectedId(null);
        setPanel('comments');
        setPanelOpen(true);
    }, []);

    const saveDraft = useCallback(async ({ comment, color }) => {
        const created = await api.createNote(doc, { comment, color, placemark: draft.placemark });
        setDraft(null);
        setTool('select');
        await reloadAnnotations();
        if (created?.id__sys) setSelectedId(String(created.id__sys));
    }, [doc, draft, reloadAnnotations]);

    const setState = useCallback(async (annotation, state) => {
        await api.setAnnotationState(doc, annotation.id__sys, state);
        setAnnotations((prev) => prev.map((a) => (a.id__sys === annotation.id__sys ? { ...a, state__sys: state } : a)));
    }, [doc]);

    // ---- keyboard --------------------------------------------------------------------------
    const nextUnviewed = useCallback(() => {
        const total = pageSizes.length;
        for (let i = 1; i <= total; i++) {
            const n = ((currentPage - 1 + i) % total) + 1;
            if (!progress.viewed.has(n)) {
                goToPage(n, 'smooth');
                return;
            }
        }
    }, [pageSizes.length, currentPage, progress.viewed, goToPage]);

    const pageCount = pageSizes.length;
    useKeyboardShortcuts({
        j: () => goToPage(Math.min(pageCount, currentPage + 1)),
        k: () => goToPage(Math.max(1, currentPage - 1)),
        PageDown: () => goToPage(Math.min(pageCount, currentPage + 1)),
        PageUp: () => goToPage(Math.max(1, currentPage - 1)),
        Home: () => goToPage(1),
        End: () => goToPage(pageCount),
        n: () => stepAnnotation(1),
        p: () => stepAnnotation(-1),
        u: nextUnviewed,
        f: fullscreen.toggle,
        '+': () => zoomBy(1),
        '=': () => zoomBy(1),
        '-': () => zoomBy(-1),
        0: () => setZoom('fit-width'),
        9: () => setZoom('fit-page'),
        v: () => setTool('select'),
        s: () => setTool('sticky'),
        a: () => setTool('area'),
        g: () => onDraft({ pageNumber: currentPage, placemark: { type__sys: 'page_level__sys', page_number__sys: currentPage } }),
        '[': () => setPanelOpen((o) => !o),
        '/': () => searchInputRef.current?.focus(),
        '?': () => setShowHelp((s) => !s),
        Escape: () => {
            if (showHelp) setShowHelp(false);
            else if (draft) setDraft(null);
            else if (tool !== 'select') setTool('select');
            else if (selectedId) setSelectedId(null);
            else if (fullscreen.mode === 'immersive') fullscreen.exit();
        },
    }, loadState.phase === 'ready');

    // ---- render ----------------------------------------------------------------------------
    const rootClass = [
        'rm-workspace',
        fullscreen.isFullscreen ? 'is-fullscreen' : '',
        fullscreen.mode === 'immersive' ? 'is-immersive' : '',
        panelOpen ? '' : 'is-panel-closed',
    ].filter(Boolean).join(' ');

    return (
        <div ref={rootRef} className={rootClass}>
            <header className="rm-toolbar" role="toolbar" aria-label="Review tools">
                <div className="rm-toolbar__group rm-toolbar__doc">
                    <button type="button" className="rm-btn rm-btn--icon" onClick={onExit} title="Back to document list">
                        <Icon name="back" />
                    </button>
                    <div className="rm-doc-title">
                        <span className="rm-doc-title__name" title={doc?.name}>{doc?.name || 'Loading…'}</span>
                        {doc && (
                            <span className="rm-doc-title__meta">
                                {doc.number} · v{doc.major}.{doc.minor} · <span className="rm-status">{doc.status}</span>
                            </span>
                        )}
                    </div>
                </div>

                <div className="rm-toolbar__group">
                    <button type="button" className="rm-btn rm-btn--icon" onClick={() => goToPage(Math.max(1, currentPage - 1))} title="Previous page (K)">
                        <Icon name="up" />
                    </button>
                    <PageInput current={currentPage} total={pageCount} onGo={(n) => goToPage(n)} />
                    <button type="button" className="rm-btn rm-btn--icon" onClick={() => goToPage(Math.min(pageCount, currentPage + 1))} title="Next page (J)">
                        <Icon name="down" />
                    </button>
                </div>

                <div className="rm-toolbar__group">
                    <button type="button" className="rm-btn rm-btn--icon" onClick={() => zoomBy(-1)} title="Zoom out (-)">
                        <Icon name="minus" />
                    </button>
                    <span className="rm-zoom" aria-live="polite">{Math.round(scale * 100)}%</span>
                    <button type="button" className="rm-btn rm-btn--icon" onClick={() => zoomBy(1)} title="Zoom in (+)">
                        <Icon name="plus" />
                    </button>
                    <button type="button" className={`rm-btn${zoom === 'fit-width' ? ' is-active' : ''}`} onClick={() => setZoom('fit-width')} title="Fit width (0)">Width</button>
                    <button type="button" className={`rm-btn${zoom === 'fit-page' ? ' is-active' : ''}`} onClick={() => setZoom('fit-page')} title="Fit page (9)">Page</button>
                </div>

                <div className="rm-toolbar__group" role="radiogroup" aria-label="Annotation tool">
                    <ToolButton id="select" tool={tool} setTool={setTool} icon="cursor" label="Select (V)" />
                    <ToolButton id="sticky" tool={tool} setTool={setTool} icon="sticky" label="Sticky note (S)" />
                    <ToolButton id="area" tool={tool} setTool={setTool} icon="area" label="Area note (A)" />
                    <button
                        type="button"
                        className="rm-btn rm-btn--icon"
                        onClick={() => onDraft({ pageNumber: currentPage, placemark: { type__sys: 'page_level__sys', page_number__sys: currentPage } })}
                        title="Page note on current page (G)"
                    >
                        <Icon name="page" />
                    </button>
                </div>

                <div className="rm-toolbar__group rm-toolbar__search">
                    <Icon name="search" />
                    <input
                        ref={searchInputRef}
                        type="search"
                        placeholder="Search document text  /"
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            if (e.target.value) {
                                setPanel('search');
                                setPanelOpen(true);
                            }
                        }}
                        onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
                        aria-label="Search document text"
                    />
                </div>

                <div className="rm-toolbar__group rm-toolbar__end">
                    {doc && (
                        <a className="rm-btn rm-btn--icon" href={api.vaultDocumentUrl(doc)} target="_blank" rel="noreferrer" title="Open in the standard Vault viewer (complete tasks, compare, claims)">
                            <Icon name="external" />
                        </a>
                    )}
                    <button type="button" className="rm-btn rm-btn--icon" onClick={() => setShowHelp(true)} title="Keyboard shortcuts (?)">
                        <Icon name="keyboard" />
                    </button>
                    <button type="button" className={`rm-btn rm-btn--icon${panelOpen ? ' is-active' : ''}`} onClick={() => setPanelOpen((o) => !o)} title="Toggle side panel ([)">
                        <Icon name="panel" />
                    </button>
                    <button type="button" className="rm-btn rm-btn--primary" onClick={fullscreen.toggle} title="Full screen (F)">
                        <Icon name={fullscreen.isFullscreen ? 'collapse' : 'expand'} />
                        <span>{fullscreen.isFullscreen ? 'Exit full screen' : 'Full screen'}</span>
                    </button>
                </div>
            </header>

            <div className="rm-body">
                <main
                    ref={setScrollEl}
                    className="rm-viewer"
                    onClick={(e) => e.target === e.currentTarget && setSelectedId(null)}
                    aria-label="Document pages"
                >
                    {loadState.phase !== 'ready' && (
                        <div className={`rm-viewer__state${loadState.phase === 'error' ? ' is-error' : ''}`}>
                            {loadState.phase === 'loading' && <div className="rm-spinner" aria-hidden="true" />}
                            <p>{loadState.message}</p>
                            {loadState.phase === 'error' && (
                                <p className="rm-muted">
                                    Review Mode needs a PDF viewable rendition. Video, audio and HTML documents open in the standard viewer.
                                    {doc && (
                                        <>
                                            {' '}
                                            <a href={api.vaultDocumentUrl(doc)} target="_blank" rel="noreferrer">Open in Vault</a>
                                        </>
                                    )}
                                </p>
                            )}
                        </div>
                    )}
                    {loadState.phase === 'ready' && (
                        <div className="rm-pages" style={{ gap: PAGE_GAP, padding: PAGE_GAP }}>
                            {pageSizes.map((size, i) => (
                                <PageView
                                    key={i + 1}
                                    pdfDoc={pdfDoc}
                                    pageNumber={i + 1}
                                    baseSize={size}
                                    scale={scale}
                                    scrollRoot={scrollEl}
                                    annotations={byPage.get(i + 1) || EMPTY}
                                    selectedId={selectedId}
                                    onSelect={select}
                                    tool={tool}
                                    onDraft={onDraft}
                                    draft={draft}
                                    searchTerm={searchTerm}
                                    viewed={progress.viewed.has(i + 1)}
                                    onVisibility={onVisibility}
                                    registerElement={registerElement}
                                />
                            ))}
                        </div>
                    )}
                </main>

                {panelOpen && (
                    <aside className="rm-panel" aria-label="Review panel">
                        <div className="rm-tabs" role="tablist">
                            <button type="button" role="tab" aria-selected={panel === 'comments'} className={`rm-tab${panel === 'comments' ? ' is-active' : ''}`} onClick={() => setPanel('comments')}>
                                Annotations <span className="rm-count">{visible.length}</span>
                            </button>
                            <button type="button" role="tab" aria-selected={panel === 'search'} className={`rm-tab${panel === 'search' ? ' is-active' : ''}`} onClick={() => setPanel('search')}>
                                Search
                            </button>
                        </div>
                        {panel === 'comments' && (
                            <AnnotationPanel
                                doc={doc}
                                all={sorted}
                                visible={visible}
                                filters={filters}
                                setFilters={setFilters}
                                selectedId={selectedId}
                                onSelect={select}
                                userNames={userNames}
                                currentUser={user}
                                draft={draft}
                                onSaveDraft={saveDraft}
                                onCancelDraft={() => setDraft(null)}
                                onSetState={setState}
                                onReplied={reloadAnnotations}
                            />
                        )}
                        {panel === 'search' && pdfDoc && (
                            <SearchPanel pdfDoc={pdfDoc} term={searchTerm} onGo={(n) => goToPage(n, 'smooth')} currentPage={currentPage} />
                        )}
                    </aside>
                )}
            </div>

            {loadState.phase === 'ready' && (
                <CoverageBar
                    total={pageCount}
                    viewed={progress.viewed}
                    currentPage={currentPage}
                    annotationPages={byPage}
                    onGo={(n) => goToPage(n, 'smooth')}
                    onNextUnviewed={nextUnviewed}
                    onReset={progress.reset}
                />
            )}

            {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}
        </div>
    );
}

const EMPTY = [];

function ToolButton({ id, tool, setTool, icon, label }) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={tool === id}
            className={`rm-btn rm-btn--icon${tool === id ? ' is-active' : ''}`}
            onClick={() => setTool(id)}
            title={label}
        >
            <Icon name={icon} />
        </button>
    );
}

function PageInput({ current, total, onGo }) {
    const [value, setValue] = useState(String(current));
    const [editing, setEditing] = useState(false);
    useEffect(() => {
        if (!editing) setValue(String(current));
    }, [current, editing]);
    return (
        <span className="rm-pageinput">
            <input
                value={value}
                inputMode="numeric"
                aria-label="Page number"
                onFocus={(e) => {
                    setEditing(true);
                    e.target.select();
                }}
                onBlur={() => setEditing(false)}
                onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        const n = Math.min(total, Math.max(1, Number(value) || 1));
                        onGo(n);
                        e.currentTarget.blur();
                    }
                }}
            />
            <span className="rm-muted">/ {total || '–'}</span>
        </span>
    );
}
