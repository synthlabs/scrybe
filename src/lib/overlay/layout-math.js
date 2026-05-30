/** @typedef {'none' | 'normal' | 'large'} OverlayPadding */
/** @typedef {'left' | 'center' | 'right'} OverlayAlign */
/** @typedef {{ width: number, height: number }} OverlayCanvas */
/** @typedef {{ width: number, height: number }} OverlayViewport */
/** @typedef {{ x: number, y: number, w: number, h: number }} OverlayBox */
/** @typedef {{ align: OverlayAlign, font_size: number, text_color: string, background_color: string, background_opacity: number, border_radius: number, padding: OverlayPadding }} OverlayStyle */
/** @typedef {{ canvas: OverlayCanvas, box: OverlayBox, style: OverlayStyle }} OverlayConfig */

export const MIN_BOX_WIDTH = 200;
export const MIN_BOX_HEIGHT = 60;

export const PADDING_PIXELS = {
    none: 0,
    normal: 24,
    large: 40,
};

export const RESOLUTION_PRESETS = [
    { id: "720p", label: "720p · 1280 × 720", width: 1280, height: 720 },
    { id: "1080p", label: "1080p · 1920 × 1080", width: 1920, height: 1080 },
    { id: "1440p", label: "1440p · 2560 × 1440", width: 2560, height: 1440 },
    { id: "4k", label: "4K · 3840 × 2160", width: 3840, height: 2160 },
    {
        id: "ultrawide",
        label: "Ultrawide · 3440 × 1440",
        width: 3440,
        height: 1440,
    },
    { id: "custom", label: "Custom…", width: 1920, height: 1080 },
];

/** @type {OverlayConfig} */
export const DEFAULT_OVERLAY_CONFIG = {
    canvas: { width: 1920, height: 1080 },
    box: { x: 384, y: 880, w: 1152, h: 100 },
    style: {
        align: "center",
        font_size: 44,
        text_color: "#ffffff",
        background_color: "#000000",
        background_opacity: 55,
        border_radius: 12,
        padding: "normal",
    },
};

/** @param {unknown} value */
export function asFiniteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
export function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/** @param {OverlayCanvas} canvas */
export function clampCanvas(canvas) {
    return {
        width: Math.max(MIN_BOX_WIDTH, Math.round(asFiniteNumber(canvas.width))),
        height: Math.max(MIN_BOX_HEIGHT, Math.round(asFiniteNumber(canvas.height))),
    };
}

/**
 * @param {OverlayBox} box
 * @param {OverlayCanvas} canvas
 */
export function clampBox(box, canvas) {
    const safeCanvas = clampCanvas(canvas);
    const w = clampNumber(
        Math.round(asFiniteNumber(box.w)),
        MIN_BOX_WIDTH,
        safeCanvas.width,
    );
    const h = clampNumber(
        Math.round(asFiniteNumber(box.h)),
        MIN_BOX_HEIGHT,
        safeCanvas.height,
    );

    return {
        x: clampNumber(Math.round(asFiniteNumber(box.x)), 0, safeCanvas.width - w),
        y: clampNumber(
            Math.round(asFiniteNumber(box.y)),
            0,
            safeCanvas.height - h,
        ),
        w,
        h,
    };
}

/** @param {OverlayCanvas} canvas */
export function defaultBox(canvas) {
    const safeCanvas = clampCanvas(canvas);
    const w = Math.round(safeCanvas.width * 0.6);
    const h = Math.round(safeCanvas.height * 0.1);

    return clampBox(
        {
            x: Math.round((safeCanvas.width - w) / 2),
            y: Math.round(safeCanvas.height * 0.82),
            w,
            h,
        },
        safeCanvas,
    );
}

/**
 * @param {OverlayCanvas} canvas
 * @param {OverlayBox} box
 * @param {number} xi
 * @param {number} yi
 */
export function snapBoxToZone(canvas, box, xi, yi) {
    const safeCanvas = clampCanvas(canvas);
    const safeBox = clampBox(box, safeCanvas);
    const margin = Math.min(safeCanvas.width, safeCanvas.height) * 0.04;
    const x =
        xi === 0
            ? margin
            : xi === 1
              ? (safeCanvas.width - safeBox.w) / 2
              : safeCanvas.width - safeBox.w - margin;
    const y =
        yi === 0
            ? margin
            : yi === 1
              ? (safeCanvas.height - safeBox.h) / 2
              : safeCanvas.height - safeBox.h - margin;

    return clampBox({ ...safeBox, x, y }, safeCanvas);
}

/**
 * @param {OverlayCanvas} canvas
 * @param {OverlayViewport} viewport
 */
export function canvasViewportTransform(canvas, viewport) {
    const safeCanvas = clampCanvas(canvas);
    const safeViewport = {
        width: Math.max(1, asFiniteNumber(viewport.width)),
        height: Math.max(1, asFiniteNumber(viewport.height)),
    };
    const scale = Math.min(
        safeViewport.width / safeCanvas.width,
        safeViewport.height / safeCanvas.height,
    );

    return {
        scale,
        x: Math.round((safeViewport.width - safeCanvas.width * scale) / 2),
        y: Math.round((safeViewport.height - safeCanvas.height * scale) / 2),
    };
}

/**
 * @param {OverlayCanvas} canvas
 * @param {OverlayBox} box
 */
export function activeSnapZone(canvas, box) {
    const safeCanvas = clampCanvas(canvas);
    const safeBox = clampBox(box, safeCanvas);
    let best = { xi: 0, yi: 0, distance: Number.POSITIVE_INFINITY };

    for (let yi = 0; yi < 3; yi += 1) {
        for (let xi = 0; xi < 3; xi += 1) {
            const snapped = snapBoxToZone(safeCanvas, safeBox, xi, yi);
            const distance =
                Math.abs(snapped.x - safeBox.x) + Math.abs(snapped.y - safeBox.y);
            if (distance < best.distance) {
                best = { xi, yi, distance };
            }
        }
    }

    return best.distance <= 4 ? { xi: best.xi, yi: best.yi } : null;
}

/**
 * @param {OverlayBox} start
 * @param {string} mode
 * @param {number} dx
 * @param {number} dy
 * @param {OverlayCanvas} canvas
 */
export function resizeBox(start, mode, dx, dy, canvas) {
    /** @type {OverlayBox} */
    let next = { ...start };

    if (mode === "move") {
        next.x = start.x + dx;
        next.y = start.y + dy;
    } else {
        if (mode.includes("e")) next.w = start.w + dx;
        if (mode.includes("w")) {
            next.x = start.x + dx;
            next.w = start.w - dx;
        }
        if (mode.includes("s")) next.h = start.h + dy;
        if (mode.includes("n")) {
            next.y = start.y + dy;
            next.h = start.h - dy;
        }

        if (next.w < MIN_BOX_WIDTH) {
            if (mode.includes("w")) {
                next.x = start.x + start.w - MIN_BOX_WIDTH;
            }
            next.w = MIN_BOX_WIDTH;
        }
        if (next.h < MIN_BOX_HEIGHT) {
            if (mode.includes("n")) {
                next.y = start.y + start.h - MIN_BOX_HEIGHT;
            }
            next.h = MIN_BOX_HEIGHT;
        }
    }

    return clampBox(next, canvas);
}

/** @param {OverlayPadding | string | undefined} padding */
export function normalizePadding(padding) {
    if (padding === "none" || padding === "tight") return "none";
    if (padding === "large" || padding === "wide") return "large";
    return "normal";
}

/** @param {OverlayPadding | string | undefined} padding */
export function paddingPixels(padding) {
    return PADDING_PIXELS[normalizePadding(padding)];
}

/** @param {OverlayPadding | string | undefined} padding */
export function captionAlignItems(padding) {
    return normalizePadding(padding) === "none" ? "flex-start" : "center";
}

/** @param {OverlayCanvas} canvas */
export function resolutionPresetId(canvas) {
    const preset = RESOLUTION_PRESETS.find(
        (item) =>
            item.id !== "custom" &&
            item.width === canvas.width &&
            item.height === canvas.height,
    );
    return preset?.id ?? "custom";
}

/** @param {string} hex */
export function hexToRgb(hex) {
    const normalized = hex.replace(
        /^#?([a-f\d])([a-f\d])([a-f\d])$/i,
        (_match, r, g, b) => `${r}${r}${g}${g}${b}${b}`,
    );
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(
        normalized,
    );

    return result
        ? {
              r: Number.parseInt(result[1], 16),
              g: Number.parseInt(result[2], 16),
              b: Number.parseInt(result[3], 16),
          }
        : { r: 0, g: 0, b: 0 };
}
