import { useEffect, useState } from 'react';
import * as api from '../api/vault';
import { formatDate } from '../annotations';

const RECENT_KEY = 'review-mode:recent';

export function rememberRecent(doc) {
    try {
        const prev = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]').filter((d) => d.id !== doc.id);
        const next = [{ id: doc.id, name: doc.name, number: doc.number, status: doc.status }, ...prev].slice(0, 8);
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
        // storage unavailable
    }
}

function loadRecent() {
    try {
        return JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]');
    } catch {
        return [];
    }
}

function DocRow({ doc, extra, onOpen }) {
    return (
        <li>
            <button type="button" className="rm-docrow" onClick={() => onOpen({ id: String(doc.id) })}>
                <span className="rm-docrow__name">{doc.name__v || doc.name}</span>
                <span className="rm-docrow__meta">
                    {doc.document_number__v || doc.number}
                    {doc.major_version_number__v !== undefined && ` · v${doc.major_version_number__v}.${doc.minor_version_number__v}`}
                    {' · '}
                    {doc.status__v || doc.status}
                    {extra}
                </span>
            </button>
        </li>
    );
}

export default function DocumentPicker({ user, onOpen }) {
    const [tasks, setTasks] = useState({ phase: 'loading', rows: [] });
    const [term, setTerm] = useState('');
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);
    const recent = loadRecent();

    useEffect(() => {
        api.getMyReviewTasks(user.id)
            .then((rows) => setTasks({ phase: 'done', rows }))
            .catch((e) => setTasks({ phase: 'error', rows: [], message: e.message }));
    }, [user.id]);

    const search = async (e) => {
        e.preventDefault();
        setError(null);
        try {
            setResults(await api.searchDocuments(term));
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="rm-picker">
            <div className="rm-picker__inner">
                <h1>Review Mode</h1>
                <p className="rm-muted">A focused, full-screen workspace for reviewing documents. Pick a document to start.</p>

                <form className="rm-picker__search" onSubmit={search}>
                    <input
                        className="rm-input"
                        type="search"
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                        placeholder="Search by name, number, content, or document ID"
                        aria-label="Search documents"
                        autoFocus
                    />
                    <button type="submit" className="rm-btn rm-btn--primary" disabled={!term.trim()}>Search</button>
                </form>
                {error && <div className="rm-error">{error}</div>}
                {results && (
                    <section>
                        <h2>Results</h2>
                        {results.length ? <ul className="rm-doclist">{results.map((d) => <DocRow key={d.id} doc={d} onOpen={onOpen} />)}</ul> : <p className="rm-muted">No documents found.</p>}
                    </section>
                )}

                <section>
                    <h2>My open review tasks</h2>
                    {tasks.phase === 'loading' && <p className="rm-muted">Loading tasks…</p>}
                    {tasks.phase === 'error' && <p className="rm-muted">Tasks unavailable: {tasks.message}</p>}
                    {tasks.phase === 'done' && !tasks.rows.length && <p className="rm-muted">No open workflow tasks on documents.</p>}
                    {tasks.rows.length > 0 && (
                        <ul className="rm-doclist">
                            {tasks.rows.map((t) => (
                                <DocRow
                                    key={`${t.taskId}-${t.docId}`}
                                    doc={t.doc}
                                    onOpen={onOpen}
                                    extra={<> · <strong>{t.label}</strong>{t.due ? ` · due ${formatDate(t.due)}` : ''}</>}
                                />
                            ))}
                        </ul>
                    )}
                </section>

                {recent.length > 0 && (
                    <section>
                        <h2>Recently reviewed</h2>
                        <ul className="rm-doclist">{recent.map((d) => <DocRow key={d.id} doc={d} onOpen={onOpen} />)}</ul>
                    </section>
                )}
            </div>
        </div>
    );
}
