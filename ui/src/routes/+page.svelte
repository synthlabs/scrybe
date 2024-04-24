<script lang="ts">
	import { onMount } from 'svelte';

	onMount(async () => {
		const socket = new WebSocket('ws://localhost:8080/echo');

		socket.onmessage = (event) => {
			console.log(event);
		};
	});
</script>

<div class="mx-auto flex h-full min-h-0 max-w-screen-md flex-col justify-center p-2">
	<div class="flex flex-grow flex-col justify-end overflow-y-scroll p-2 px-4">
		<div class="w-full py-1 text-gray-800">message 1</div>
		<div class="w-full py-1 text-gray-800">message 2</div>
	</div>
	<div class="divider px-4"></div>
	<div class="flex p-2 px-4 pb-4 text-gray-400">This is an incoming subtitle</div>
</div>
