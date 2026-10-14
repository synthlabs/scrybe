export async function inspectDisclosureMotion({
    scope = "overlay",
    reducedMotion = false,
    stress = false,
} = {}) {
    const errors: string[] = [];
    const transitions = [];
    const check = (condition: unknown, message: string) => {
        if (!condition) errors.push(message);
    };
    const pause = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
    const frame = () => new Promise<number>(requestAnimationFrame);
    const triggers = [
        ...document.querySelectorAll<HTMLElement>(
            scope === "overlay"
                ? ".advanced-controls [data-collapsible-trigger]"
                : "#home-details [data-collapsible-trigger]",
        ),
    ];
    check(triggers.length === 2, `${scope}: both disclosure triggers exist`);
    const pageY = (element: HTMLElement) => {
        let y = element.getBoundingClientRect().top;
        for (
            let parent = element.parentElement;
            parent;
            parent = parent.parentElement
        )
            y += parent.scrollTop;
        return y;
    };
    const paintedHeight = (preview: HTMLElement | null) => {
        if (!preview) return;
        const bounds = preview.getBoundingClientRect();
        return Math.max(
            0,
            ...[preview, ...preview.querySelectorAll("*")].map((element) => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                if (
                    style.backgroundImage === "none" ||
                    +style.opacity === 0 ||
                    rect.width < bounds.width - 2
                )
                    return 0;
                return Math.max(
                    0,
                    Math.min(rect.bottom, bounds.bottom) -
                        Math.max(rect.top, bounds.top),
                );
            }),
        );
    };
    const snapshot = (trigger: HTMLElement) => {
        const content = document.getElementById(
            trigger.getAttribute("aria-controls")!,
        )!;
        const style = getComputedStyle(content);
        const chevron = getComputedStyle(
            trigger.querySelector("[data-disclosure-chevron]")!,
        );
        const preview = document.querySelector<HTMLElement>(
            "[data-preview-frame]",
        );
        const following = document.querySelector<HTMLElement>(".preset-row");
        const animation = preview?.getAnimations()[0];
        return {
            height: content.getBoundingClientRect().height,
            natural: content.scrollHeight,
            hidden: content.hidden,
            expanded: trigger.getAttribute("aria-expanded"),
            duration: parseFloat(style.animationDuration) * 1000,
            easing: style.animationTimingFunction,
            chevronDuration: parseFloat(chevron.transitionDuration) * 1000,
            chevronEasing: chevron.transitionTimingFunction,
            opacity: +style.opacity,
            preview: preview?.getBoundingClientRect().height,
            previewPainted: paintedHeight(preview),
            previewNatural:
                preview?.firstElementChild!.getBoundingClientRect().height,
            previewInlineHeight: preview?.style.height,
            previewTiming: animation?.effect!.getTiming(),
            triggerY: pageY(trigger),
            followingY: following ? pageY(following) : undefined,
        };
    };
    type DisclosureFrame = ReturnType<typeof snapshot> & { ms?: number };
    const record = async (trigger: HTMLElement, action: () => void) => {
        const frames: DisclosureFrame[] = [snapshot(trigger)];
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
    const intermediate = (
        frames: DisclosureFrame[],
        property: "height" | "preview" | "followingY",
    ) => {
        const start = frames[0][property]!,
            end = frames.at(-1)![property]!;
        return frames.some(
            (item) =>
                item[property]! > Math.min(start, end) + 1 &&
                item[property]! < Math.max(start, end) - 1,
        );
    };
    const naturalPreview = (end: DisclosureFrame, label: string) => {
        if (scope !== "overlay") return;
        check(
            Math.abs(end.preview! - end.previewNatural!) <= 1,
            `${label}: preview finishes at natural height`,
        );
        check(
            end.previewInlineHeight === "",
            `${label}: preview releases its fixed height`,
        );
    };
    for (const [index, trigger] of triggers.entries()) {
        if (trigger.getAttribute("aria-expanded") === "true") trigger.click();
        await pause(350);
        for (const open of [true, false, true, false]) {
            trigger.focus({ preventScroll: true });
            const frames = await record(trigger, () =>
                trigger.dispatchEvent(
                    new KeyboardEvent("keydown", {
                        key: open ? "Enter" : " ",
                        bubbles: true,
                        cancelable: true,
                    }),
                ),
            );
            const label = `${scope}/${index}/${open ? "open" : "close"}`;
            transitions.push({ label, frames });
            const start = frames[0],
                end = frames.at(-1)!;
            check(
                end.expanded === String(open) && end.hidden === !open,
                `${label}: final disclosure state`,
            );
            check(
                document.activeElement === trigger,
                `${label}: trigger retains keyboard focus`,
            );
            check(
                Math.abs(end.duration - (reducedMotion ? 0.01 : 150)) < 0.001,
                `${label}: shared duration`,
            );
            check(
                end.chevronDuration === end.duration &&
                    end.chevronEasing === end.easing,
                `${label}: matching chevron motion`,
            );
            check(
                end.easing === "cubic-bezier(0, 0, 0.2, 1)",
                `${label}: ease-out`,
            );
            check(
                frames.every((item) => item.opacity === 1),
                `${label}: content stays opaque`,
            );
            check(
                intermediate(frames, "height") ===
                    (!reducedMotion && Math.abs(start.height - end.height) > 2),
                `${label}: intermediate section heights`,
            );
            check(
                open
                    ? Math.abs(end.height - end.natural) <= 1
                    : end.height === 0,
                `${label}: natural final section height`,
            );
            naturalPreview(end, label);
            if (scope === "overlay") {
                check(
                    frames.every(
                        (item) =>
                            Math.abs(item.preview! - item.previewPainted!) <= 1,
                    ),
                    `${label}: checkerboard covers the animated preview throughout the transition`,
                );
            }
            if (
                scope === "overlay" &&
                index === 0 &&
                Math.abs(start.preview! - end.preview!) > 2
            ) {
                check(
                    intermediate(frames, "preview") === !reducedMotion,
                    `${label}: intermediate preview heights`,
                );
                check(
                    intermediate(frames, "followingY") === !reducedMotion,
                    `${label}: following controls move continuously`,
                );
                const timings = frames.flatMap((item) =>
                    item.previewTiming ? [item.previewTiming] : [],
                );
                check(
                    reducedMotion
                        ? timings.length === 0
                        : timings.some(
                              (timing) =>
                                  timing.duration === 250 &&
                                  timing.easing === end.easing,
                          ),
                    `${label}: 250ms preview exception with matching easing`,
                );
            }
            if (!open) {
                const content = document.getElementById(
                    trigger.getAttribute("aria-controls")!,
                );
                content!
                    .querySelector<HTMLElement>("button, input, [tabindex='0']")
                    ?.focus({ preventScroll: true });
                check(
                    !content!.contains(document.activeElement),
                    `${label}: hidden controls cannot receive focus`,
                );
                trigger.focus({ preventScroll: true });
            }
        }
    }
    if (stress && scope === "overlay") {
        const trigger = triggers[0];
        trigger.click();
        await frame();
        await frame();
        const reversal = await record(trigger, () => trigger.click());
        transitions.push({ label: "reverse-opening", frames: reversal });
        if (!reducedMotion) {
            const direction = Math.sign(
                reversal.at(-1)!.preview! - reversal[0].preview!,
            );
            check(
                reversal.every(
                    (item, index) =>
                        !index ||
                        (item.preview! - reversal[index - 1].preview!) *
                            direction >=
                            -1,
                ),
                "Reversing uses the current preview height without jumping backward",
            );
        }
        naturalPreview(reversal.at(-1)!, "reversal");
        trigger.click();
        await pause(350);
        trigger.click();
        await frame();
        await frame();
        const reopening = await record(trigger, () => trigger.click());
        transitions.push({ label: "reverse-closing", frames: reopening });
        naturalPreview(reopening.at(-1)!, "reopening");
        trigger.click();
        await pause(350);
        const editor = window.editorModule.overlay_editor;
        const original = JSON.parse(JSON.stringify(editor.config));
        const workspace =
            document.querySelector<HTMLElement>(".overlay-workspace")!;
        const originalWidth = workspace.style.maxWidth;
        const resizing = await record(trigger, () => {
            trigger.click();
            requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                    editor.edit({
                        ...original,
                        canvas: {
                            ...original.canvas,
                            height: original.canvas.height + 400,
                        },
                    });
                    workspace.style.maxWidth = `${Math.max(300, workspace.clientWidth - 80)}px`;
                }),
            );
        });
        transitions.push({ label: "resize-during-opening", frames: resizing });
        naturalPreview(resizing.at(-1)!, "resize during opening");
        workspace.style.maxWidth = originalWidth;
        editor.edit(original);
        triggers[1].click();
        await pause(300);
        naturalPreview(snapshot(trigger), "both sections open after resize");
        triggers[1].click();
        trigger.click();
        await pause(350);
    }
    return { scope, reducedMotion, errors, transitions };
}
