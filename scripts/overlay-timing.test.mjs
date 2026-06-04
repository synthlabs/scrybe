import { test } from "node:test";
import assert from "node:assert/strict";
import { debounce } from "../src/lib/overlay/timing.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("debounce emits immediately and coalesces rapid calls to latest value", async () => {
    const calls = [];
    const metered = debounce((value) => calls.push(value), 25);

    metered("first");
    metered("second");
    metered("third");

    assert.deepEqual(calls, ["first"]);

    await wait(35);

    assert.deepEqual(calls, ["first", "third"]);
});

test("debounce flush commits pending args immediately", () => {
    const calls = [];
    const metered = debounce((value) => calls.push(value), 100);

    metered("first");
    metered("second");
    metered.flush();

    assert.deepEqual(calls, ["first", "second"]);
    metered.cancel();
});

test("debounce cancel drops pending args", async () => {
    const calls = [];
    const metered = debounce((value) => calls.push(value), 25);

    metered("first");
    metered("second");
    metered.cancel();

    await wait(35);

    assert.deepEqual(calls, ["first"]);
});
