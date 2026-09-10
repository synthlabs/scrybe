/** @typedef {import('../bindings').SettingsValues} Values */

/** @param {Values} state */
export function settingsValues(state) {
    return structuredClone({
        current_device: state.current_device,
        audio_segment_size: state.audio_segment_size,
        whisper_params: state.whisper_params,
        advanced_settings: state.advanced_settings,
    });
}

/** @param {unknown} a @param {unknown} b @returns {boolean} */
export function sameValues(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object")
        return false;
    const keys = Object.keys(a);
    return (
        keys.length === Object.keys(b).length &&
        keys.every((key) =>
            sameValues(Reflect.get(a, key), Reflect.get(b, key)),
        )
    );
}

/** @template {object} T @param {T} draft @param {T} baseline @param {T} saved @returns {T} */
function mergeFields(draft, baseline, saved) {
    const next = structuredClone(saved);
    for (const field of Object.keys(draft)) {
        const key = /** @type {keyof T} */ (field);
        if (!sameValues(draft[key], baseline[key]))
            next[key] = structuredClone(draft[key]);
    }
    return next;
}

/** @param {Values} draft @param {Values} baseline @param {Values} saved @returns {Values} */
export function reconcileValues(draft, baseline, saved) {
    return {
        ...mergeFields(draft, baseline, saved),
        whisper_params: {
            toggles: mergeFields(
                draft.whisper_params.toggles,
                baseline.whisper_params.toggles,
                saved.whisper_params.toggles,
            ),
        },
        advanced_settings: mergeFields(
            draft.advanced_settings,
            baseline.advanced_settings,
            saved.advanced_settings,
        ),
    };
}

/** @param {Values} draft @param {Values} defaults @returns {Values} */
export function resetAdvanced(draft, defaults) {
    return {
        ...structuredClone(draft),
        audio_segment_size: defaults.audio_segment_size,
        whisper_params: structuredClone(defaults.whisper_params),
        advanced_settings: structuredClone(defaults.advanced_settings),
    };
}

/** @param {string} query @param {...string} terms */
export function matchesSettings(query, ...terms) {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const text = terms.filter(Boolean).join(" ").toLocaleLowerCase();
    return words.every((word) => text.includes(word));
}

/** @param {string} path */
export function modelFilename(path) {
    return path.split(/[\\/]/).at(-1) || "";
}
