/**
 * Page-coverage strip: one cell per page, filled once the reviewer has dwelt on it.
 * Dots mark pages that carry (filtered) annotations. Click a cell to jump to that page.
 */
export default function CoverageBar({ total, viewed, currentPage, annotationPages, onGo, onNextUnviewed, onReset }) {
    const count = viewed.size;
    const pct = total ? Math.round((count / total) * 100) : 0;
    const complete = total > 0 && count >= total;

    return (
        <footer className="rm-coverage" aria-label="Review coverage">
            <div className={`rm-coverage__label${complete ? ' is-complete' : ''}`}>
                {complete ? '✓ All pages reviewed' : `${count} of ${total} pages reviewed (${pct}%)`}
            </div>
            <div className="rm-coverage__cells" role="list">
                {Array.from({ length: total }, (_, i) => {
                    const n = i + 1;
                    const notes = annotationPages.get(n)?.length || 0;
                    return (
                        <button
                            key={n}
                            type="button"
                            role="listitem"
                            className={`rm-cell${viewed.has(n) ? ' is-viewed' : ''}${n === currentPage ? ' is-current' : ''}`}
                            onClick={() => onGo(n)}
                            title={`Page ${n}${viewed.has(n) ? ' · reviewed' : ' · not yet reviewed'}${notes ? ` · ${notes} annotation${notes === 1 ? '' : 's'}` : ''}`}
                        >
                            {notes > 0 && <span className="rm-cell__dot" />}
                        </button>
                    );
                })}
            </div>
            <div className="rm-coverage__actions">
                {!complete && (
                    <button type="button" className="rm-btn rm-btn--small" onClick={onNextUnviewed} title="Next unreviewed page (U)">
                        Next unreviewed
                    </button>
                )}
                <button type="button" className="rm-btn rm-btn--small rm-btn--ghost" onClick={onReset} title="Clear coverage for this version">
                    Reset
                </button>
            </div>
        </footer>
    );
}
