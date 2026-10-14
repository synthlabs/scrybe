const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const frame = () => new Promise<number>(requestAnimationFrame);
const easeOut = "cubic-bezier(0, 0, 0.2, 1)";

export async function waitFor<T>(
    check: () => T,
    message: string,
    timeout = 15000,
): Promise<NonNullable<T>> {
    const deadline = performance.now() + timeout;
    while (performance.now() < deadline) {
        const value = check();
        if (value) return value as NonNullable<T>;
        await sleep(50);
    }
    throw new Error(message);
}

async function record<T extends object>(
    snapshot: () => T,
    action: () => void,
    duration = 400,
) {
    const frames: (T & { ms?: number })[] = [snapshot()];
    action();
    const start = performance.now();
    do {
        await frame();
        frames.push({ ...snapshot(), ms: performance.now() - start });
    } while (performance.now() - start < duration);
    return frames;
}

function intermediate<T>(frames: T[], key: keyof T) {
    const start = frames[0][key] as number;
    const end = frames.at(-1)![key] as number;
    return frames.some(
        (sample) =>
            (sample[key] as number) > Math.min(start, end) + 1 &&
            (sample[key] as number) < Math.max(start, end) - 1,
    );
}

export async function inspectOverlayScrollMotion({ reduced = false } = {}) {
    const editor = await waitFor(
        () => document.querySelector<HTMLElement>("[data-overlay-editor]"),
        "Overlay did not mount",
    );
    const trigger = document.getElementById("overlay-position-toggle")!;
    const scroller = editor.closest<HTMLElement>(".overflow-y-auto")!;
    const preview = document.querySelector<HTMLElement>(
        "[data-preview-frame]",
    )!;
    const content = document.getElementById(
        trigger.getAttribute("aria-controls")!,
    )!;
    const errors = [];
    const transitions = [];
    const snapshot = () => ({
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        triggerTop: trigger.getBoundingClientRect().top,
        previewTop: preview.getBoundingClientRect().top,
        preview: preview.getBoundingClientRect().height,
        section: content.getBoundingClientRect().height,
        applyTop: document
            .querySelector<HTMLElement>(".apply-bar")!
            .getBoundingClientRect().top,
        expanded: trigger.getAttribute("aria-expanded"),
        hidden: content.hidden,
        previewDuration: preview.getAnimations()[0]?.effect!.getTiming()
            .duration,
        sectionDuration:
            parseFloat(getComputedStyle(content).animationDuration) * 1000,
    });
    if (trigger.getAttribute("aria-expanded") === "true") trigger.click();
    await sleep(400);
    scroller.scrollTop = 0;

    for (const offset of [0, "bottom", 200] as const) {
        const open = await record(snapshot, () => trigger.click());
        transitions.push({ label: "open-before-" + offset, frames: open });
        scroller.scrollTop =
            offset === "bottom" ? scroller.scrollHeight : offset;
        await sleep(150);
        const frames = await record(snapshot, () => trigger.click());
        const label = "close-scrolled-" + offset;
        transitions.push({ label, frames });
        const initial = frames[0].scrollTop;
        if (offset !== 0 && initial < 1)
            errors.push(label + ": no scrollable range");
        for (const sample of frames) {
            const expected = Math.min(
                initial,
                Math.max(0, sample.scrollHeight - sample.clientHeight),
            );
            if (Math.abs(sample.scrollTop - expected) > 1) {
                errors.push(
                    label + ": premature scroll reset at " + sample.ms + "ms",
                );
                break;
            }
        }
        if (frames.at(-1)!.expanded !== "false" || !frames.at(-1)!.hidden)
            errors.push(label + ": content did not settle closed");
        if (!reduced) {
            for (const [name, samples] of [
                ["open", open],
                ["close", frames],
            ] as const) {
                for (const key of ["preview", "section"] as const) {
                    if (!intermediate(samples, key))
                        errors.push(
                            label +
                                "/" +
                                name +
                                ": no intermediate " +
                                key +
                                " heights",
                        );
                }
                if (!samples.some((sample) => sample.previewDuration === 250))
                    errors.push(
                        label + "/" + name + ": preview duration is not 250ms",
                    );
                if (samples.at(-1)!.sectionDuration !== 150)
                    errors.push(
                        label + "/" + name + ": section duration is not 150ms",
                    );
            }
        } else {
            if (
                frames
                    .slice(1)
                    .some((sample) => sample.previewDuration !== undefined)
            )
                errors.push(label + ": preview animated with reduced motion");
            if (frames.at(-1)!.sectionDuration > 0.01)
                errors.push(label + ": section animated with reduced motion");
        }
    }

    scroller.scrollTop = 0;
    const rapid = await record(
        snapshot,
        () => {
            trigger.click();
            setTimeout(() => trigger.click(), 50);
            setTimeout(() => trigger.click(), 90);
        },
        500,
    );
    transitions.push({ label: "rapid-open-close-open", frames: rapid });
    const settled = rapid.at(-1)!;
    const natural = preview
        .querySelector<HTMLElement>("[data-preview-content]")!
        .getBoundingClientRect().height;
    if (
        settled.expanded !== "true" ||
        Math.abs(settled.preview - natural) > 1 ||
        preview.getAnimations().length ||
        preview.style.height
    )
        errors.push("Rapid reversal left the preview unsettled");
    trigger.click();
    await sleep(350);
    return { viewport: [innerWidth, innerHeight], transitions, errors };
}

export async function inspectModelChoicesMotion({ reduced = false } = {}) {
    await waitFor(
        () => document.querySelector("[data-settings-editor]"),
        "Settings did not mount",
    );
    const change = document.getElementById("settings-change-model")!;
    const chevron = change.querySelector("[data-disclosure-chevron]")!;
    const errors = [];
    const transitions = [];
    const snapshot = () => {
        const list = document.getElementById("settings-model-choices");
        const style = list && getComputedStyle(list);
        const iconStyle = getComputedStyle(chevron);
        return {
            height: list?.getBoundingClientRect().height ?? 0,
            hidden: !list || list.hidden,
            expanded: change.getAttribute("aria-expanded"),
            animationName: style?.animationName,
            duration: parseFloat(style?.animationDuration ?? "0") * 1000,
            easing: style?.animationTimingFunction,
            chevronRotate: iconStyle.rotate,
            chevronDuration: parseFloat(iconStyle.transitionDuration) * 1000,
            chevronEasing: iconStyle.transitionTimingFunction,
        };
    };
    if (change.getAttribute("aria-expanded") === "true") change.click();
    await sleep(250);
    change.scrollIntoView({ block: "center" });
    change.focus({ preventScroll: true });
    for (const open of [true, false, true, false] as const) {
        const frames = await record(snapshot, () => change.click());
        const label = "change-model-" + (open ? "open" : "close");
        transitions.push({ label, frames });
        const end = frames.at(-1)!;
        if (end.expanded !== String(open) || end.hidden === open)
            errors.push(label + ": incorrect final state");
        if (end.duration !== (reduced ? 0.01 : 150) || end.easing !== easeOut)
            errors.push(label + ": incorrect content timing");
        if (
            end.chevronDuration !== (reduced ? 0.01 : 150) ||
            end.chevronEasing !== easeOut
        )
            errors.push(label + ": incorrect chevron timing");
        if ((parseFloat(end.chevronRotate) || 0) !== (open ? 180 : 0))
            errors.push(label + ": incorrect chevron rotation");
        if (!reduced && !intermediate(frames, "height"))
            errors.push(label + ": no intermediate heights");
        if (document.activeElement !== change)
            errors.push(label + ": trigger lost focus");
    }

    const search = document.getElementById(
        "settings-search",
    ) as HTMLInputElement;
    search.value = "model";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(300);
    const searched = document.getElementById("settings-change-model")!;
    if (
        searched?.getAttribute("aria-expanded") !== "true" ||
        document.getElementById("settings-model-choices")?.hidden ||
        (parseFloat(
            getComputedStyle(
                searched!.querySelector("[data-disclosure-chevron]")!,
            ).rotate,
        ) || 0) !== 180
    )
        errors.push("Search did not keep the model chooser and chevron open");
    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(300);
    if (!document.getElementById("settings-model-choices")?.hidden)
        errors.push("Clearing search did not restore the closed chooser");
    return { viewport: [innerWidth, innerHeight], transitions, errors };
}

export async function traceOverlayScroll() {
    const editor = await waitFor(
        () => document.querySelector<HTMLElement>("[data-overlay-editor]"),
        "Overlay did not mount",
    )!;
    const trigger = document.getElementById("overlay-position-toggle")!;
    const scroller = editor.closest<HTMLElement>(".overflow-y-auto")!;
    const events: {
        kind: string;
        detail: unknown;
        ms: number;
        stack: string;
    }[] = [];
    const restore: (() => void)[] = [];
    let start = performance.now();
    const stamp = (kind: string, detail: unknown) =>
        events.push({
            kind,
            detail,
            ms: performance.now() - start,
            stack: new Error().stack!.split("\n").slice(1, 8).join(" | "),
        });
    const descriptor = Object.getOwnPropertyDescriptor(
        Element.prototype,
        "scrollTop",
    )!;
    Object.defineProperty(scroller, "scrollTop", {
        configurable: true,
        get() {
            return descriptor.get!.call(this);
        },
        set(value) {
            stamp("scrollTop=", value);
            descriptor.set!.call(this, value);
        },
    });
    restore.push(() => Reflect.deleteProperty(scroller, "scrollTop"));
    for (const [prototype, names] of [
        [
            Element.prototype,
            ["scrollTo", "scroll", "scrollBy", "scrollIntoView"],
        ],
        [HTMLElement.prototype, ["focus"]],
    ] as const) {
        for (const name of names) {
            const original = Reflect.get(prototype, name) as (
                ...args: unknown[]
            ) => unknown;
            Reflect.set(
                prototype,
                name,
                function (this: Element, ...args: unknown[]) {
                    stamp(name, {
                        target: this.id || this.className || this.tagName,
                        args,
                    });
                    return original.apply(this, args);
                },
            );
            restore.push(() => {
                Reflect.set(prototype, name, original);
            });
        }
    }
    const scroll = () => stamp("scroll-event", scroller.scrollTop);
    scroller.addEventListener("scroll", scroll);
    restore.push(() => scroller.removeEventListener("scroll", scroll));
    const snapshot = () => ({
        scrollTop: scroller.scrollTop,
        maximum: scroller.scrollHeight - scroller.clientHeight,
        connected: scroller.isConnected,
        same: scroller === editor.closest<HTMLElement>(".overflow-y-auto")!,
        active: document.activeElement?.id || document.activeElement?.tagName,
    });
    try {
        if (trigger.getAttribute("aria-expanded") !== "true") trigger.click();
        await sleep(400);
        scroller.scrollTop = scroller.scrollHeight;
        await sleep(150);
        events.length = 0;
        start = performance.now();
        const before = snapshot();
        trigger.click();
        const sync = snapshot();
        await Promise.resolve();
        const micro = snapshot();
        await frame();
        const raf1 = snapshot();
        await sleep(350);
        return { before, sync, micro, raf1, events, errors: [] };
    } finally {
        restore.reverse().forEach((undo) => undo());
    }
}
