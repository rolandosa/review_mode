import { useCallback, useEffect, useState } from 'react';

function storageKey(doc, userId) {
    return `review-mode:viewed:${userId}:${doc.versionId}`;
}

function load(key) {
    try {
        const raw = window.localStorage.getItem(key);
        return new Set(raw ? JSON.parse(raw) : []);
    } catch {
        return new Set();
    }
}

/**
 * Tracks which pages the reviewer has actually looked at for this document version, so they
 * can confirm full coverage before completing a review task. Stored per user and version in
 * this browser only; it is a reviewer aid, not an audit record.
 */
export default function useReviewProgress(doc, userId) {
    const key = storageKey(doc, userId);
    const [viewed, setViewed] = useState(() => load(key));

    useEffect(() => setViewed(load(key)), [key]);

    const markViewed = useCallback((pageNumber) => {
        setViewed((prev) => {
            if (prev.has(pageNumber)) return prev;
            const next = new Set(prev).add(pageNumber);
            try {
                window.localStorage.setItem(key, JSON.stringify([...next]));
            } catch {
                // storage unavailable; keep in memory
            }
            return next;
        });
    }, [key]);

    const reset = useCallback(() => {
        try {
            window.localStorage.removeItem(key);
        } catch {
            // ignore
        }
        setViewed(new Set());
    }, [key]);

    return { viewed, markViewed, reset };
}
