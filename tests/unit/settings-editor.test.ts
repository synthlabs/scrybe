import { test } from "vitest";
import assert from "node:assert/strict";
import type { SettingsValues } from "$lib/bindings";
import {
    settingsValues,
    sameValues,
    reconcileValues,
    resetAdvanced,
    matchesSettings,
    modelFilename,
} from "$lib/settings/values.js";

const defaults: SettingsValues = {
    current_device: { id: "", name: "default" },
    audio_segment_size: 15,
    whisper_params: {
        toggles: {
            suppress_blanks: true,
            token_timestamps: true,
            single_segment: true,
            split_on_word: false,
            print_special: false,
            print_progress: false,
            tdrz_enable: false,
        },
    },
    advanced_settings: {
        hallucination_protection_enabled: true,
        vad_sensitivity: "balanced",
    },
};

test("settings drafts isolate values and omit unrelated app preferences", () => {
    const state = {
        ...structuredClone(defaults),
        sidebar_open: false,
        model_path: "/models/current.bin",
    };
    const draft = settingsValues(state);
    draft.whisper_params.toggles.single_segment = false;
    assert.equal(state.whisper_params.toggles.single_segment, true);
    assert.equal("sidebar_open" in draft, false);
    assert.equal("model_path" in draft, false);
});
test("reconciliation adopts untouched changes while retaining individual edits", () => {
    const draft = structuredClone(defaults),
        saved = structuredClone(defaults);
    draft.audio_segment_size = 22;
    draft.whisper_params.toggles.print_special = true;
    saved.current_device = { id: "mic", name: "Microphone" };
    saved.whisper_params.toggles.split_on_word = true;
    const next = reconcileValues(draft, defaults, saved);
    assert.equal(next.audio_segment_size, 22);
    assert.deepEqual(next.current_device, saved.current_device);
    assert.equal(next.whisper_params.toggles.print_special, true);
    assert.equal(next.whisper_params.toggles.split_on_word, true);
});
test("audio device identities reconcile as a unit", () => {
    const draft = structuredClone(defaults),
        saved = structuredClone(defaults);
    draft.current_device = { id: "draft", name: "Draft microphone" };
    saved.current_device = { id: "saved", name: "Saved microphone" };
    assert.deepEqual(
        reconcileValues(draft, defaults, saved).current_device,
        draft.current_device,
    );
});
test("reset restores advanced defaults but keeps the draft input", () => {
    const draft = structuredClone(defaults);
    draft.current_device = { id: "mic", name: "Microphone" };
    draft.audio_segment_size = 42;
    draft.advanced_settings.vad_sensitivity = "strict";
    draft.whisper_params.toggles.tdrz_enable = true;
    const next = resetAdvanced(draft, defaults);
    assert.deepEqual(next.current_device, draft.current_device);
    assert.equal(next.audio_segment_size, 15);
    assert.deepEqual(next.whisper_params, defaults.whisper_params);
    assert.equal(draft.audio_segment_size, 42);
});
test("search matches all words across translated labels and technical aliases", () => {
    assert(
        matchesSettings(
            "  VOICE balanced ",
            "Voice Sensitivity",
            "Sensitive Balanced Strict",
        ),
    );
    assert(matchesSettings("голос", "Чувствительность к голосу"));
    assert(
        matchesSettings(
            "token_timestamps",
            "Token Timestamps",
            "token_timestamps",
        ),
    );
    assert(
        !matchesSettings("translation", "Voice Sensitivity", "vad_sensitivity"),
    );
    assert(matchesSettings(" ", "anything"));
});
test("comparisons are independent of key order and paths cover both platforms", () => {
    assert(sameValues({ a: { c: 2, b: 1 } }, { a: { b: 1, c: 2 } }));
    assert(!sameValues({ a: true }, { a: false }));
    assert.equal(
        modelFilename("C:\\Models\\ggml-base-q8_0.bin"),
        "ggml-base-q8_0.bin",
    );
    assert.equal(
        modelFilename("/models/ggml-tiny-q8_0.bin"),
        "ggml-tiny-q8_0.bin",
    );
});
