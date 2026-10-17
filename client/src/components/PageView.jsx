import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { RenderingCancelledException, TextLayer } from '../pdf/pdfjs';
import { placemarkToShapes, rectanglePlacemark, stickyPlacemark } from '../pdf/geometry';
import { colorHex, isResolved, typeFamily, typeLabel } from '../annotations';

const VISIBILITY_THRESHOLDS = Array.from({ length: 11 }, (_, i) => i / 10);
const MIN_AREA_PX = 8;

function AnnotationMark({ annotation, viewport, selected, onSelect }) {
    const family = typeFamily(annotation.type__sys);
    const shapes = placemarkToShapes(annotation.placemark, viewport);
    const color = colorHex(annotation.color__sys, family);
    const className = `rm-mark rm-mark--${family}${selected ? ' is-selected' : ''}${isResolved(annotation) ? ' is-resolved' : ''}`;
    const title = `${typeLabel(annotation.type__sys)}${annotation.comment__sys ? `: ${annotation.comment__sys}` : ''}`;
    const handleClick = (event) => {
        event.stopPropagation();
        onSelect(annotation.id__sys);
    };

    if (shapes.kind === 'point') {
        return (
            <button
                type="button"
                className={`${className} rm-mark--sticky`}
                style={{ left: shapes.left, top: shapes.top, '--mark-color': color }}
                title={title}
                aria-label={title}
                onClick={handleClick}
                data-annotation-id={annotation.id__sys}
            />
        );
    }
    if (shapes.kind === 'rects') {
        return shapes.rects.map((r, i) => (
            <div
                key={i}
                role="button"
                tabIndex={-1}
                className={className}
                style={{ left: r.left, top: r.top, width: r.width, height: r.height, '--mark-color': color }}
                title={title}
                onClick={handleClick}
                data-annotation-id={i === 0 ? annotation.id__sys : undefined}
            />
        ));
    }
    return null;
}

function DraftMark({ placemark, viewport }) {
    const shapes = placemarkToShapes(placemark, viewport);
    if (shapes.kind === 'point') return <div className="rm-mark rm-mark--sticky rm-mark--draft" style={{ left: shapes.left, top: shapes.top }} />;
    if (shapes.kind === 'rects') {
        return shapes.rects.map((r, i) => (
            <div key={i} className="rm-mark rm-mark--draft" style={{ left: r.left, top: r.top, width: r.width, height: r.height }} />
        ));
    }
    return null;
}

function PageView({
    pdfDoc,
    pageNumber,
    baseSize,
    scale,
    scrollRoot,
    annotations,
    selectedId,
    onSelect,
    tool,
    onDraft,
    draft,
    searchTerm,
    viewed,
    onVisibility,
    registerElement,
}) {
    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const textRef = useRef(null);
    const [page, setPage] = useState(null);
    const [near, setNear] = useState(false);
    const [textReady, setTextReady] = useState(0);
    const [dragRect, setDragRect] = useState(null);
    const dragStart = useRef(null);

    const width = Math.floor(baseSize.width * scale);
    const height = Math.floor(baseSize.height * scale);

    useEffect(() => {
        registerElement(pageNumber, containerRef.current);
        return () => registerElement(pageNumber, null);
    }, [pageNumber, registerElement]);

    // Only pages near the viewport hold a canvas; long documents stay light.
    useEffect(() => {
        const el = containerRef.current;
        if (!el || !scrollRoot) return undefined;
        const nearObserver = new IntersectionObserver(
            ([entry]) => setNear(entry.isIntersecting),
            { root: scrollRoot, rootMargin: '150% 0px 150% 0px' },
        );
        const visibleObserver = new IntersectionObserver(
            ([entry]) => {
                // Coverage handles pages taller than the viewport, whose ratio never reaches 0.5.
                const rootHeight = entry.rootBounds?.height || 0;
                const coverage = rootHeight ? entry.intersectionRect.height / rootHeight : 0;
                onVisibility(pageNumber, entry.intersectionRatio, coverage);
            },
            { root: scrollRoot, threshold: VISIBILITY_THRESHOLDS },
        );
        nearObserver.observe(el);
        visibleObserver.observe(el);
        return () => {
            nearObserver.disconnect();
            visibleObserver.disconnect();
        };
    }, [scrollRoot, pageNumber, onVisibility]);

    useEffect(() => {
        let cancelled = false;
        pdfDoc.getPage(pageNumber).then((p) => !cancelled && setPage(p));
        return () => {
            cancelled = true;
        };
    }, [pdfDoc, pageNumber]);

    const viewport = useMemo(() => (page ? page.getViewport({ scale }) : null), [page, scale]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const textDiv = textRef.current;
        if (!page || !viewport || !near || !canvas || !textDiv) {
            if (canvas && !near) {
                canvas.width = 0;
                canvas.height = 0;
            }
            if (textDiv && !near) textDiv.replaceChildren();
            return undefined;
        }
        const outputScale = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        const renderTask = page.render({
            canvasContext: canvas.getContext('2d', { alpha: false }),
            canvas,
            viewport,
            transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        });
        renderTask.promise.catch((e) => {
            if (!(e instanceof RenderingCancelledException)) console.error('[review-mode] render failed', e);
        });

        textDiv.replaceChildren();
        const textLayer = new TextLayer({ textContentSource: page.streamTextContent(), container: textDiv, viewport });
        let active = true;
        textLayer.render().then(() => active && setTextReady((n) => n + 1)).catch(() => {});

        return () => {
            active = false;
            renderTask.cancel();
            textLayer.cancel();
        };
    }, [page, viewport, near]);

    // Highlight search hits in the text layer, wrapping only the matched characters.
    useEffect(() => {
        const textDiv = textRef.current;
        if (!textDiv) return;
        const needle = searchTerm?.trim().toLowerCase();
        textDiv.querySelectorAll('span[role="presentation"]').forEach((span) => {
            if (span.dataset.rmText !== undefined) {
                span.textContent = span.dataset.rmText;
                delete span.dataset.rmText;
            }
            if (!needle || needle.length < 2) return;
            const text = span.textContent;
            const lower = text.toLowerCase();
            if (!lower.includes(needle)) return;
            span.dataset.rmText = text;
            const parts = [];
            let from = 0;
            for (let idx = lower.indexOf(needle); idx !== -1; idx = lower.indexOf(needle, from)) {
                if (idx > from) parts.push(document.createTextNode(text.slice(from, idx)));
                const mark = document.createElement('span');
                mark.className = 'rm-hit';
                mark.textContent = text.slice(idx, idx + needle.length);
                parts.push(mark);
                from = idx + needle.length;
            }
            if (from < text.length) parts.push(document.createTextNode(text.slice(from)));
            span.replaceChildren(...parts);
        });
    }, [searchTerm, textReady]);

    const localPoint = (event) => {
        const rect = containerRef.current.getBoundingClientRect();
        return [event.clientX - rect.left, event.clientY - rect.top];
    };

    const onPointerDown = (event) => {
        if (tool !== 'area' || !viewport || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragStart.current = localPoint(event);
        setDragRect(null);
    };
    const onPointerMove = (event) => {
        if (!dragStart.current) return;
        const [x0, y0] = dragStart.current;
        const [x1, y1] = localPoint(event);
        setDragRect({ left: Math.min(x0, x1), top: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) });
    };
    const onPointerUp = (event) => {
        if (!dragStart.current) return;
        const [x0, y0] = dragStart.current;
        const [x1, y1] = localPoint(event);
        dragStart.current = null;
        setDragRect(null);
        if (Math.abs(x1 - x0) < MIN_AREA_PX || Math.abs(y1 - y0) < MIN_AREA_PX) return;
        onDraft({ pageNumber, placemark: rectanglePlacemark(viewport, pageNumber, x0, y0, x1, y1) });
    };
    const onClick = (event) => {
        if (tool !== 'sticky' || !viewport) return;
        const [x, y] = localPoint(event);
        onDraft({ pageNumber, placemark: stickyPlacemark(viewport, pageNumber, x, y) });
    };

    const pageLevelCount = viewport
        ? annotations.filter((a) => placemarkToShapes(a.placemark, viewport).kind === 'page').length
        : 0;

    return (
        <div
            ref={containerRef}
            className={`rm-page${tool !== 'select' ? ` rm-page--tool-${tool}` : ''}`}
            style={{ width, height, '--total-scale-factor': scale }}
            data-page-number={pageNumber}
            aria-label={`Page ${pageNumber}`}
        >
            <canvas ref={canvasRef} className="rm-page__canvas" style={{ width, height }} />
            <div ref={textRef} className="textLayer" />
            <div
                className="rm-page__overlay"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onClick={onClick}
            >
                {viewport && annotations.map((a) => (
                    <AnnotationMark
                        key={a.id__sys}
                        annotation={a}
                        viewport={viewport}
                        selected={a.id__sys === selectedId}
                        onSelect={onSelect}
                    />
                ))}
                {viewport && draft?.pageNumber === pageNumber && <DraftMark placemark={draft.placemark} viewport={viewport} />}
                {dragRect && <div className="rm-mark rm-mark--draft" style={dragRect} />}
            </div>
            <div className="rm-page__badges">
                <span className={`rm-page__number${viewed ? ' is-viewed' : ''}`}>
                    {viewed ? '✓ ' : ''}
                    {pageNumber}
                </span>
                {pageLevelCount > 0 && (
                    <span className="rm-page__pagelevel" title="Page-level annotations">
                        {pageLevelCount} page note{pageLevelCount === 1 ? '' : 's'}
                    </span>
                )}
            </div>
        </div>
    );
}

export default memo(PageView);
