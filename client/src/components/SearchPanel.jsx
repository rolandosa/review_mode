import { useEffect, useRef, useState } from 'react';

const SNIPPET_RADIUS = 48;
const MAX_SNIPPETS_PER_PAGE = 3;

/** Extracted page text, cached per pdf document. */
const textCache = new WeakMap();

async function pageTexts(pdfDoc) {
    if (!textCache.has(pdfDoc)) {
        textCache.set(pdfDoc, (async () => {
            const texts = [];
            for (let i = 1; i <= pdfDoc.numPages; i++) {
                const page = await pdfDoc.getPage(i);
                const content = await page.getTextContent();
                texts.push(content.items.map((item) => item.str + (item.hasEOL ? '\n' : '')).join(''));
            }
            return texts;
        })());
    }
    return textCache.get(pdfDoc);
}

function findHits(texts, term) {
    const needle = term.toLowerCase();
    const results = [];
    texts.forEach((text, i) => {
        const haystack = text.toLowerCase();
        const snippets = [];
        let count = 0;
        for (let idx = haystack.indexOf(needle); idx !== -1; idx = haystack.indexOf(needle, idx + needle.length)) {
            count += 1;
            if (snippets.length < MAX_SNIPPETS_PER_PAGE) {
                const start = Math.max(0, idx - SNIPPET_RADIUS);
                const end = Math.min(text.length, idx + needle.length + SNIPPET_RADIUS);
                snippets.push({
                    before: (start > 0 ? '…' : '') + text.slice(start, idx).replace(/\s+/g, ' '),
                    match: text.slice(idx, idx + needle.length),
                    after: text.slice(idx + needle.length, end).replace(/\s+/g, ' ') + (end < text.length ? '…' : ''),
                });
            }
        }
        if (count) results.push({ page: i + 1, count, snippets });
    });
    return results;
}

export default function SearchPanel({ pdfDoc, term, onGo, currentPage }) {
    const [state, setState] = useState({ phase: 'idle', results: [] });
    const seq = useRef(0);

    useEffect(() => {
        const trimmed = term.trim();
        if (trimmed.length < 2) {
            setState({ phase: 'idle', results: [] });
            return undefined;
        }
        const id = ++seq.current;
        setState((s) => ({ ...s, phase: 'searching' }));
        const timer = setTimeout(async () => {
            const texts = await pageTexts(pdfDoc);
            if (id === seq.current) setState({ phase: 'done', results: findHits(texts, trimmed) });
        }, 200);
        return () => clearTimeout(timer);
    }, [pdfDoc, term]);

    const total = state.results.reduce((n, r) => n + r.count, 0);

    return (
        <div className="rm-panel__content">
            {state.phase === 'idle' && <div className="rm-empty">Type at least two characters in the search box (press /) to find text across every page.</div>}
            {state.phase === 'searching' && <div className="rm-empty">Searching…</div>}
            {state.phase === 'done' && (
                <>
                    <div className="rm-search-summary">
                        {total ? `${total} match${total === 1 ? '' : 'es'} on ${state.results.length} page${state.results.length === 1 ? '' : 's'}` : 'No matches. Scanned images without a text layer cannot be searched.'}
                    </div>
                    <ol className="rm-cards">
                        {state.results.map((r) => (
                            <li key={r.page} className={`rm-card rm-card--search${r.page === currentPage ? ' is-selected' : ''}`} onClick={() => onGo(r.page)}>
                                <div className="rm-card__head">
                                    <span className="rm-card__type">Page {r.page}</span>
                                    <span className="rm-muted">{r.count} match{r.count === 1 ? '' : 'es'}</span>
                                </div>
                                {r.snippets.map((s, i) => (
                                    <div key={i} className="rm-snippet">
                                        {s.before}
                                        <mark>{s.match}</mark>
                                        {s.after}
                                    </div>
                                ))}
                            </li>
                        ))}
                    </ol>
                </>
            )}
        </div>
    );
}
