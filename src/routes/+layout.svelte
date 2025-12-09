<script lang="ts">
    import { Toaster } from "$lib/components/ui/sonner/index.ts";

    import "../app.css";

    let { children } = $props();
</script>

<Toaster />

<div class="h-full w-full">
    {@render children?.()}
</div>
