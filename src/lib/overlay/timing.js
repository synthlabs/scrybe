/**
 * Meter a hot callback so it emits immediately, then at most once per interval
 * with the latest pending arguments.
 *
 * @template {unknown[]} T
 * @param {(...args: T) => void} callback
 * @param {number} waitMs
 * @returns {((...args: T) => void) & { flush: () => void, cancel: () => void }}
 */
export function debounce(callback, waitMs) {
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null;
    /** @type {T | null} */
    let pendingArgs = null;
    let lastEmit = 0;
    const wait = Math.max(0, waitMs);

    /** @param {T} args */
    const emit = (args) => {
        lastEmit = Date.now();
        callback(...args);
    };

    const clearTimer = () => {
        if (!timer) return;
        clearTimeout(timer);
        timer = null;
    };

    const schedule = () => {
        if (timer) return;
        const elapsed = lastEmit ? Date.now() - lastEmit : wait;
        const delay = Math.max(0, wait - elapsed);
        timer = setTimeout(() => {
            timer = null;
            if (!pendingArgs) return;
            const args = pendingArgs;
            pendingArgs = null;
            emit(args);
        }, delay);
    };

    /** @type {((...args: T) => void) & { flush: () => void, cancel: () => void }} */
    const debounced = (...args) => {
        const elapsed = lastEmit ? Date.now() - lastEmit : wait;
        if (!lastEmit || elapsed >= wait) {
            clearTimer();
            pendingArgs = null;
            emit(args);
            return;
        }

        pendingArgs = args;
        schedule();
    };

    debounced.flush = () => {
        clearTimer();
        if (!pendingArgs) return;
        const args = pendingArgs;
        pendingArgs = null;
        emit(args);
    };

    debounced.cancel = () => {
        clearTimer();
        pendingArgs = null;
    };

    return debounced;
}
