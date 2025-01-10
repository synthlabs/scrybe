import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { load, Store } from "@tauri-apps/plugin-store";

export class SyncedStore<T extends { generation: number }> {
    name: string;
    autosave: boolean = true;
    sync: boolean = true;
    object: T = $state({} as T);
    #store!: Store;

    constructor(name: string, object: T) {
        this.name = name;
        this.object = object;
    }

    async init() {
        this.#store = await load(`${this.name}.json`, {
            autoSave: this.autosave,
        });

        this.object = await this.get_store_value("object", this.object);

        if (this.sync) {
            $effect.root(() => {
                $effect(() => {
                    console.log("DEBUG [SyncedStore]: syncing...");
                    this.#store.set("object", { value: this.object });

                    invoke(`set_${this.name}`, { new_value: this.object });
                });
            });
        }
    }

    async get_store_value<T>(key: string, default_val: T): Promise<T> {
        return (await this.#store.get<{ value: T }>(key))?.value || default_val;
    }
}
