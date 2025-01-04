<script lang="ts">
    interface Props {
        justify?: "left" | "center" | "right";
        text?: string;
    }

    let {
        justify = "left",
        text = "I'm an example of a subtitle, and how I will look on the overlay browser source.",
    }: Props = $props();
</script>

<div class="mx-auto flex h-full w-full flex-col justify-center text-{justify}">
    {text}
</div>
