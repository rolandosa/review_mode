/*
 * Vault annotation placemarks use PDF user space: points at 72 DPI with the origin at the
 * bottom-left of the page. `coordinates__sys` holds quad points (8 numbers per rectangle:
 * top-left, top-right, bottom-left, bottom-right) and `y_coordinate__sys` is the TOP edge.
 * pdf.js viewports convert between that space and CSS pixels, including rotation and
 * non-zero media box origins.
 */

function viewportRect(viewport, x1, y1, x2, y2) {
    const [ax, ay, bx, by] = viewport.convertToViewportRectangle([x1, y1, x2, y2]);
    return {
        left: Math.min(ax, bx),
        top: Math.min(ay, by),
        width: Math.abs(bx - ax),
        height: Math.abs(by - ay),
    };
}

/**
 * Returns the on-screen shapes for an annotation on the given page viewport:
 * `{ kind: 'rects', rects: [...] }`, `{ kind: 'point', left, top }` or `{ kind: 'page' }`.
 */
export function placemarkToShapes(placemark, viewport) {
    if (!placemark) return { kind: 'page' };
    const coords = placemark.coordinates__sys;
    if (Array.isArray(coords) && coords.length >= 8) {
        const rects = [];
        for (let i = 0; i + 7 < coords.length; i += 8) {
            const xs = [coords[i], coords[i + 2], coords[i + 4], coords[i + 6]];
            const ys = [coords[i + 1], coords[i + 3], coords[i + 5], coords[i + 7]];
            rects.push(viewportRect(viewport, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)));
        }
        return { kind: 'rects', rects };
    }
    const { x_coordinate__sys: x, y_coordinate__sys: y, width__sys: w, height__sys: h } = placemark;
    if (x == null || y == null) return { kind: 'page' };
    if (w && h) {
        return { kind: 'rects', rects: [viewportRect(viewport, x, y - h, x + w, y)] };
    }
    const [left, top] = viewport.convertToViewportPoint(x, y);
    return { kind: 'point', left, top };
}

/** Bounding box of the shapes, used to scroll an annotation into view. */
export function shapesBounds(shapes) {
    if (shapes.kind === 'point') return { left: shapes.left, top: shapes.top, width: 0, height: 0 };
    if (shapes.kind !== 'rects' || !shapes.rects.length) return null;
    const left = Math.min(...shapes.rects.map((r) => r.left));
    const top = Math.min(...shapes.rects.map((r) => r.top));
    const right = Math.max(...shapes.rects.map((r) => r.left + r.width));
    const bottom = Math.max(...shapes.rects.map((r) => r.top + r.height));
    return { left, top, width: right - left, height: bottom - top };
}

const round = (n) => Math.round(n * 1000) / 1000;

/** Sticky-note placemark at a viewport point. */
export function stickyPlacemark(viewport, pageNumber, vx, vy) {
    const [x, y] = viewport.convertToPdfPoint(vx, vy);
    return {
        type__sys: 'sticky__sys',
        style__sys: 'sticky_icon__sys',
        page_number__sys: pageNumber,
        x_coordinate__sys: round(x),
        y_coordinate__sys: round(y),
    };
}

/** Rectangle placemark from two viewport corners (any drag direction). */
export function rectanglePlacemark(viewport, pageNumber, vx1, vy1, vx2, vy2) {
    const [ax, ay] = viewport.convertToPdfPoint(vx1, vy1);
    const [bx, by] = viewport.convertToPdfPoint(vx2, vy2);
    const left = round(Math.min(ax, bx));
    const right = round(Math.max(ax, bx));
    const top = round(Math.max(ay, by));
    const bottom = round(Math.min(ay, by));
    return {
        type__sys: 'rectangle__sys',
        style__sys: 'rectangle_solid__sys',
        page_number__sys: pageNumber,
        x_coordinate__sys: left,
        y_coordinate__sys: top,
        width__sys: round(right - left),
        height__sys: round(top - bottom),
        coordinates__sys: [left, top, right, top, left, bottom, right, bottom],
    };
}

export function pageLevelPlacemark(pageNumber) {
    return { type__sys: 'page_level__sys', page_number__sys: pageNumber };
}
