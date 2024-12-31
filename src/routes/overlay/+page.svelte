<script lang="ts">
    import { Separator } from "$lib/components/ui/separator/index.ts";
</script>

<div class="space-y-4 pb-4 w-full mx-auto">
    <div>
        <h3 class="text-lg font-medium" id="audio">Overlay</h3>
        <p class="text-muted-foreground text-sm">
            Manage the look of the subtitles that will be shown on the overlay.
        </p>
    </div>
    <Separator />
    <div class="space-y-4">
        <div class="w-full h-32 bg-checkered border-2 border-primary">
            this is a test
        </div>
        <div class="">controls</div>
        <div class="">url</div>
    </div>
</div>

<style>
    .bg-checkered {
        background-image: linear-gradient(
                rgba(0, 0, 0, 0.5),
                rgba(0, 0, 0, 0.5)
            ),
            url("data:image/svg+xml,%0A%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23F0F0F0' d='M0 0h8v8H0zm8 8h8v8H8z'/%3E%3C/svg%3E");
        background-size: 16px 16px;
    }
</style>
