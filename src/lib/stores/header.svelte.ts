import type { Snippet } from "svelte";

class HeaderState {
    title = $state<string | undefined>(undefined);
    extras = $state<Snippet | undefined>(undefined);
    extras_right = $state<Snippet | undefined>(undefined);
}

export const header = new HeaderState();
