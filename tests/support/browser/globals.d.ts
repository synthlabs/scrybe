export {};

declare global {
    interface Window {
        settingsModule: typeof import("$lib/stores/settings-editor.svelte");
        fixtureStates: typeof import("$lib/stores/state.svelte");
        editorModule: typeof import("$lib/stores/overlay-editor.svelte");
    }
}
