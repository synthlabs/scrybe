import type { AudioDeviceOption, AudioSourceKind } from "./bindings";

export function groupAudioDevices(devices: AudioDeviceOption[]) {
    const kinds: (AudioSourceKind | null)[] = ["input", "output", null];
    return kinds
        .map((kind) => ({
            kind,
            devices: devices
                .filter((device) => device.kind === kind)
                .sort(
                    (a, b) =>
                        Number(b.is_default) - Number(a.is_default) ||
                        a.name.localeCompare(b.name) ||
                        a.id.localeCompare(b.id),
                ),
        }))
        .filter((group) => group.devices.length);
}

export function savedAudioDevice(device: AudioDeviceOption) {
    return {
        id: device.id,
        name: device.is_default && !device.id ? "default" : device.name,
    };
}
