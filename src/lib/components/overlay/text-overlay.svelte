<script lang="ts">
    interface Props {
        justify?: "left" | "center" | "right" | undefined;
        text?: string;
    }

    let {
        justify,
        text = "I'm an example of a subtitle, and how I will look on the overlay browser source.",
    }: Props = $props();

    let style = $derived(`text-align: ${justify};`);
</script>

<div class="mx-auto flex h-full w-full flex-col justify-center" {style}>
    {text}
</div>
