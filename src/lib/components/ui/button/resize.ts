type Size = { width: number; height: number };

const dimensions = ["width", "height"] as const;
const differs = (a: Size, b: Size) =>
    dimensions.some((axis) => Math.abs(a[axis] - b[axis]) > 0.5);

export function resizeButton(node: HTMLElement) {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let previous = measure();
    let target: Size | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const authoredStyles = () =>
        JSON.stringify([
            node.className,
            [...node.style]
                .filter((property) => !property.startsWith("--button-"))
                .map((property) => [
                    property,
                    node.style.getPropertyValue(property),
                    node.style.getPropertyPriority(property),
                ]),
        ]);
    let previousStyles = authoredStyles();
    const bodyStyles = () =>
        JSON.stringify(
            [...document.body.style]
                .filter(
                    (property) =>
                        ![
                            "overflow",
                            "overflow-x",
                            "overflow-y",
                            "pointer-events",
                        ].includes(property),
                )
                .map((property) => [
                    property,
                    document.body.style.getPropertyValue(property),
                ]),
        );
    let previousBodyStyles = bodyStyles();

    function measure(): Size {
        const style = getComputedStyle(node);
        const extra = (properties: string[]) =>
            style.boxSizing === "border-box"
                ? 0
                : properties.reduce(
                      (sum, property) =>
                          sum + parseFloat(style.getPropertyValue(property)),
                      0,
                  );
        return {
            width:
                parseFloat(style.width) +
                extra([
                    "padding-left",
                    "padding-right",
                    "border-left-width",
                    "border-right-width",
                ]),
            height:
                parseFloat(style.height) +
                extra([
                    "padding-top",
                    "padding-bottom",
                    "border-top-width",
                    "border-bottom-width",
                ]),
        };
    }

    function release() {
        clearTimeout(timer);
        target = undefined;
        node.removeAttribute("data-button-resizing");
        node.removeAttribute("data-button-single-line");
        for (const axis of dimensions)
            node.style.removeProperty(`--button-${axis}`);
    }

    function singleLine() {
        let top: number | undefined;
        const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        while (text.nextNode()) {
            if (!text.currentNode.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(text.currentNode);
            for (const rect of range.getClientRects()) {
                if (!rect.width || !rect.height) continue;
                if (top !== undefined && Math.abs(top - rect.top) > 1)
                    return false;
                top = rect.top;
            }
        }
        return top !== undefined;
    }

    function settle() {
        release();
        previous = measure();
    }

    function setSize(size: Size) {
        for (const axis of dimensions) {
            node.style.setProperty(`--button-${axis}`, `${size[axis]}px`);
        }
    }

    function resize() {
        const from = target ? measure() : previous;
        release();
        const next = measure();
        previous = next;
        if (
            reduced.matches ||
            !node.getClientRects().length ||
            ![from.width, from.height, next.width, next.height].every(
                (value) => Number.isFinite(value) && value > 0,
            ) ||
            !differs(from, next)
        )
            return;

        node.toggleAttribute("data-button-single-line", singleLine());
        node.setAttribute("data-button-resizing", "prepare");
        setSize(from);
        // Commit the old box before enabling CSS transitions to the new box.
        node.getBoundingClientRect();
        node.setAttribute("data-button-resizing", "active");
        setSize(next);
        target = next;
        const duration = Math.max(
            ...getComputedStyle(node)
                .transitionDuration.split(",")
                .map(
                    (value) =>
                        parseFloat(value) *
                        (value.trim().endsWith("ms") ? 1 : 1000),
                ),
        );
        timer = setTimeout(settle, duration + 50);
    }

    const content = new MutationObserver((records) => {
        const styles = authoredStyles();
        const changedContent = records.some(
            (record) => record.type !== "attributes" || record.target !== node,
        );
        if (styles !== previousStyles) {
            previousStyles = styles;
            if (!changedContent) {
                settle();
                return;
            }
        }
        if (changedContent) resize();
    });
    content.observe(node, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "src", "width", "height"],
    });

    const size = new ResizeObserver(() => {
        if (!target) previous = measure();
    });
    size.observe(node);

    // Layout changes are immediate, including changes during a content transition.
    const layout = new MutationObserver((records) => {
        const styles = bodyStyles();
        // Modal scroll and pointer locks do not change the button's layout.
        const changedLayout =
            styles !== previousBodyStyles ||
            records.some(
                (record) =>
                    record.target !== document.body ||
                    record.attributeName !== "style",
            );
        previousBodyStyles = styles;
        if (target && changedLayout) settle();
    });
    for (
        let parent = node.parentElement;
        parent;
        parent = parent.parentElement
    ) {
        layout.observe(parent, {
            attributes: true,
            attributeFilter: ["class", "style", "hidden"],
        });
    }
    function finish(event: TransitionEvent) {
        if (
            event.target === node &&
            dimensions.includes(
                event.propertyName as (typeof dimensions)[number],
            ) &&
            target &&
            !differs(measure(), target)
        )
            settle();
    }
    node.addEventListener("load", resize, true);
    node.addEventListener("transitionend", finish);
    window.addEventListener("resize", settle);
    reduced.addEventListener("change", settle);

    return {
        destroy() {
            content.disconnect();
            size.disconnect();
            layout.disconnect();
            node.removeEventListener("load", resize, true);
            node.removeEventListener("transitionend", finish);
            window.removeEventListener("resize", settle);
            reduced.removeEventListener("change", settle);
            release();
        },
    };
}
