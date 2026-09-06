import { asFiniteNumber, clampCanvas, clampNumber } from "./layout-math.js";

/** @type {import('../bindings').OverlayAnchor[]} */
export const ANCHORS = [
    "top_left",
    "top_center",
    "top_right",
    "middle_left",
    "middle_center",
    "middle_right",
    "bottom_left",
    "bottom_center",
    "bottom_right",
];

/** @param {import('../bindings').OverlayAnchor} anchor */
export function anchorFactors(anchor) {
    const index = ANCHORS.indexOf(anchor);
    return { x: (index % 3) / 2, y: Math.floor(index / 3) / 2 };
}

/**
 * @param {import('../bindings').OverlayLayout} layout
 * @param {import('../bindings').OverlayCanvas} canvas
 */
export function clampLayout(layout, canvas) {
    canvas = clampCanvas(canvas);
    const max_width = clampNumber(
        Math.round(asFiniteNumber(layout.max_width)),
        200,
        canvas.width,
    );
    const anchor = ANCHORS.includes(layout.anchor)
        ? layout.anchor
        : "bottom_center";
    const left = Math.round(max_width * anchorFactors(anchor).x);
    return {
        anchor,
        max_width,
        x: clampNumber(
            Math.round(asFiniteNumber(layout.x)),
            left,
            canvas.width - max_width + left,
        ),
        y: clampNumber(Math.round(asFiniteNumber(layout.y)), 0, canvas.height),
    };
}

/**
 * @param {import('../bindings').OverlayCanvas} canvas
 * @param {import('../bindings').OverlayAnchor} anchor
 * @param {number} max_width
 */
export function snapLayout(canvas, anchor, max_width) {
    const margin = Math.round(Math.min(canvas.width, canvas.height) * 0.04);
    const factor = anchorFactors(anchor);
    const point = (/** @type {number} */ size, /** @type {number} */ at) =>
        at === 0 ? margin : at === 1 ? size - margin : Math.round(size / 2);
    return clampLayout(
        {
            anchor,
            max_width,
            x: point(canvas.width, factor.x),
            y: point(canvas.height, factor.y),
        },
        canvas,
    );
}

/** @param {import('../bindings').OverlayCanvas} canvas */
export function defaultLayout(canvas) {
    return snapLayout(canvas, "bottom_center", Math.round(canvas.width * 0.6));
}

/** @param {import('../bindings').OverlayLayout} layout */
export function placementStyle(layout) {
    const factors = anchorFactors(layout.anchor);
    return `left: ${layout.x}px; top: ${layout.y}px; transform: translate(${-factors.x * 100}%, ${-factors.y * 100}%);`;
}
