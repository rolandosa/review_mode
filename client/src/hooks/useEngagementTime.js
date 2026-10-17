import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api/vault';

/** Without input for this long, the reviewer counts as idle (reading a dense page is still active). */
export const IDLE_AFTER_MS = 60_000;
const TICK_MS = 1000;
const SAVE_EVERY_MS = 30_000;
const POINTER_THROTTLE_MS = 250;
const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'wheel', 'scroll', 'keydown', 'touchstart', 'input'];

/**
 * Measures how long a reviewer actually works a document while it is on one of their open
 * workflow tasks, and saves it to a `review_time_log__c` record (one per review session).
 *
 * A second counts as active only when the page is visible, the browser window has focus, and
 * the reviewer interacted with the workspace (mouse, scroll, keys, touch, typing, annotating)
 * within IDLE_AFTER_MS. Open-but-idle time is kept separately as `open_seconds__c`.
 */
export default function useEngagementTime({ doc, userId, rootRef, pagesViewed }) {
    const [task, setTask] = useState(null);
    const [status, setStatus] = useState('checking'); // checking | off | tracking | error
    const [activeSeconds, setActiveSeconds] = useState(0);
    const [isActive, setIsActive] = useState(false);

    const counters = useRef({ active: 0, open: 0, annotations: 0, replies: 0 });
    const lastInput = useRef(0);
    const sessionStart = useRef(null);
    const lastActivityAt = useRef(null);
    const recordId = useRef(null);
    const saving = useRef(null);
    const lastSavedKey = useRef(null);
    const pagesRef = useRef(pagesViewed);
    pagesRef.current = pagesViewed;

    // Only documents on one of the reviewer's open tasks are tracked.
    useEffect(() => {
        if (!doc) return undefined;
        let cancelled = false;
        api.findMyTaskForDocument(doc.id)
            .then((found) => {
                if (cancelled) return;
                setTask(found);
                setStatus(found ? 'tracking' : 'off');
            })
            .catch((e) => {
                console.warn('[review-mode] task lookup failed; time tracking off', e);
                if (!cancelled) setStatus('off');
            });
        return () => {
            cancelled = true;
        };
    }, [doc]);

    const markInput = useCallback(() => {
        lastInput.current = Date.now();
    }, []);

    /** Annotation work counts as activity and is tallied on the log. */
    const recordAction = useCallback((kind) => {
        markInput();
        if (kind === 'annotation') counters.current.annotations += 1;
        if (kind === 'reply') counters.current.replies += 1;
    }, [markInput]);

    const writeLog = useCallback(async (keepalive) => {
        if (!task || !doc || counters.current.active === 0) return;
        const c = counters.current;
        // pagehide and visibilitychange often fire together; skip saves that would change nothing.
        const key = [c.active, c.open, c.annotations, c.replies, pagesRef.current].join(':');
        if (recordId.current && key === lastSavedKey.current) return;
        const fields = {
            active_seconds__c: c.active,
            open_seconds__c: c.open,
            annotations_created__c: c.annotations,
            replies_added__c: c.replies,
            pages_viewed__c: pagesRef.current,
            last_activity__c: lastActivityAt.current,
        };
        if (!recordId.current) {
            Object.assign(fields, {
                name__v: `${doc.number || doc.id} v${doc.major}.${doc.minor} · ${task.label || 'Review'}`.slice(0, 128),
                document_id__c: Number(doc.id),
                document_version__c: `${doc.major}.${doc.minor}`,
                document_number__c: doc.number,
                workflow_id__c: task.workflowId,
                task_id__c: task.id,
                task_label__c: task.label?.slice(0, 255),
                session_start__c: sessionStart.current,
            });
        }
        const previousKey = lastSavedKey.current;
        lastSavedKey.current = key;
        try {
            recordId.current = await api.saveTimeLog(recordId.current, fields, { keepalive });
            setStatus('tracking');
        } catch (e) {
            // A keepalive save while the page unloads is delivered even though its response
            // never reaches us; only retry saves made while the reviewer is still here.
            if (!keepalive) {
                lastSavedKey.current = previousKey;
                console.error('[review-mode] time log save failed', e);
                setStatus('error');
            }
        }
    }, [task, doc]);

    // Saves run one at a time so the first one can create the record before others update it.
    const save = useCallback(({ keepalive = false } = {}) => {
        saving.current = (saving.current || Promise.resolve()).then(() => writeLog(keepalive));
        return saving.current;
    }, [writeLog]);

    // Input listeners live on the workspace so activity elsewhere in Vault doesn't count.
    useEffect(() => {
        const root = rootRef.current;
        if (!task || !root) return undefined;
        let lastPointer = 0;
        const onEvent = (event) => {
            if (event.type === 'pointermove') {
                const now = Date.now();
                if (now - lastPointer < POINTER_THROTTLE_MS) return;
                lastPointer = now;
            }
            markInput();
        };
        ACTIVITY_EVENTS.forEach((type) => root.addEventListener(type, onEvent, { capture: true, passive: true }));
        // Shortcuts are handled on window; count them too while the workspace is open.
        window.addEventListener('keydown', markInput, { passive: true });
        markInput();
        return () => {
            ACTIVITY_EVENTS.forEach((type) => root.removeEventListener(type, onEvent, { capture: true }));
            window.removeEventListener('keydown', markInput);
        };
    }, [task, rootRef, markInput]);

    // One-second clock: accrue open and active time.
    useEffect(() => {
        if (!task) return undefined;
        const timer = setInterval(() => {
            if (document.visibilityState !== 'visible') {
                setIsActive(false);
                return;
            }
            counters.current.open += 1;
            const active = document.hasFocus() && Date.now() - lastInput.current <= IDLE_AFTER_MS;
            setIsActive(active);
            if (!active) return;
            const nowIso = new Date().toISOString();
            if (!sessionStart.current) sessionStart.current = nowIso;
            lastActivityAt.current = nowIso;
            counters.current.active += 1;
            setActiveSeconds(counters.current.active);
        }, TICK_MS);
        return () => clearInterval(timer);
    }, [task]);

    // Periodic save, plus a final save when the reviewer leaves or hides the page.
    useEffect(() => {
        if (!task) return undefined;
        const interval = setInterval(() => save(), SAVE_EVERY_MS);
        const onHide = () => {
            if (document.visibilityState === 'hidden') save({ keepalive: true });
        };
        const onPageHide = () => save({ keepalive: true });
        document.addEventListener('visibilitychange', onHide);
        window.addEventListener('pagehide', onPageHide);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('pagehide', onPageHide);
            save({ keepalive: true });
        };
    }, [task, save]);

    return { task, status, activeSeconds, isActive, recordAction };
}

export function formatDuration(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
