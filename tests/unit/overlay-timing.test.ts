import { afterEach, beforeEach, test, vi } from "vitest";
import assert from "node:assert/strict";
import { debounce } from "$lib/overlay/timing.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
});

test("debounce emits immediately and coalesces rapid calls to latest value", async () => {
    const calls: unknown[] = [];
    const metered = debounce((value) => calls.push(value), 25);

    metered("first");
    metered("second");
    metered("third");

    assert.deepEqual(calls, ["first"]);

    await vi.advanceTimersByTimeAsync(35);

    assert.deepEqual(calls, ["first", "third"]);
});

test("debounce flush commits pending args immediately", () => {
    const calls: unknown[] = [];
    const metered = debounce((value) => calls.push(value), 100);

    metered("first");
    metered("second");
    metered.flush();

    assert.deepEqual(calls, ["first", "second"]);
    metered.cancel();
});

test("debounce cancel drops pending args", async () => {
    const calls: unknown[] = [];
    const metered = debounce((value) => calls.push(value), 25);

    metered("first");
    metered("second");
    metered.cancel();

    await vi.advanceTimersByTimeAsync(35);

    assert.deepEqual(calls, ["first"]);
});
