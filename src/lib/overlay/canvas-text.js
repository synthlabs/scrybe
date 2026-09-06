import { paddingPixels } from "./layout-math.js";

const CAPTION_FONT_FAMILY =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';
const CAPTION_FONT_WEIGHT = 500;
const CAPTION_LINE_HEIGHT = 1.4;

/** @param {unknown} value */
function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

/**
 * Finds transparent pixels that are fully enclosed by opaque pixels.
 *
 * @param {Uint8ClampedArray | Uint8Array} rgba
 * @param {number} width
 * @param {number} height
 * @param {number} [alphaThreshold]
 */
export function enclosedTransparentPixels(
    rgba,
    width,
    height,
    alphaThreshold = 8,
) {
    const safeWidth = Math.max(0, Math.floor(finiteNumber(width)));
    const safeHeight = Math.max(0, Math.floor(finiteNumber(height)));
    const total = safeWidth * safeHeight;
    const enclosed = new Uint8Array(total);

    if (total === 0) return enclosed;

    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    /** @param {number} index */
    const isTransparent = (index) =>
        (rgba[index * 4 + 3] ?? 255) <= alphaThreshold;
    /** @param {number} index */
    const enqueue = (index) => {
        if (index < 0 || index >= total) return;
        if (visited[index] || !isTransparent(index)) return;

        visited[index] = 1;
        queue[tail] = index;
        tail += 1;
    };

    for (let x = 0; x < safeWidth; x += 1) {
        enqueue(x);
        enqueue((safeHeight - 1) * safeWidth + x);
    }

    for (let y = 1; y < safeHeight - 1; y += 1) {
        enqueue(y * safeWidth);
        enqueue(y * safeWidth + safeWidth - 1);
    }

    while (head < tail) {
        const index = queue[head];
        head += 1;

        const x = index % safeWidth;
        if (x > 0) enqueue(index - 1);
        if (x < safeWidth - 1) enqueue(index + 1);
        if (index >= safeWidth) enqueue(index - safeWidth);
        if (index < total - safeWidth) enqueue(index + safeWidth);
    }

    for (let index = 0; index < total; index += 1) {
        if (!visited[index] && isTransparent(index)) {
            enclosed[index] = 1;
        }
    }

    return enclosed;
}

/**
 * @param {{ font_size?: number }} style
 * @param {number} [scale]
 */
export function captionFont(style, scale = 1) {
    const size = Math.max(1, finiteNumber(style?.font_size ?? 32) * scale);
    return `${CAPTION_FONT_WEIGHT} ${size}px ${CAPTION_FONT_FAMILY}`;
}

/**
 * @param {{ font_size?: number }} style
 * @param {number} [scale]
 */
export function captionLineHeight(style, scale = 1) {
    return (
        Math.max(1, finiteNumber(style?.font_size ?? 32) * scale) *
        CAPTION_LINE_HEIGHT
    );
}

/**
 * @param {(text: string) => number | { width: number }} measureText
 * @param {string} text
 */
function measureWidth(measureText, text) {
    const result = measureText(text);
    return typeof result === "number" ? result : result.width;
}

/**
 * @param {(text: string) => number | { width: number }} measureText
 * @param {string} word
 * @param {number} maxWidth
 */
function breakLongWord(measureText, word, maxWidth) {
    if (maxWidth <= 0) return [word];

    /** @type {string[]} */
    const chunks = [];
    let current = "";

    for (const char of word) {
        const next = `${current}${char}`;
        if (current && measureWidth(measureText, next) > maxWidth) {
            chunks.push(current);
            current = char;
        } else {
            current = next;
        }
    }

    if (current) chunks.push(current);
    return chunks;
}

/**
 * @param {(text: string) => number | { width: number }} measureText
 * @param {string} paragraph
 * @param {number} maxWidth
 */
function wrapParagraph(measureText, paragraph, maxWidth) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];

    /** @type {string[]} */
    const lines = [];
    let current = "";

    for (const word of words) {
        const candidates =
            maxWidth > 0 && measureWidth(measureText, word) > maxWidth
                ? breakLongWord(measureText, word, maxWidth)
                : [word];

        for (const candidate of candidates) {
            const next = current ? `${current} ${candidate}` : candidate;
            if (
                current &&
                maxWidth > 0 &&
                measureWidth(measureText, next) > maxWidth
            ) {
                lines.push(current);
                current = candidate;
            } else {
                current = next;
            }
        }
    }

    if (current) lines.push(current);
    return lines;
}

/**
 * @param {(text: string) => number | { width: number }} measureText
 * @param {string} text
 * @param {number} maxWidth
 */
export function wrapCanvasText(measureText, text, maxWidth) {
    return String(text)
        .split(/\r?\n/)
        .flatMap((paragraph) =>
            wrapParagraph(measureText, paragraph, maxWidth),
        );
}

/**
 * @param {{ text: string, style: { align?: string, font_size?: number, padding?: string, stroke_width?: number }, width: number, scale?: number, measureText: (text: string) => number | { width: number } }} options
 */
export function captionTextLayout(options) {
    const scale = options.scale ?? 1;
    const padding = paddingPixels(options.style.padding);
    const stroke = Math.max(
        0,
        finiteNumber(options.style.stroke_width ?? 0) * scale,
    );
    const insetX = padding.x * scale + stroke;
    const insetY = padding.y * scale + stroke;
    const available = Math.max(1, options.width - insetX * 2);
    const lines = wrapCanvasText(options.measureText, options.text, available);
    const contentWidth = Math.min(
        available,
        Math.max(
            1,
            ...lines.map((text) => measureWidth(options.measureText, text)),
        ),
    );
    const width = Math.ceil(contentWidth + insetX * 2);
    const lineHeight = captionLineHeight(options.style, scale);
    const height = Math.ceil(lines.length * lineHeight + insetY * 2);
    const align =
        options.style.align === "left" || options.style.align === "right"
            ? options.style.align
            : "center";
    const x =
        align === "left"
            ? insetX
            : align === "right"
              ? width - insetX
              : width / 2;
    return {
        width,
        height,
        align,
        baseline: "top",
        font: captionFont(options.style, scale),
        lineHeight,
        lines: lines.map((text, index) => ({
            text,
            x,
            y: insetY + index * lineHeight,
        })),
    };
}
