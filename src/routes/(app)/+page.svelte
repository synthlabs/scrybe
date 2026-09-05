<script lang="ts">
    import Transcript from "$lib/components/transcript.svelte";
    import RightRail from "$lib/components/home/right-rail.svelte";
    import BottomToolbar from "$lib/components/home/bottom-toolbar.svelte";
</script>

<div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
    <div class="flex min-h-0 flex-1 overflow-hidden">
        <Transcript />
        <RightRail />
    </div>
    <BottomToolbar />
</div>
