<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	const messageLimit = 50;

	let partialText: string = 'This is an incoming subtitle';
	let messages: string[] = [];

	let socket: WebSocket;

	function pushMsg(msg: any) {
		let newMsgs = [msg, ...messages];

		if (newMsgs.length > messageLimit) newMsgs.pop();

		messages = newMsgs;
	}

	onMount(async () => {
		socket = new WebSocket('ws://localhost:8080/subtitle');

		socket.onmessage = (event) => {
			const res = JSON.parse(event.data);

			console.log(res);
			if (res['text']) {
				pushMsg(res['text']);
			}

			if (res['partial']) {
				partialText = res['partial'];
			} else {
				partialText = '';
			}
		};
	});

	onDestroy(() => {
		if (socket !== undefined) {
			socket.close();
		}
	});
</script>

<!-- https://play.tailwindcss.com/b33HpTdUWu -->
<div class="mx-auto flex h-screen max-w-screen-lg flex-col">
	<div class="min-h-12 flex-none p-2 px-4 pt-4 text-gray-400">
		{partialText}
	</div>
	<div class="divider px-4"></div>
	<div class="flex min-h-0 flex-1 flex-col">
		<div class="min-h-0 space-y-4 overflow-y-auto p-4">
			{#each messages as msg}
				<div class="w-full py-1 text-gray-800">{msg}</div>
			{/each}
		</div>
	</div>
</div>
