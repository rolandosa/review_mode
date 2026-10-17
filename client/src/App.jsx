import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as api from './api/vault';
import DocumentPicker from './components/DocumentPicker';
import ReviewWorkspace from './components/ReviewWorkspace';

/**
 * Reads `doc` (and optional `version`, e.g. `1.0`) from the Custom Page URL, such as
 * `/ui/#custom/page/review-mode?doc=1845&version=0.3`. Vault routes Custom Pages through the
 * URL hash, so parameters may sit in either the hash or the regular query string.
 */
export function parseDocRef(href) {
    try {
        const url = new URL(href);
        const hashQuery = url.hash.includes('?') ? url.hash.slice(url.hash.indexOf('?') + 1) : '';
        const params = new URLSearchParams(hashQuery || url.search);
        const id = params.get('doc') || params.get('docId') || params.get('id');
        if (!id || !/^\d+$/.test(id)) return null;
        const version = params.get('version');
        const match = version && /^(\d+)\.(\d+)$/.exec(version);
        return match ? { id, major: Number(match[1]), minor: Number(match[2]) } : { id };
    } catch {
        return null;
    }
}

export default function App({ initialDocRef }) {
    const [user, setUser] = useState(null);
    const [error, setError] = useState(null);
    const [docRef, setDocRef] = useState(initialDocRef);
    const rootRef = useRef(null);

    // The page renders below the Vault header (unless the Page hides it); size the workspace to
    // the remaining viewport height so pages scroll inside the viewer, not the whole window.
    useLayoutEffect(() => {
        const el = rootRef.current;
        if (!el) return undefined;
        const update = () => {
            const top = el.getBoundingClientRect().top + window.scrollY;
            el.style.setProperty('--rm-offset', `${Math.max(0, Math.round(top))}px`);
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [user, error]);

    useEffect(() => {
        api.getCurrentUser().then(setUser).catch((e) => setError(e.message));
    }, []);



    if (error) return <div className="rm-root" ref={rootRef}><div className="rm-error rm-error--page">Could not start Review Mode: {error}</div></div>;
    if (!user) return <div className="rm-root" ref={rootRef}><div className="rm-viewer__state"><div className="rm-spinner" /></div></div>;

    return (
        <div className="rm-root" ref={rootRef}>
            {docRef
                ? <ReviewWorkspace key={`${docRef.id}-${docRef.major}-${docRef.minor}`} docRef={docRef} user={user} onExit={() => setDocRef(null)} />
                : <DocumentPicker user={user} onOpen={setDocRef} />}
        </div>
    );
}
