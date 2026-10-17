const TYPE_LABELS = {
    note__sys: 'Note',
    anchor__sys: 'Anchor',
    document_link__sys: 'Document link',
    auto_link__sys: 'Auto link',
    suggested_link__sys: 'Suggested link',
    permalink_link__sys: 'Permalink',
    external_link__sys: 'External link',
    line__sys: 'Line',
    approved__sys: 'Approved',
    reply__sys: 'Reply',
};

export function typeLabel(type) {
    if (TYPE_LABELS[type]) return TYPE_LABELS[type];
    const base = String(type || 'annotation').replace(/__(sys|v|c)$/, '').replace(/_/g, ' ');
    return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Type families drive filter chips and overlay styling. */
export function typeFamily(type) {
    if (type === 'note__sys') return 'note';
    if (type === 'anchor__sys') return 'anchor';
    if (/link__sys$/.test(type || '')) return 'link';
    return 'other';
}

export const FAMILIES = [
    { id: 'note', label: 'Notes' },
    { id: 'link', label: 'Links' },
    { id: 'anchor', label: 'Anchors' },
    { id: 'other', label: 'Other' },
];

const VAULT_COLORS = {
    yellow_light__sys: '#f7d64a',
    yellow_dark__sys: '#c99a00',
    green_light__sys: '#7ccf8a',
    green_dark__sys: '#2f8f46',
    orange_light__sys: '#f7a86b',
    orange_dark__sys: '#d0661a',
    pink_light__sys: '#f49ac1',
    pink_dark__sys: '#c63d7c',
    purple_light__sys: '#b9a2f0',
    purple_dark__sys: '#6c4bc7',
    red_light__sys: '#f28b82',
    red_dark__sys: '#c5221f',
    blue_light__sys: '#8ab4f8',
    blue_dark__sys: '#1a73e8',
    gray_light__sys: '#b0b6bd',
    gray_dark__sys: '#5f6368',
};

export const NOTE_COLORS = [
    'yellow_light__sys',
    'green_light__sys',
    'orange_light__sys',
    'pink_light__sys',
    'purple_light__sys',
    'red_light__sys',
];

export function colorHex(color, family) {
    if (VAULT_COLORS[color]) return VAULT_COLORS[color];
    if (family === 'link') return VAULT_COLORS.blue_dark__sys;
    if (family === 'anchor') return VAULT_COLORS.gray_dark__sys;
    return VAULT_COLORS.yellow_light__sys;
}

export function pageOf(annotation) {
    return Number(annotation.placemark?.page_number__sys) || 1;
}

/** Reading order: page, then top-to-bottom (PDF y grows upward), then left-to-right. */
export function compareReadingOrder(a, b) {
    const pa = pageOf(a);
    const pb = pageOf(b);
    if (pa !== pb) return pa - pb;
    const ya = a.placemark?.y_coordinate__sys ?? Infinity;
    const yb = b.placemark?.y_coordinate__sys ?? Infinity;
    if (ya !== yb) return yb - ya;
    return (a.placemark?.x_coordinate__sys ?? 0) - (b.placemark?.x_coordinate__sys ?? 0);
}

export function isResolved(annotation) {
    return annotation.state__sys === 'resolved__sys';
}

export function annotationText(annotation) {
    return [annotation.title__sys, annotation.comment__sys, ...(annotation.tag_names__sys || [])]
        .filter(Boolean)
        .join(' ');
}

export function matchesFilters(annotation, filters, currentUserId) {
    if (!filters.families.has(typeFamily(annotation.type__sys))) return false;
    if (filters.state === 'open' && isResolved(annotation)) return false;
    if (filters.state === 'resolved' && !isResolved(annotation)) return false;
    if (filters.mine && String(annotation.created_by_user__sys) !== String(currentUserId)) return false;
    if (filters.text) {
        const needle = filters.text.toLowerCase();
        if (!annotationText(annotation).toLowerCase().includes(needle)) return false;
    }
    return true;
}

export function formatDate(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
