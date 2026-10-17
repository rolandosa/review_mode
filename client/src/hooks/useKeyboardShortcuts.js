import { useEffect, useRef } from 'react';

function isTyping(event) {
    // Custom Pages render inside a shadow root, so event.target is retargeted to the host.
    const origin = event.composedPath?.()[0] || event.target;
    if (!(origin instanceof HTMLElement)) return false;
    return origin.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(origin.tagName);
}

/**
 * Binds single-key shortcuts. `bindings` maps a key (as in KeyboardEvent.key) to a handler.
 * Shortcuts are ignored while the reviewer is typing or holding Ctrl/Cmd/Alt, so browser and
 * OS shortcuts keep working.
 */
export default function useKeyboardShortcuts(bindings, enabled = true) {
    const ref = useRef(bindings);
    ref.current = bindings;

    useEffect(() => {
        if (!enabled) return undefined;
        const onKeyDown = (event) => {
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.key !== 'Escape' && isTyping(event)) return;
            const handler = ref.current[event.key];
            if (handler) {
                event.preventDefault();
                handler(event);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [enabled]);
}
