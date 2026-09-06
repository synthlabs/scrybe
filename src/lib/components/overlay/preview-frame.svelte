<script lang="ts">
    import { onMount, tick, untrack, type Snippet } from "svelte";
    import { MediaQuery } from "svelte/reactivity";

    let { positioning, children }: { positioning: boolean; children: Snippet } =
        $props();
    let frame: HTMLDivElement | undefined = $state();
    let content: HTMLDivElement | undefined = $state();
    const reduced_motion = new MediaQuery("(prefers-reduced-motion: reduce)");
    const preview_resize_duration_ms = 250;
    let previous: boolean | undefined;
    let animation: Animation | undefined;
    let generation = 0;
    let resizing = false;
    let pending = false;
    let target: number | undefined;

    function settle() {
        animation?.cancel();
        animation = undefined;
        resizing = false;
        target = undefined;
        if (frame) {
            frame.style.height = "";
        }
    }

    function resize() {
        if (!frame || !content || !resizing || pending) return;
        if (reduced_motion.current) return settle();
        const next = content.getBoundingClientRect().height;
        if (next === target && animation) return;
        const from = frame.getBoundingClientRect().height;
        animation?.cancel();
        if (Math.abs(next - from) < 0.5) return settle();
        frame.style.height = `${from}px`;
        target = next;
        const current = frame.animate(
            [{ height: `${from}px` }, { height: `${next}px` }],
            {
                duration: preview_resize_duration_ms,
                easing: "cubic-bezier(0, 0, 0.2, 1)",
                fill: "forwards",
            },
        );
        animation = current;
        current.onfinish = () => {
            if (animation === current) settle();
        };
    }

    async function switchPreview() {
        const revision = ++generation;
        if (!frame || reduced_motion.current) return settle();
        const height = frame.getBoundingClientRect().height;
        animation?.cancel();
        animation = undefined;
        target = undefined;
        resizing = true;
        pending = true;
        frame.style.height = `${height}px`;
        await tick();
        if (revision !== generation) return;
        pending = false;
        resize();
    }

    $effect.pre(() => {
        const next = positioning;
        if (!frame || previous === undefined) {
            previous = next;
            return;
        }
        if (previous === next) return;
        previous = next;
        untrack(switchPreview);
    });

    $effect(() => {
        if (reduced_motion.current) untrack(settle);
    });

    onMount(() => {
        const observer = new ResizeObserver(resize);
        if (content) observer.observe(content);
        return () => {
            generation += 1;
            observer.disconnect();
            settle();
        };
    });
</script>

<div bind:this={frame} class="preview-frame" data-preview-frame>
    <div bind:this={content} class="flow-root" data-preview-content>
        {@render children()}
    </div>
</div>

<style>
    .preview-frame {
        position: relative;
        overflow: hidden;
        border-radius: var(--scrybe-radius-panel);
        background: conic-gradient(
                #55585e 0 25%,
                #4b4e54 0 50%,
                #55585e 0 75%,
                #4b4e54 0
            )
            0 0 / 2rem 2rem;
    }
    .preview-frame::after {
        content: "";
        position: absolute;
        inset: 0;
        border: 1px solid var(--border);
        border-radius: inherit;
        pointer-events: none;
    }
</style>
