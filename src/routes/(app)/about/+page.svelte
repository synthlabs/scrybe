<script lang="ts">
    import Github from "lucide-svelte/icons/github";
    import { Separator } from "$lib/components/ui/separator/index.ts";
</script>

<div class="container space-y-4 pb-4">
    <div>
        <h3 class="text-lg font-medium" id="whisper">Scrybe</h3>
        <p class="text-sm text-muted-foreground">
            A toy subtitle program useful for providing subtitles to currently
            playing audio, or for integrating with OBS to provide subtitles to
            your stream.
        </p>
    </div>
    <Separator />
    <div class="space-y-4">
        <a
            href="https://github.com/xjerod/scrybe"
            class="flex flex-row items-baseline gap-2"
            target="_blank"><Github /> Github</a
        >
    </div>
</div>
