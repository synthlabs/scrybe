<script lang="ts">
    import { Toaster } from "$lib/components/ui/sonner/index.ts";
    import { ErrorToast } from "$utils/inbound";

    import "../app.css";

    let { children } = $props();
</script>

<Toaster />
<ErrorToast />

<div class="h-full w-full">
    {@render children?.()}
</div>
