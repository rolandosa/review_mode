const PATHS = {
    back: 'M15 18l-6-6 6-6',
    up: 'M18 15l-6-6-6 6',
    down: 'M6 9l6 6 6-6',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    cursor: 'M5 3l14 8-6 2-2 6z',
    sticky: 'M5 4h14v10l-5 6H5zM14 20v-6h5',
    area: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4',
    page: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
    external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    keyboard: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8',
    panel: 'M3 4h18v16H3zM15 4v16',
    expand: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
    collapse: 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5',
};

export default function Icon({ name }) {
    return (
        <svg className="rm-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
