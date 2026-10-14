import { createRawSnippet, mount, unmount } from "svelte";
import Button from "$lib/components/ui/button/button.svelte";
import { goto } from "$app/navigation";
import { m as msgs } from "$lib/paraglide/messages";

export async function inspectButtonMotion({ reducedMotion = false } = {}) {
    const errors: string[] = [];
    const transitions: { name: string; frames: ButtonFrame[] }[] = [];
    const check = (condition: unknown, message: string) => {
        if (!condition) errors.push(message);
    };
    const pause = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
    const frame = () => new Promise<number>(requestAnimationFrame);
    const textLines = (node: HTMLElement) => {
        const tops: number[] = [];
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            if (!walker.currentNode.textContent!.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(walker.currentNode);
            for (const rect of range.getClientRects()) {
                if (
                    rect.width > 0 &&
                    !tops.some((top) => Math.abs(top - rect.top) < 1)
                )
                    tops.push(rect.top);
            }
        }
        return tops.length;
    };
    const snapshot = (node: HTMLElement) => ({
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
        text: node.textContent,
        lines: textLines(node),
        active: node.hasAttribute("data-button-resizing"),
        animations: node
            .getAnimations()
            .filter((animation) =>
                ["width", "height"].includes(
                    (animation as CSSTransition).transitionProperty,
                ),
            )
            .map((animation) => ({
                property: (animation as CSSTransition).transitionProperty,
                ...animation.effect!.getTiming(),
            })),
    });
    const clean = (node: HTMLElement, name: string) => {
        check(
            !node.hasAttribute("data-button-resizing"),
            `${name}: sizing released`,
        );
        check(
            !node.hasAttribute("data-button-single-line"),
            `${name}: text wrapping released`,
        );
        check(
            !node.style.getPropertyValue("--button-width") &&
                !node.style.getPropertyValue("--button-height"),
            `${name}: measurement styles released`,
        );
    };
    type ButtonFrame = ReturnType<typeof snapshot> & { ms?: number };
    const record = async (
        node: HTMLElement,
        name: string,
        action: () => void = () => {},
        duration = 320,
    ) => {
        const frames: ButtonFrame[] = [snapshot(node)];
        action();
        const start = performance.now();
        do {
            await frame();
            frames.push({ ...snapshot(node), ms: performance.now() - start });
        } while (performance.now() - start < duration);
        transitions.push({ name, frames });
        const final = frames.at(-1)!;
        if (final.lines === 1)
            check(
                frames
                    .filter((item) => item.text === final.text)
                    .every((item) => item.lines === 1),
                `${name}: single-line label never wraps during motion`,
            );
        for (const axis of ["width", "height"] as const) {
            const a = frames[0][axis],
                b = frames.at(-1)![axis];
            const intermediate = frames.some(
                (item) =>
                    item[axis] > Math.min(a, b) + 0.75 &&
                    item[axis] < Math.max(a, b) - 0.75,
            );
            if (Math.abs(a - b) > 2)
                check(
                    intermediate === !reducedMotion,
                    `${name}: ${axis} ${reducedMotion ? "immediate" : "interpolates"}`,
                );
        }
        for (const animation of frames.flatMap((item) => item.animations)) {
            check(
                animation.duration === 150 && animation.easing === "ease-out",
                `${name}: 150ms ease-out CSS transition`,
            );
        }
        if (reducedMotion)
            check(
                frames.every((item) => !item.active),
                `${name}: no reduced-motion animation`,
            );
        clean(node, name);
        return frames;
    };

    const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    let copied: string | undefined;
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
            writeText: async (text: string) => {
                copied = text;
            },
        },
    });
    try {
        const heading = document.querySelector<HTMLElement>(
            ".page-heading button",
        )!;
        check(
            !!heading?.classList.contains("scrybe-button"),
            "Copy OBS URL uses Button",
        );
        heading.focus();
        const label = heading.textContent;
        await record(heading, "copy-heading", () => heading.click());
        check(
            heading.textContent !== label && !!copied,
            "copy updates label and clipboard",
        );
        check(
            document.activeElement === heading &&
                heading.getAttribute("aria-live") === "polite",
            "copy preserves focus and live region",
        );
        await record(heading, "copy-heading-reset", undefined, 1450);
        check(heading.textContent === label, "copy resets original label");

        document.getElementById("overlay-setup")!.click();
        await pause(250);
        const setup = document.querySelector<HTMLElement>(
            ".setup-steps button",
        )!;
        await record(setup, "copy-setup", () => setup.click());
        await record(setup, "copy-setup-reset", undefined, 1450);
        document.querySelector<HTMLElement>("[data-dialog-close]")!.click();
        await pause(250);
    } finally {
        if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
        else Reflect.deleteProperty(navigator, "clipboard");
    }

    const host = document.createElement("div");
    host.style.cssText =
        "position:fixed;left:0;top:0;width:300px;z-index:9999;display:flex;align-items:flex-start;transition:none";
    document.body.append(host);
    const button = mount(Button, {
        target: host,
        props: {
            variant: "outline",
            size: "sm",
            class: "max-w-full",
            href: "#button-motion",
            children: createRawSnippet(() => ({
                render: () => "<span data-motion-label>Copy</span>",
            })),
        },
    });
    await pause(100);
    const node = host.querySelector<HTMLAnchorElement>("a")!;
    const label = node.querySelector<HTMLElement>("[data-motion-label]")!;
    const long = "Copy a longer translated caption URL";
    check(node.getAnimations().length === 0, "initial mount is immediate");
    await record(node, "label-and-color", () => {
        node.classList.add("text-status-live");
        label.textContent = "URL copied";
    });
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 16 16");
    icon.setAttribute("aria-hidden", "true");
    icon.classList.add("animate-spin");
    await record(node, "loading-icon-added", () => node.prepend(icon));
    await record(node, "loading-icon-removed", () => icon.remove());
    await record(node, "anchor-grow-and-wrap", () => {
        label.textContent = long;
    });
    check(
        node.scrollWidth <= node.clientWidth + 1 &&
            node.scrollHeight <= node.clientHeight + 1,
        "wrapped label fits after settling",
    );
    await record(node, "anchor-shrink", () => {
        label.textContent = "Copy";
    });
    label.textContent = long;
    await pause(45);
    const beforeReverse = snapshot(node);
    label.textContent = "URL copied";
    await Promise.resolve();
    const afterReverse = snapshot(node);
    if (!reducedMotion)
        check(
            Math.abs(beforeReverse.width - afterReverse.width) < 1,
            "rapid change starts at current displayed width",
        );
    await pause(250);
    clean(node, "rapid change");

    label.textContent = long;
    await pause(35);
    host.style.width = "140px";
    await frame();
    check(
        !node.hasAttribute("data-button-resizing") &&
            node.getBoundingClientRect().width <= 141,
        `container resize settles immediately during motion: ${JSON.stringify({ box: snapshot(node), host: host.clientWidth, max: getComputedStyle(node).maxWidth, min: getComputedStyle(node).minWidth, font: getComputedStyle(node).fontSize })}`,
    );
    await pause(200);
    host.style.width = "280px";
    await frame();
    check(
        !node.hasAttribute("data-button-resizing"),
        "container-only resize does not animate",
    );
    node.style.width = "200px";
    await pause(50);
    const fixed = await record(node, "fixed-width", () => {
        label.textContent = "Fixed";
    });
    check(
        fixed.every((item) => Math.abs(item.width - 200) < 1),
        "caller fixed width is preserved",
    );
    check(node.style.width === "200px", "caller inline styles survive cleanup");
    node.style.width = "";
    node.style.minWidth = "140px";
    await pause(50);
    await record(node, "minimum-width", () => {
        label.textContent = "X";
    });
    check(
        Math.abs(node.getBoundingClientRect().width - 140) < 1,
        "minimum width is preserved",
    );
    node.style.minWidth = "";
    node.style.width = "100%";
    await pause(50);
    const full = await record(node, "full-width", () => {
        label.textContent = long;
    });
    check(
        full.every((item) => Math.abs(item.width - host.clientWidth) < 1),
        "full-width button stays full width",
    );
    node.style.width = "";
    label.textContent = "Copy";
    await pause(50);
    label.textContent = long;
    await pause(30);
    window.dispatchEvent(new Event("resize"));
    clean(node, "window resize during motion");
    label.textContent = "Bye";
    await pause(30);
    node.style.width = "180px";
    await frame();
    check(
        !node.hasAttribute("data-button-resizing"),
        "caller sizing change cancels motion immediately",
    );
    node.style.width = "";
    await pause(100);
    label.textContent = long;
    await pause(30);
    await unmount(button);
    clean(node, "unmount during motion");
    host.remove();

    await goto("/");
    await pause(300);
    const details = document.getElementById("home-details-toggle")!;
    const layoutChanges: {
        element: string;
        id: string;
        attribute: string | null;
        value: string | null;
    }[] = [];
    const layoutObserver = new MutationObserver((records) => {
        for (const record of records)
            layoutChanges.push({
                element: (record.target as Element).tagName,
                id: (record.target as Element).id,
                attribute: record.attributeName,
                value: (record.target as Element).getAttribute(
                    record.attributeName!,
                ),
            });
    });
    for (
        let parent = details.parentElement;
        parent;
        parent = parent.parentElement
    )
        layoutObserver.observe(parent, { attributes: true });
    await record(details, "home-details", () => details.click());
    layoutObserver.disconnect();
    const scroller = document.querySelector<HTMLElement>(
        "[data-details-scroll]",
    )!;
    const homeGeometry = scroller
        ? [scroller, ...scroller.querySelectorAll("*")].map((element) => ({
              tag: element.tagName,
              text: element.textContent!.slice(0, 60),
              class: element.className,
              rect: element.getBoundingClientRect().toJSON(),
              scroll: element.scrollWidth,
              padding: getComputedStyle(element).padding,
              minWidth: getComputedStyle(element).minWidth,
          }))
        : [];
    if (scroller)
        check(
            scroller.scrollWidth <= scroller.clientWidth + 1,
            "Home details has no horizontal overflow",
        );
    await goto("/settings");
    await pause(300);
    const advanced = document.querySelector<HTMLElement>(
        "#settings-model-advanced",
    )!;
    check(
        advanced?.classList.contains("scrybe-button"),
        "Settings Advanced uses Button",
    );
    await record(advanced, "settings-advanced", () => advanced.click());
    await record(advanced, "settings-advanced-reset", () => advanced.click());

    check(
        !document.querySelector<HTMLElement>(
            "button button, button a, a button",
        ),
        "no nested interactive controls",
    )!;
    return { reducedMotion, errors, transitions, layoutChanges, homeGeometry };
}
