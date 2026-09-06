import { test } from "node:test";
import assert from "node:assert/strict";
import {
    captionTextLayout,
    enclosedTransparentPixels,
    wrapCanvasText,
} from "../src/lib/overlay/canvas-text.js";

const monospaceMeasure = (text) => ({ width: text.length * 10 });

function rgbaFromAlphaGrid(rows) {
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
