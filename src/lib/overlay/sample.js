/** @param {string} text @param {number} elapsed @param {boolean} reducedMotion */
export function sampleFrame(text, elapsed, reducedMotion = false) {
    if (reducedMotion) return text;
    const words = text.trim().split(/\s+/);
    const first = Math.min(3, words.length);
    const cycle = Math.max(1, words.length - first + 12);
    const count = Math.min(
        words.length,
        first + (Math.floor(Math.max(0, elapsed) / 180) % cycle),
    );
    return words.slice(0, count).join(" ");
}

/** @param {unknown} value @returns {string} */
export function configKey(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    return JSON.stringify(
        Object.keys(value)
            .sort()
            .map((key) => [
                key,
                configKey(/** @type {Record<string, unknown>} */ (value)[key]),
            ]),
    );
}
