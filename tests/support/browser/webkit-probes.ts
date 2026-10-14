import { inspectButtonMotion } from "./button-motion";
import { inspectDisclosureMotion } from "./disclosure-motion";
import { inspectSettingsDisclosureMotion } from "./settings-motion";
import {
    inspectModelChoicesMotion,
    inspectOverlayScrollMotion,
    traceOverlayScroll,
    waitFor,
} from "./motion-repro";

export type MotionCase = {
    id: number;
    scope: string;
    locale: string;
    width: number;
    height: number;
    font: number;
    reduced: boolean;
    native?: boolean;
    stress?: boolean;
    root?: string;
};

export async function inspectWebKitCase(options: MotionCase, kind: string) {
    const path =
        options.scope === "home"
            ? "/"
            : options.scope.startsWith("overlay")
              ? "/overlay"
              : "/settings";
    await waitFor(
        () =>
            document.querySelector(
                path === "/"
                    ? "#home-details-toggle"
                    : path === "/overlay"
                      ? "[data-overlay-editor]"
                      : "[data-settings-editor]",
            ),
        "Editor did not mount",
    );
    window.fixtureStates = await import("$lib/stores/state.svelte");
    window.editorModule = await import("$lib/stores/overlay-editor.svelte");
    if (!options.native) {
        if (path === "/settings")
            window.fixtureStates.app_state.obj.model_path =
                "/models/ggml-base-q8_0.bin";
        for (const state of Object.values(window.fixtureStates))
            state.ready = true;
        document.documentElement.style.fontSize = options.font + "px";
        if (options.scope === "home")
            window.fixtureStates.app_state.obj.home_right_rail.open = true;
    } else {
        await waitFor(
            () => window.fixtureStates.app_state.ready,
            "Native state did not become ready",
            45000,
        );
        if (
            !(window as Window & { __TAURI_INTERNALS__?: unknown })
                .__TAURI_INTERNALS__
        )
            throw new Error("Not a Tauri webview");
    }
    await new Promise((resolve) =>
        setTimeout(resolve, kind === "reproduction" ? 700 : 350),
    );
    if (
        matchMedia("(prefers-reduced-motion: reduce)").matches !==
        options.reduced
    )
        throw new Error(
            "WebKit motion preference differs from the requested case",
        );
    if (options.scope === "settings-preopen") {
        const trigger = document.getElementById("settings-model-advanced")!;
        if (trigger.getAttribute("aria-expanded") !== "true") trigger.click();
        await new Promise((resolve) => setTimeout(resolve, 300));
        document.querySelector<HTMLElement>('a[href="/overlay"]')!.click();
        await waitFor(
            () => document.querySelector("[data-overlay-editor]"),
            "Overlay navigation failed",
        );
        document.querySelector<HTMLElement>('a[href="/settings"]')!.click();
        await waitFor(
            () => document.querySelector("[data-settings-editor]"),
            "Settings return failed",
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (
            document
                .getElementById("settings-model-advanced")!
                .getAttribute("aria-expanded") !== "true"
        )
            throw new Error("Advanced state did not survive navigation");
    }
    const report =
        kind === "buttons"
            ? await inspectButtonMotion({ reducedMotion: options.reduced })
            : kind === "settings-disclosures"
              ? await inspectSettingsDisclosureMotion({ font: options.font })
              : kind === "disclosures"
                ? await inspectDisclosureMotion({
                      scope: options.scope,
                      reducedMotion: options.reduced,
                      stress: options.stress,
                  })
                : options.scope === "overlay-trace"
                  ? await traceOverlayScroll()
                  : path === "/overlay"
                    ? await inspectOverlayScrollMotion(options)
                    : await inspectModelChoicesMotion(options);
    const errors: string[] = [...report.errors];
    if (options.native && (innerWidth !== 1300 || innerHeight !== 900))
        errors.push(
            "Native viewport is not the default 1300×900: " +
                innerWidth +
                "×" +
                innerHeight,
        );
    return {
        id: options.id,
        options,
        viewport: [innerWidth, innerHeight],
        ...report,
        errors,
    };
}
