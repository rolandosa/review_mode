import { useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api/vault';
import { colorHex, FAMILIES, formatDate, isResolved, NOTE_COLORS, pageOf, typeFamily, typeLabel } from '../annotations';

function placementLabel(placemark) {
    switch (placemark?.type__sys) {
        case 'sticky__sys': return 'sticky note';
        case 'rectangle__sys': return 'area note';
        case 'page_level__sys': return 'page note';
        default: return 'note';
    }
}

function Composer({ draft, onSave, onCancel }) {
    const [comment, setComment] = useState('');
    const [color, setColor] = useState(NOTE_COLORS[0]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const ref = useRef(null);

    useEffect(() => ref.current?.focus(), [draft]);

    const save = async () => {
        if (!comment.trim() || saving) return;
        setSaving(true);
        setError(null);
        try {
            await onSave({ comment: comment.trim(), color });
        } catch (e) {
            setError(e.message);
            setSaving(false);
        }
    };

    return (
        <form
            className="rm-composer"
            onSubmit={(e) => {
                e.preventDefault();
                save();
            }}
        >
            <div className="rm-composer__title">
                New {placementLabel(draft.placemark)} · page {draft.pageNumber}
            </div>
            <textarea
                ref={ref}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Describe the issue or requested change…"
                rows={4}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
                    if (e.key === 'Escape') onCancel();
                }}
            />
            <div className="rm-composer__row">
                <div className="rm-swatches" role="radiogroup" aria-label="Note color">
                    {NOTE_COLORS.map((c) => (
                        <button
                            key={c}
                            type="button"
                            role="radio"
                            aria-checked={color === c}
                            aria-label={c.replace(/_light__sys$/, '')}
                            className={`rm-swatch${color === c ? ' is-active' : ''}`}
                            style={{ background: colorHex(c) }}
                            onClick={() => setColor(c)}
                        />
                    ))}
                </div>
                <div className="rm-composer__actions">
                    <button type="button" className="rm-btn" onClick={onCancel}>Cancel</button>
                    <button type="submit" className="rm-btn rm-btn--primary" disabled={!comment.trim() || saving}>
                        {saving ? 'Saving…' : 'Add note'}
                    </button>
                </div>
            </div>
            <div className="rm-muted rm-small">Ctrl/⌘ + Enter to save · saved to Vault immediately</div>
            {error && <div className="rm-error">{error}</div>}
        </form>
    );
}

function Thread({ doc, annotation, userNames, onReplied }) {
    const [replies, setReplies] = useState(null);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const load = async () => {
        try {
            setReplies(await api.getReplies(doc, annotation.id__sys));
        } catch (e) {
            setError(e.message);
            setReplies([]);
        }
    };

    useEffect(() => {
        if (annotation.reply_count__sys > 0) load();
        else setReplies([]);
    }, [annotation.id__sys, annotation.reply_count__sys]);

    const send = async () => {
        if (!text.trim() || busy) return;
        setBusy(true);
        setError(null);
        try {
            await api.addReply(doc, annotation.id__sys, text.trim());
            setText('');
            await load();
            onReplied();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rm-thread" onClick={(e) => e.stopPropagation()}>
            {replies === null && <div className="rm-muted rm-small">Loading replies…</div>}
            {replies?.map((r) => (
                <div key={r.id__sys} className="rm-reply">
                    <div className="rm-reply__meta">
                        <strong>{userNames[r.created_by_user__sys] || `User ${r.created_by_user__sys}`}</strong>
                        <span className="rm-muted">{formatDate(r.created_date_time__sys)}</span>
                    </div>
                    <div className="rm-reply__body">{r.comment__sys}</div>
                </div>
            ))}
            {typeFamily(annotation.type__sys) === 'note' && (
                <div className="rm-reply-box">
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Reply…"
                        rows={2}
                        onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && send()}
                    />
                    <button type="button" className="rm-btn rm-btn--primary" disabled={!text.trim() || busy} onClick={send}>
                        {busy ? 'Sending…' : 'Reply'}
                    </button>
                </div>
            )}
            {error && <div className="rm-error">{error}</div>}
        </div>
    );
}

function AnnotationCard({ doc, annotation, selected, onSelect, userNames, onSetState, onReplied }) {
    const ref = useRef(null);
    const family = typeFamily(annotation.type__sys);
    const resolved = isResolved(annotation);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (selected) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [selected]);

    const toggleState = async (e) => {
        e.stopPropagation();
        setBusy(true);
        setError(null);
        try {
            await onSetState(annotation, resolved ? 'open__sys' : 'resolved__sys');
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <li
            ref={ref}
            className={`rm-card rm-card--${family}${selected ? ' is-selected' : ''}${resolved ? ' is-resolved' : ''}`}
            onClick={() => onSelect(annotation.id__sys)}
            aria-current={selected ? 'true' : undefined}
        >
            <div className="rm-card__head">
                <span className="rm-dot" style={{ background: colorHex(annotation.color__sys, family) }} />
                <span className="rm-card__type">{typeLabel(annotation.type__sys)}</span>
                <span className="rm-card__author">{userNames[annotation.created_by_user__sys] || ''}</span>
                {resolved && <span className="rm-pill">Resolved</span>}
            </div>
            {annotation.title__sys && <blockquote className="rm-card__quote">{annotation.title__sys}</blockquote>}
            {annotation.comment__sys && <div className="rm-card__comment">{annotation.comment__sys}</div>}
            {annotation.tag_names__sys?.length > 0 && (
                <div className="rm-tags">{annotation.tag_names__sys.map((t) => <span key={t} className="rm-tag">{t}</span>)}</div>
            )}
            <div className="rm-card__foot">
                <span className="rm-muted">{formatDate(annotation.created_date_time__sys)}</span>
                {annotation.reply_count__sys > 0 && <span className="rm-muted">· {annotation.reply_count__sys} repl{annotation.reply_count__sys === 1 ? 'y' : 'ies'}</span>}
                {selected && family === 'note' && (
                    <button type="button" className="rm-btn rm-btn--small" onClick={toggleState} disabled={busy}>
                        {resolved ? 'Reopen' : 'Resolve'}
                    </button>
                )}
            </div>
            {error && <div className="rm-error">{error}</div>}
            {selected && (family === 'note' || annotation.reply_count__sys > 0) && (
                <Thread doc={doc} annotation={annotation} userNames={userNames} onReplied={onReplied} />
            )}
        </li>
    );
}

export default function AnnotationPanel({
    doc,
    all,
    visible,
    filters,
    setFilters,
    selectedId,
    onSelect,
    userNames,
    draft,
    onSaveDraft,
    onCancelDraft,
    onSetState,
    onReplied,
}) {
    const counts = useMemo(() => {
        const c = { open: 0, resolved: 0 };
        FAMILIES.forEach((f) => { c[f.id] = 0; });
        all.forEach((a) => {
            c[typeFamily(a.type__sys)] += 1;
            c[isResolved(a) ? 'resolved' : 'open'] += 1;
        });
        return c;
    }, [all]);

    const grouped = useMemo(() => {
        const groups = [];
        visible.forEach((a) => {
            const n = pageOf(a);
            if (!groups.length || groups[groups.length - 1].page !== n) groups.push({ page: n, items: [] });
            groups[groups.length - 1].items.push(a);
        });
        return groups;
    }, [visible]);

    const toggleFamily = (id) => setFilters((f) => {
        const families = new Set(f.families);
        if (families.has(id)) families.delete(id);
        else families.add(id);
        return { ...f, families };
    });

    return (
        <div className="rm-panel__content">
            {draft && <Composer draft={draft} onSave={onSaveDraft} onCancel={onCancelDraft} />}

            <div className="rm-filters">
                <div className="rm-segmented" role="radiogroup" aria-label="Annotation state">
                    {[
                        ['open', `Open ${counts.open}`],
                        ['all', 'All'],
                        ['resolved', `Resolved ${counts.resolved}`],
                    ].map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            role="radio"
                            aria-checked={filters.state === id}
                            className={filters.state === id ? 'is-active' : ''}
                            onClick={() => setFilters((f) => ({ ...f, state: id }))}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="rm-chips">
                    {FAMILIES.filter((f) => counts[f.id] > 0).map((f) => (
                        <button
                            key={f.id}
                            type="button"
                            aria-pressed={filters.families.has(f.id)}
                            className={`rm-chip rm-chip--${f.id}${filters.families.has(f.id) ? ' is-active' : ''}`}
                            onClick={() => toggleFamily(f.id)}
                        >
                            {f.label} {counts[f.id]}
                        </button>
                    ))}
                    <button
                        type="button"
                        aria-pressed={filters.mine}
                        className={`rm-chip${filters.mine ? ' is-active' : ''}`}
                        onClick={() => setFilters((f) => ({ ...f, mine: !f.mine }))}
                    >
                        Mine
                    </button>
                </div>
                <input
                    type="search"
                    className="rm-input"
                    placeholder="Filter annotations…"
                    value={filters.text}
                    onChange={(e) => setFilters((f) => ({ ...f, text: e.target.value }))}
                    aria-label="Filter annotations"
                />
            </div>

            {grouped.length === 0 && (
                <div className="rm-empty">
                    {all.length === 0
                        ? 'No annotations on this version yet. Press S for a sticky note or A to mark an area.'
                        : 'No annotations match these filters.'}
                </div>
            )}
            <ol className="rm-groups">
                {grouped.map((g) => (
                    <li key={g.page} className="rm-group">
                        <div className="rm-group__label">Page {g.page}</div>
                        <ol className="rm-cards">
                            {g.items.map((a) => (
                                <AnnotationCard
                                    key={a.id__sys}
                                    doc={doc}
                                    annotation={a}
                                    selected={a.id__sys === selectedId}
                                    onSelect={onSelect}
                                    userNames={userNames}
                                    onSetState={onSetState}
                                    onReplied={onReplied}
                                />
                            ))}
                        </ol>
                    </li>
                ))}
            </ol>
        </div>
    );
}
