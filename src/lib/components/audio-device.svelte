<script lang="ts">
    import { commands, type AppState, type AudioDevice } from "$lib/bindings";
    import { Label } from "$lib/components/ui/label/index.ts";
    import * as Select from "$lib/components/ui/select/index.ts";
    import { SyncedState } from "tauri-svelte-synced-store";
    import Logger from "$utils/log";

    interface Props {
        app_state: SyncedState<AppState>;
    }
    let { app_state }: Props = $props();
    let audio_devices: AudioDevice[] = $state([]);

    commands
        .getAudioDevices()
        .then((result) => {
            if (result.status == "ok") {
                audio_devices = result.data;
            } else {
                Logger.error("failed to get audio devices", result.error);
            }
        })
        .catch(Logger.error);

    const triggerContent = $derived(
        audio_devices.find((f) => f.id === app_state.obj.current_device.id)
            ?.name ?? "Default",
    );

    const onUpdate = (device_id: string) => {
        Logger.debug(
            `updating selected device: ${app_state.obj.current_device.id} -> ${device_id}`,
        );
        const new_device = audio_devices.find((f) => f.id === device_id) || {
            id: device_id,
            name: "Default",
        };
        app_state.obj.current_device = new_device;
        app_state.sync();
    };
</script>

<div class="max-w-72 space-y-2 pb-4">
    <Label
        id="audio_device-label"
        for="audio_device"
        class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
    >
        Device
    </Label>
    <Select.Root
        type="single"
        onValueChange={onUpdate}
        bind:value={app_state.obj.current_device.id}
    >
        <Select.Trigger class="">{triggerContent}</Select.Trigger>
        <Select.Content>
            {#each audio_devices as device}
                <Select.Item value={device.id} label={device.name}
                    >{device.name}</Select.Item
                >
            {/each}
        </Select.Content>
    </Select.Root>
</div>
