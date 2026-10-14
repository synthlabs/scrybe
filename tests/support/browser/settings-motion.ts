export async function inspectSettingsDisclosureMotion(options: {
    font: number;
}) {
    const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
    const frame = () => new Promise<number>(requestAnimationFrame);
    try {
        for (
            let i = 0;
            i < 150 && !document.querySelector("[data-settings-editor]");
            i++
        )
            await sleep(100);
        window.fixtureStates = await import("$lib/stores/state.svelte");
        window.settingsModule =
            await import("$lib/stores/settings-editor.svelte");
        window.fixtureStates.app_state.obj.model_path =
            "/models/ggml-base-q8_0.bin";
        for (const state of Object.values(window.fixtureStates))
            state.ready = true;
        document.documentElement.style.fontSize = options.font + "px";
        await sleep(600);
        const errors = [];
        const transitions = [];
        const snapshot = (trigger: HTMLElement) => {
            const content = document.getElementById(
                trigger.getAttribute("aria-controls")!,
            )!;
            const style = getComputedStyle(content);
            const chevron = getComputedStyle(
                trigger.querySelector("[data-disclosure-chevron]")!,
            );
            return {
                height: content.getBoundingClientRect().height,
                natural: content.scrollHeight,
                hidden: content.hidden,
                expanded: trigger.getAttribute("aria-expanded"),
                animationName: style.animationName,
                duration: parseFloat(style.animationDuration) * 1000,
                easing: style.animationTimingFunction,
                contentVar: style.getPropertyValue(
                    "--bits-collapsible-content-height",
                ),
                chevronDuration: parseFloat(chevron.transitionDuration) * 1000,
                chevronEasing: chevron.transitionTimingFunction,
                triggerY:
                    trigger.getBoundingClientRect().top +
                    (document.scrollingElement?.scrollTop ?? 0),
            };
        };
        type Frame = ReturnType<typeof snapshot> & { ms?: number };
        const record = async (trigger: HTMLElement, action: () => void) => {
            const frames: Frame[] = [snapshot(trigger)];
            action();
            const start = performance.now();
            do {
                await frame();
                frames.push({
                    ...snapshot(trigger),
                    ms: performance.now() - start,
                });
            } while (performance.now() - start < 400);
            return frames;
        };
        const intermediate = (frames: Frame[]) => {
            const a = frames[0].height,
                b = frames.at(-1)!.height;
            return frames.some(
                (f) =>
                    f.height > Math.min(a, b) + 1 &&
                    f.height < Math.max(a, b) - 1,
            );
        };
        for (const id of [
            "settings-audio-advanced",
            "settings-model-advanced",
        ]) {
            const trigger = document.getElementById(id);
            if (!trigger) {
                errors.push(id + " missing");
                continue;
            }
            if (trigger.getAttribute("aria-expanded") === "true") {
                trigger.click();
                await sleep(400);
            }
            for (const open of [true, false, true, false]) {
                trigger.focus({ preventScroll: true });
                const frames = await record(trigger, () => trigger.click());
                const label = id + "/" + (open ? "open" : "close");
                transitions.push({ label, frames });
                const end = frames.at(-1)!;
                if (end.expanded !== String(open))
                    errors.push(label + ": final state");
                if (Math.abs(end.duration - 150) > 0.001)
                    errors.push(label + ": duration " + end.duration);
                if (end.easing !== "cubic-bezier(0, 0, 0.2, 1)")
                    errors.push(label + ": easing " + end.easing);
                if (!intermediate(frames))
                    errors.push(
                        label +
                            ": no intermediate heights (" +
                            frames.map((f) => Math.round(f.height)).join(",") +
                            ")",
                    );
                await sleep(100);
            }
        }
        return { errors, transitions };
    } catch (error) {
        return {
            errors: [String(error)],
            stack: error instanceof Error ? error.stack : undefined,
            transitions: [],
        };
    }
}
