import assert from "node:assert/strict";
import type { AudioDeviceOption } from "$lib/bindings";
import { test } from "vitest";
import { groupAudioDevices, savedAudioDevice } from "$lib/audio-devices.ts";

test("groups sources by purpose, retains equal names, and puts defaults first", () => {
    const devices: AudioDeviceOption[] = [
        {
            id: "pulse:sink:h1n",
            name: "H1n",
            kind: "output",
            is_default: false,
        },
        {
            id: "pulse:source:z",
            name: "Zoom",
            kind: "input",
            is_default: false,
        },
        {
            id: "pulse:source:h1n",
            name: "H1n",
            kind: "input",
            is_default: false,
        },
        { id: "", name: "Zoom", kind: "input", is_default: true },
        { id: "default:output", name: "H1n", kind: "output", is_default: true },
    ];
    const snapshot = structuredClone(devices);
    assert.deepEqual(
        groupAudioDevices(devices).map((g) => [
            g.kind,
            g.devices.map((d) => d.id),
        ]),
        [
            ["input", ["", "pulse:source:h1n", "pulse:source:z"]],
            ["output", ["default:output", "pulse:sink:h1n"]],
        ],
    );
    assert.deepEqual(devices, snapshot);
});

test("macOS options remain ungrouped and selection metadata is not persisted", () => {
    const option = {
        id: "coreaudio:mic",
        name: "Microphone",
        kind: null,
        is_default: false,
    };
    assert.equal(groupAudioDevices([option])[0].kind, null);
    assert.deepEqual(savedAudioDevice(option), {
        id: "coreaudio:mic",
        name: "Microphone",
    });
    assert.deepEqual(
        savedAudioDevice({
            id: "",
            name: "Microphone",
            kind: "input",
            is_default: true,
        }),
        { id: "", name: "default" },
    );
});
