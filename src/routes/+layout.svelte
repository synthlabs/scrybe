<script lang="ts">
    import "../app.css";

    let { children } = $props();
</script>

<div class="h-full w-full">
    {@render children?.()}
</div>
