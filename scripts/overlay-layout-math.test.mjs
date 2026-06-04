import { test } from "node:test";
import assert from "node:assert/strict";
import {
    captionAlignItems,
    canvasViewportTransform,
    clampBox,
    defaultBox,
    paddingPixels,
    resizeBox,
    snapBoxToZone,
} from "../src/lib/overlay/layout-math.js";

test("clampBox keeps the subtitle box inside the canvas", () => {
    assert.deepEqual(
        clampBox(
            { x: -50, y: 1200, w: 5000, h: 20 },
            { width: 1920, height: 1080 },
        ),
        { x: 0, y: 1020, w: 1920, h: 60 },
    );
});

test("defaultBox returns the lower-third centered box", () => {
    assert.deepEqual(defaultBox({ width: 1920, height: 1080 }), {
        x: 384,
        y: 886,
        w: 1152,
        h: 108,
    });
});

test("snapBoxToZone uses a four-percent safe margin", () => {
    assert.deepEqual(
        snapBoxToZone(
            { width: 1920, height: 1080 },
            { x: 384, y: 880, w: 1152, h: 100 },
            2,
            0,
        ),
        { x: 725, y: 43, w: 1152, h: 100 },
    );
});

test("snapBoxToZone keeps bottom-center inside the canvas", () => {
    assert.deepEqual(
        snapBoxToZone(
            { width: 1920, height: 1080 },
            { x: 384, y: 880, w: 1152, h: 100 },
            1,
            2,
        ),
        { x: 384, y: 937, w: 1152, h: 100 },
    );
});

test("canvasViewportTransform scales and centers a stream canvas in a smaller viewport", () => {
    assert.deepEqual(
        canvasViewportTransform(
            { width: 1920, height: 1080 },
            { width: 960, height: 540 },
        ),
        { scale: 0.5, x: 0, y: 0 },
    );
    assert.deepEqual(
        canvasViewportTransform(
            { width: 1920, height: 1080 },
            { width: 960, height: 720 },
        ),
        { scale: 0.5, x: 0, y: 90 },
    );
});

test("resizeBox pins the opposite edge at minimum size", () => {
    assert.deepEqual(
        resizeBox(
            { x: 300, y: 300, w: 260, h: 90 },
            "nw",
            120,
            80,
            { width: 1920, height: 1080 },
        ),
        { x: 360, y: 330, w: 200, h: 60 },
    );
});

test("padding presets map to stream-space pixels", () => {
    assert.equal(paddingPixels("none"), 0);
    assert.equal(paddingPixels("normal"), 24);
    assert.equal(paddingPixels("large"), 40);
    assert.equal(paddingPixels("tight"), 0);
    assert.equal(paddingPixels("wide"), 40);
    assert.equal(paddingPixels("unknown"), 24);
});

test("caption vertical alignment only anchors top when padding is disabled", () => {
    assert.equal(captionAlignItems("none"), "flex-start");
    assert.equal(captionAlignItems("tight"), "flex-start");
    assert.equal(captionAlignItems("normal"), "center");
    assert.equal(captionAlignItems("large"), "center");
    assert.equal(captionAlignItems("unknown"), "center");
});
