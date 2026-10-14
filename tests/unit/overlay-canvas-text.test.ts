import { test } from "vitest";
import assert from "node:assert/strict";
import {
    captionOutline,
    captionTextLayout,
    enclosedTransparentPixels,
    wrapCanvasText,
} from "$lib/overlay/canvas-text.js";

const monospaceMeasure = (text: string) => ({ width: text.length * 10 });

test("captionOutline disables both outline passes at zero width", () => {
    for (const scale of [0.5, 1, 2]) {
        assert.deepEqual(
            captionOutline({ font_size: 32, stroke_width: 0 }, scale),
            {
                lineWidth: 0,
                fillCounters: false,
            },
        );
    }
});

test("captionOutline preserves normal strokes below the counter-fill cutoff", () => {
    for (const stroke_width of [1, 2, 3]) {
        assert.deepEqual(captionOutline({ font_size: 32, stroke_width }), {
            lineWidth: stroke_width * 2,
            fillCounters: false,
        });
    }
});

test("captionOutline fills counters at one eighth of the font size", () => {
    for (const font_size of [16, 32, 44, 64, 96]) {
        const cutoff = font_size / 8;
        assert.equal(
            captionOutline({ font_size, stroke_width: cutoff - 0.01 })
                .fillCounters,
            false,
        );
        assert.equal(
            captionOutline({ font_size, stroke_width: cutoff }).fillCounters,
            true,
        );
        assert.equal(
            captionOutline({ font_size, stroke_width: Math.ceil(cutoff) })
                .fillCounters,
            true,
        );
    }
    assert.equal(
        captionOutline({ font_size: 44, stroke_width: 5 }).fillCounters,
        false,
    );
    assert.equal(
        captionOutline({ font_size: 44, stroke_width: 6 }).fillCounters,
        true,
    );
});

test("captionOutline scales stroke width without changing counter-fill eligibility", () => {
    for (const scale of [0.25, 0.5, 1, 2]) {
        for (const stroke_width of [3, 4, 12]) {
            assert.deepEqual(
                captionOutline({ font_size: 32, stroke_width }, scale),
                {
                    lineWidth: stroke_width * scale * 2,
                    fillCounters: stroke_width >= 4,
                },
            );
        }
    }
});

test("captionOutline disables invalid or nonpositive strokes and scales", () => {
    for (const stroke_width of [-1, NaN, Infinity]) {
        assert.deepEqual(captionOutline({ font_size: 32, stroke_width }), {
            lineWidth: 0,
            fillCounters: false,
        });
    }
    for (const scale of [0, -1, NaN, Infinity]) {
        assert.deepEqual(
            captionOutline({ font_size: 32, stroke_width: 4 }, scale),
            {
                lineWidth: 0,
                fillCounters: false,
            },
        );
    }
});

function rgbaFromAlphaGrid(rows: string[]) {
    const height = rows.length;
    const width = rows[0].length;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            data[(y * width + x) * 4 + 3] = rows[y][x] === "#" ? 255 : 0;
        }
    }

    return { data, width, height };
}

test("wrapCanvasText keeps short text on one line", () => {
    assert.deepEqual(wrapCanvasText(monospaceMeasure, "short text", 200), [
        "short text",
    ]);
});

test("wrapCanvasText wraps long text by words", () => {
    assert.deepEqual(
        wrapCanvasText(monospaceMeasure, "one two three four", 80),
        ["one two", "three", "four"],
    );
});

test("wrapCanvasText breaks overlong words only when unavoidable", () => {
    assert.deepEqual(wrapCanvasText(monospaceMeasure, "abcdefghij", 35), [
        "abc",
        "def",
        "ghi",
        "j",
    ]);
});

test("captionTextLayout aligns inside the fitted background", () => {
    const base = {
        text: "caption",
        style: {
            align: "center",
            font_size: 20,
            padding: "none",
            stroke_width: 0,
        },
        width: 200,
        measureText: monospaceMeasure,
    };

    assert.equal(captionTextLayout(base).lines[0].x, 35);
    assert.equal(
        captionTextLayout({ ...base, style: { ...base.style, align: "left" } })
            .lines[0].x,
        0,
    );
    assert.equal(
        captionTextLayout({ ...base, style: { ...base.style, align: "right" } })
            .lines[0].x,
        70,
    );
});

test("captionTextLayout includes vertical padding and outline in its natural height", () => {
    const base = {
        text: "caption",
        style: {
            align: "center",
            font_size: 20,
            padding: "none",
            stroke_width: 4,
        },
        width: 200,
        measureText: monospaceMeasure,
    };

    assert.equal(captionTextLayout(base).lines[0].y, 4);
    assert.equal(
        captionTextLayout({
            ...base,
            style: { ...base.style, padding: "normal" },
        }).lines[0].y,
        12,
    );
});

test("enclosedTransparentPixels detects only closed counters", () => {
    const image = rgbaFromAlphaGrid([
        ".....",
        ".###.",
        ".#.#.",
        ".###.",
        ".....",
    ]);

    assert.deepEqual(
        Array.from(
            enclosedTransparentPixels(image.data, image.width, image.height),
        ),
        [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0,
        ],
    );
});

test("enclosedTransparentPixels ignores gaps connected to the outside", () => {
    const image = rgbaFromAlphaGrid([
        ".....",
        ".#.#.",
        ".#.#.",
        ".###.",
        ".....",
    ]);

    assert.equal(
        enclosedTransparentPixels(image.data, image.width, image.height).some(
            Boolean,
        ),
        false,
    );
});
