import { useEffect, useRef } from 'react';

const SECTIONS = [
    ['Navigate', [
        ['J / K', 'Next / previous page'],
        ['Home / End', 'First / last page'],
        ['N / P', 'Next / previous annotation (respects filters)'],
        ['U', 'Next page not yet reviewed'],
        ['/', 'Search document text'],
    ]],
    ['View', [
        ['F', 'Full screen on / off'],
        ['+ / −', 'Zoom in / out'],
        ['0 / 9', 'Fit width / fit page'],
        ['[', 'Show / hide side panel'],
    ]],
    ['Annotate', [
        ['V', 'Select tool'],
        ['S', 'Sticky note: click a spot'],
        ['A', 'Area note: drag a box'],
        ['G', 'Page note on the current page'],
        ['Ctrl/⌘ + Enter', 'Save note or reply'],
        ['Esc', 'Cancel / clear selection'],
    ]],
];

export default function ShortcutHelp({ onClose }) {
    const ref = useRef(null);
    useEffect(() => ref.current?.focus(), []);
    return (
        <div className="rm-modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={onClose}>
            <div className="rm-modal__card" ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
                <div className="rm-modal__head">
                    <h2>Keyboard shortcuts</h2>
                    <button type="button" className="rm-btn" onClick={onClose}>Close</button>
                </div>
                <div className="rm-shortcuts">
                    {SECTIONS.map(([title, rows]) => (
                        <section key={title}>
                            <h3>{title}</h3>
                            <dl>
                                {rows.map(([keys, label]) => (
                                    <div key={keys} className="rm-shortcut">
                                        <dt><kbd>{keys}</kbd></dt>
                                        <dd>{label}</dd>
                                    </div>
                                ))}
                            </dl>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}
