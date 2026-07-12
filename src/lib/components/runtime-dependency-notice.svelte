<script lang="ts">
    import { openUrl } from "@tauri-apps/plugin-opener";
    import { toast } from "svelte-sonner";
    import Logger from "$utils/log";
    import { m as msgs } from "$lib/paraglide/messages";
    import { internal_state } from "$lib/stores/state.svelte";

    let last_notice_key = $state("");
    let last_vad_notice_key = $state("");

    const open_action_url = async (url: string) => {
        try {
            await openUrl(url);
        } catch (e) {
            Logger.error("failed to open runtime dependency action url", e);
        }
    };

    $effect(() => {
        const dependency = internal_state.obj.runtime_dependency;
        const notice_key = `${dependency.status}:${dependency.reason}:${dependency.action_url ?? ""}`;

        if (
            notice_key === last_notice_key ||
            dependency.status === "unknown" ||
            dependency.status === "ready_gpu"
        ) {
            return;
        }

        last_notice_key = notice_key;

        const options = dependency.action_url
            ? {
                  duration: 10000,
                  action: {
                      label: msgs.runtime_open_nvidia_driver_page(),
                      onClick: () => open_action_url(dependency.action_url!),
                  },
              }
            : { duration: 6000 };

        if (dependency.status === "ready_cpu_fallback") {
            toast.warning(
                dependency.has_nvidia_gpu
                    ? msgs.runtime_cpu_fallback_nvidia()
                    : msgs.runtime_cpu_fallback(),
                options,
            );
        } else if (dependency.status === "unavailable") {
            toast.error(
                dependency.reason || msgs.runtime_unavailable(),
                options,
            );
        }
    });

    $effect(() => {
        const vad = internal_state.obj.vad_runtime;
        const notice_key = `${vad.status}:${vad.reason}`;
        if (notice_key === last_vad_notice_key || vad.status !== "degraded") {
            return;
        }

        last_vad_notice_key = notice_key;
        toast.warning(
            msgs.runtime_vad_degraded({
                reason: vad.reason || msgs.runtime_unavailable(),
            }),
            { duration: 8000 },
        );
    });
</script>
