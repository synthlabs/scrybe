<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from "svelte-sonner";
	import { mode } from "mode-watcher";

	let restProps: SonnerProps = $props();
</script>

<Sonner
	theme={mode.current}
	class="toaster group"
	toastOptions={{
		classes: {
			toast: "group toast group-[.toaster]:bg-scrybe-soft group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-scrybe/30 group-[.toaster]:rounded-md group-[.toaster]:shadow-md",
			description: "group-[.toast]:text-muted-foreground",
			actionButton: "group-[.toast]:bg-scrybe group-[.toast]:text-primary-foreground group-[.toast]:hover:bg-scrybe-press",
			cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
		},
	}}
	{...restProps}
/>
