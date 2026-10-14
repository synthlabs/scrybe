import { test } from "vitest";
import assert from "node:assert/strict";
import { DEFAULT_OVERLAY_CONFIG } from "$lib/overlay/layout-math.js";
import {
    ANCHORS,
    anchorFactors,
    clampLayout,
    defaultLayout,
    snapLayout,
} from "$lib/overlay/placement.js";
import {
    STYLE_PRESETS,
    applyPreset,
    matchingPreset,
    pairedColor,
} from "$lib/overlay/presets.js";
import { captionTextLayout } from "$lib/overlay/canvas-text.js";
import { configKey, sampleFrame } from "$lib/overlay/sample.js";

const config = structuredClone(DEFAULT_OVERLAY_CONFIG);

test("presets preserve user size and alignment, and custom detection ignores those fields", () => {
    const style = { ...config.style, font_size: 63, align: "right" };
    for (const preset of STYLE_PRESETS) {
        const result = applyPreset(style, preset.id);
        assert.equal(result.font_size, 63);
        assert.equal(result.align, "right");
        assert.equal(matchingPreset(result), preset.id);
        assert.equal(
            matchingPreset({ ...result, border_radius: 43 }),
            "custom",
        );
    }
    assert.equal(
        matchingPreset({ ...config.style, text_color: "#FFFFFF" }),
        "classic",
    );
});
test("basic swatches pair text colors; independent edits and opaque/transparent looks remain representable", () => {
    assert.equal(pairedColor(config.style, "#ffffff").text_color, "#101114");
    assert.equal(pairedColor(config.style, "#e98963").text_color, "#101114");
    assert.equal(pairedColor(config.style, "#101216").text_color, "#ffffff");
    assert.equal(applyPreset(config.style, "outline").background_opacity, 0);
    assert.equal(applyPreset(config.style, "solid").background_opacity, 100);
});
test("anchors use safe margins and pin the growth direction for every position", () => {
    assert.deepEqual(defaultLayout(config.canvas), config.layout);
    for (const anchor of ANCHORS) {
        const layout = snapLayout(config.canvas, anchor, 1152);
        const factors = anchorFactors(anchor);
        assert.equal(layout.y, [43, 540, 1037][factors.y * 2]);
        assert.equal(layout.x, [43, 960, 1877][factors.x * 2]);
        assert.deepEqual(clampLayout(layout, config.canvas), layout);
    }
    assert.equal(
        clampLayout(
            { ...config.layout, max_width: 9999, x: -9999, y: 9999 },
            config.canvas,
        ).x,
        960,
    );
});
test("caption backgrounds grow horizontally, then wrap and grow vertically without a fixed height", () => {
    const layout = (text: string) =>
        captionTextLayout({
            text,
            style: config.style,
            width: 132,
            measureText: (value) => value.length * 10,
        });
    const one = layout("one");
    const two = layout("one two");
    const many = layout("one two three four five six seven eight nine ten");
    assert.equal(one.width, 62);
    assert.equal(two.width, 102);
    assert.equal(one.height, two.height);
    assert.ok(many.width <= 132);
    assert.ok(many.height > 140);
    assert.ok(many.lines.length > 3);
});
test("enlarged outline and padding fit within measured caption dimensions", () => {
    const result = captionTextLayout({
        text: "test",
        style: { ...config.style, stroke_width: 12, padding: "large" },
        width: 1000,
        measureText: (value) => value.length * 10,
    });
    assert.equal(result.width, 128);
    assert.equal(result.height, 101);
    assert.equal(result.lines[0].y, 28);
});
test("sample animation repeats, respects reduced motion, and config comparison is independent of property order", () => {
    const text = "one two three four five six";
    assert.equal(sampleFrame(text, 0), "one two three");
    assert.equal(sampleFrame(text, 360), "one two three four five");
    assert.equal(sampleFrame(text, 360, true), text);
    assert.equal(sampleFrame(text, 15 * 180), "one two three");
    assert.equal(
        configKey({ x: 1, y: { b: 2, a: 3 } }),
        configKey({ y: { a: 3, b: 2 }, x: 1 }),
    );
});
