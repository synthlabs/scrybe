import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { load, Store } from "@tauri-apps/plugin-store";

export class SyncedStore<T> {
    name: string;
    object: T = $state({} as T);
    autosave: boolean = true;
    sync: boolean = true;
    #store!: Store;
    #update_latch: boolean = false;
    #un_sub: UnlistenFn | undefined;

    constructor(name: string, object: T) {
        this.name = name;
        this.object = object;
    }

    close() {
        if (this.#un_sub) {
            this.#un_sub();
        }
    }

    async init() {
        this.#store = await load(`${this.name}.json`, {
            autoSave: this.autosave,
        });

        this.object = await this.get_store_value("object", this.object);

        this.#un_sub = await listen<T>(`${this.name}_update`, (event) => {
            console.log(`${this.name}_update event`);
            this.#update_latch = true;
            this.object = event.payload;
        });

        if (this.sync) {
            $effect.root(() => {
                $effect(() => {
                    console.log("DEBUG [SyncedStore]: syncing...");

                    if (!this.#update_latch) {
                        this.#store.set("object", { value: this.object });

                        invoke(`set_${this.name}`, { new_value: this.object });
                    } else {
                        console.log("update latch");
                        this.#update_latch = false;
                    }
                });
            });
        }
    }

    async get_store_value<T>(key: string, default_val: T): Promise<T> {
        return (await this.#store.get<{ value: T }>(key))?.value || default_val;
    }
}
