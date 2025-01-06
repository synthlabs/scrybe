import { load, Store } from "@tauri-apps/plugin-store";

export class SyncedStore<T> {
    name: string;
    autosave: boolean = true;
    object: T = $state({} as T);
    #store!: Store;

    constructor(name:string, object: T) {
        this.name = name;
        this.object = object;
    }

    async init() {
        this.#store = await load(this.name, { autoSave: this.autosave });

        this.object = await this.get_store_value("object", this.object);

        $effect.root(() => {
            $effect(() => {
                console.log("DEBUG [SyncedStore]: object changed, syncing...");
                this.#store.set("object", { value: this.object });

            //     invoke("set_params", {
            //         translate: this.toggles.translate.value,
            //         suppress_blanks: this.toggles.suppress_blanks.value,
            //         print_special: this.toggles.print_special.value,
            //         print_progress: this.toggles.print_progress.value,
            //         token_timestamps: this.toggles.token_timestamps.value,
            //         single_segment: this.toggles.single_segment.value,
            //         split_on_word: this.toggles.split_on_word.value,
            //         tdrz_enable: this.toggles.tdrz_enable.value,
            //         language: this.language,
            //     });
            // });
            });
        });
    }

    async get_store_value<T>(key: string, default_val: T): Promise<T> {
        return (
            (await this.#store.get<{ value: T }>(key))?.value || default_val
        );
    }
}