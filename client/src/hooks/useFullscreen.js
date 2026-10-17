import { useCallback, useEffect, useState } from 'react';

/**
 * Full-screen for the review workspace.
 *
 * 'browser' uses the Fullscreen API on the workspace element so the document fills the whole
 * monitor. When the API is unavailable or refused (for example, embedded contexts or browser
 * policy), it falls back to 'immersive': a fixed overlay that covers the Vault header and nav
 * inside the browser window.
 */
export default function useFullscreen(targetRef) {
    const [mode, setMode] = useState(null);

    useEffect(() => {
        const onChange = () => {
            if (!document.fullscreenElement) setMode((m) => (m === 'browser' ? null : m));
        };
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    const enter = useCallback(async () => {
        const el = targetRef.current;
        if (el?.requestFullscreen && document.fullscreenEnabled !== false) {
            try {
                await el.requestFullscreen({ navigationUI: 'hide' });
                setMode('browser');
                return;
            } catch (e) {
                console.warn('[review-mode] Fullscreen API refused, using immersive mode', e);
            }
        }
        setMode('immersive');
    }, [targetRef]);

    const exit = useCallback(async () => {
        if (document.fullscreenElement) {
            try {
                await document.exitFullscreen();
            } catch {
                // already exited
            }
        }
        setMode(null);
    }, []);

    const toggle = useCallback(() => (mode ? exit() : enter()), [mode, enter, exit]);

    return { mode, isFullscreen: mode !== null, enter, exit, toggle };
}
