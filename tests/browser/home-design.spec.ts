import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test, until, type BrowserApp } from "../support/browser/fixtures";
test.use({ tauriScenario: "home" });

type Rect = { x: number; y: number; width: number; height: number };
type NavFrame = {
    top: number;
    opacity: number;
    properties: string;
    durations: string;
};
type DetailsFrame = {
    height: number;
    scrollHeight: number;
    hidden: boolean;
    expanded: string;
    duration: string;
    easing: string;
    opacity: number;
    chevronDuration: string;
    chevronEasing: string;
    focused: boolean;
};
type SidebarFrame = {
    width: number;
    state: string;
    overflow: number;
    marker: Rect;
    items: {
        title: string;
        row: Rect;
        icon: Rect;
        label: Rect;
        opacity: number;
    }[];
};

function homeChecks(app: BrowserApp) {
    const { evaluate, cdp, viewport, key, click, errors, artifacts } = app;

    const contrastReport = async (name: string) => {
        const samples = await evaluate<
            { text: string; ratio: number; required: number }[]
        >(`(() => {
            const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
            const rgba = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return Array.from(ctx.getImageData(0, 0, 1, 1).data); };
            const blend = (foreground, background) => foreground.slice(0, 3).map((channel, i) => channel * foreground[3] / 255 + background[i] * (1 - foreground[3] / 255));
            const luminance = rgb => rgb.map(channel => { channel /= 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }).reduce((sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i], 0);
            return Array.from(document.querySelectorAll('body *')).flatMap(element => {
                const text = Array.from(element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim();
                const rect = element.getBoundingClientRect();
                if (!text || !rect.width || !rect.height || rect.top >= innerHeight || rect.bottom <= 0 || rect.left >= innerWidth || element.closest('[inert], [aria-hidden="true"], :disabled, .sr-only, script, style')) return [];
                const chain = []; for (let parent = element; parent; parent = parent.parentElement) chain.unshift(parent);
                if (chain.some(parent => +getComputedStyle(parent).opacity < 1)) return [];
                const style = getComputedStyle(element);
                const background = chain.reduce((color, parent) => blend(rgba(getComputedStyle(parent).backgroundColor), color), [255, 255, 255]);
                const foreground = blend(rgba(style.color), background);
                const a = luminance(foreground), b = luminance(background);
                const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
                const large = parseFloat(style.fontSize) >= 24 || (+style.fontWeight >= 700 && parseFloat(style.fontSize) >= 18.6667);
                return [{ text: text.slice(0, 100), ratio, required: large ? 3 : 4.5 }];
            });
        })()`);
        await writeFile(
            join(artifacts, `${name}-contrast.json`),
            JSON.stringify(samples, null, 2),
        );
        assert.deepEqual(
            samples.filter((sample) => sample.ratio < sample.required),
            [],
        );
    };
    const filteringChecks = async (
        locale: string,
        width: number,
        height: number,
        fontSize: number,
    ) => {
        const messages = JSON.parse(
            await readFile(`messages/${locale}.json`, "utf8"),
        );
        const original = await evaluate(`({
            width: innerWidth, height: innerHeight, fontSize: document.documentElement.style.fontSize,
            entries: [...window.fixtureStates.gate_telemetry.obj.entries],
            audio: window.fixtureStates.app_state.obj.home_right_rail.audio_metrics,
            gate: window.fixtureStates.app_state.obj.home_right_rail.gate,
        })`);
        const reasons = [
            null,
            "Empty",
            "DuplicateNormalizedText",
            "PendingDrasticChange",
            "NoVoiceActivity",
            "KnownHallucination",
            "AmbiguousHallucination",
            null,
        ];
        const decisions = [
            "emit",
            "reason_empty",
            "reason_duplicate",
            "reason_drastic",
            "reason_no_voice",
            "reason_known_hallucination",
            "reason_ambiguous_hallucination",
            "suppress",
        ];
        const entries = Array.from({ length: 14 }, (_, index) => ({
            sequence: index === 13 ? 9007199254740991 : index + 1,
            segment_id: `filtering-${index}`,
            decision: index % 8 === 0 ? "Emit" : "Suppress",
            suppression_reason: reasons[index % 8],
            candidate_words: index === 13 ? 123456789012345 : index,
            distance:
                index % 2 === 0 ? null : index === 13 ? 123456789012345 : 3,
            evaluate_ms:
                index === 13 ? 123456789012345 : index % 2 === 0 ? 1.2 : 12.3,
        }));
        const key = async (value: string, modifiers = 0) => {
            await cdp("Input.dispatchKeyEvent", {
                type: "keyDown",
                key: value,
                code: value,
                modifiers,
            });
            await cdp("Input.dispatchKeyEvent", {
                type: "keyUp",
                key: value,
                code: value,
                modifiers,
            });
            await delay(30);
        };
        const measureFit = async (name: string) => {
            const result = await evaluate(`(() => {
                const viewport = document.querySelector('[data-details-scroll]');
                const list = viewport.querySelector('[data-caption-filtering]');
                const rows = list && !list.hidden ? [...list.children].filter(row => !row.hidden) : [];
                const bounds = viewport.getBoundingClientRect();
                const overflow = viewport.scrollHeight - viewport.clientHeight;
                const complete = rows.every(row => {
                    const rect = row.getBoundingClientRect();
                    return rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
                });
                const hidden = list?.hidden;
                if (list) list.hidden = true;
                const baselineOverflow = viewport.scrollHeight - viewport.clientHeight;
                if (list) list.hidden = hidden;
                return { count: rows.length, overflow, baselineOverflow, complete };
            })()`);
            assert.ok(
                result.overflow <= result.baselineOverflow + 1,
                `${name}: filtering adds no vertical overflow: ${JSON.stringify(result)}`,
            );
            assert.equal(
                result.complete,
                true,
                `${name}: every visible row fits completely`,
            );
            return result;
        };
        const checkHelp = async (
            {
                id,
                index,
                labels,
                descriptions,
            }: {
                id: string;
                index: number;
                labels: string[];
                descriptions: string[];
            },
            name: string,
        ) => {
            const expanded = await evaluate(
                `document.querySelectorAll('#home-details [data-collapsible-trigger]')[${index}].getAttribute('aria-expanded')`,
            );
            const header = await evaluate(`(() => {
                const button = document.getElementById('${id}');
                const trigger = document.querySelectorAll('#home-details [data-collapsible-trigger]')[${index}];
                const help = button.getBoundingClientRect();
                const title = trigger.querySelector('span').getBoundingClientRect();
                const chevron = trigger.querySelector('[data-disclosure-chevron]').getBoundingClientRect();
                const content = document.getElementById(trigger.getAttribute('aria-controls'));
                return {
                    buttons: button.parentElement.querySelectorAll('button').length,
                    fieldButtons: content.querySelectorAll('button').length,
                    left: help.right <= title.left && title.right <= chevron.left + 1,
                    separate: !trigger.contains(button),
                };
            })()`);
            assert.deepEqual(
                header,
                { buttons: 2, fieldButtons: 0, left: true, separate: true },
                `${name}: one left header help button, separate from disclosure`,
            );
            await evaluate(
                `document.querySelector('#${id}').scrollIntoView({ block: 'center' })`,
            );
            const helpBounds = await evaluate(
                `(() => { const r = document.querySelector('#${id}').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
            );
            await cdp("Input.dispatchMouseEvent", {
                type: "mouseMoved",
                ...helpBounds,
            });
            await until(
                () =>
                    evaluate(
                        `!!document.querySelector('#${id}').getAttribute('aria-describedby')`,
                    ),
                `${name}: help opens on hover`,
            );
            await key("Escape");
            await until(
                () => evaluate(`!document.querySelector('[role="tooltip"]')`),
                `${name}: Escape dismisses help`,
            );
            await cdp("Input.dispatchMouseEvent", {
                type: "mouseMoved",
                x: 1,
                y: 1,
            });
            await evaluate(`document.querySelector('#${id}').focus()`);
            await key("Tab");
            await key("Tab", 8);
            await until(
                () =>
                    evaluate(
                        `!!document.querySelector('#${id}').getAttribute('aria-describedby')`,
                    ),
                `${name}: help opens on focus`,
            );
            await delay(150);
            const tooltip = await evaluate(`(() => {
                const button = document.querySelector('#${id}');
                const tip = document.getElementById(button.getAttribute('aria-describedby'));
                const bounds = tip.getBoundingClientRect();
                const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
                return {
                    labels: [...tip.querySelectorAll('dt')].map(el => el.textContent.trim()),
                    descriptions: [...tip.querySelectorAll('dd')].map(el => el.textContent.trim()),
                    bounds: bounds.toJSON(),
                    width: tip.clientWidth, scrollWidth: tip.scrollWidth,
                    fits: bounds.width > 0 && bounds.height > 0 && bounds.left >= -1 && bounds.right <= innerWidth + 1 && bounds.top >= -1 && bounds.bottom <= innerHeight + 1 && tip.scrollWidth <= tip.clientWidth + 1,
                    scrolls: tip.scrollHeight > tip.clientHeight,
                    receivesPointer: tip.contains(hit),
                    expanded: document.querySelectorAll('#home-details [data-collapsible-trigger]')[${index}].getAttribute('aria-expanded'),
                };
            })()`);
            await writeFile(
                join(artifacts, `${name}-help.json`),
                JSON.stringify(tooltip, null, 2),
            );

            assert.deepEqual(
                tooltip.labels,
                labels,
                `${name}: descriptive tooltip headings`,
            );
            assert.deepEqual(tooltip.descriptions, descriptions);
            assert.equal(
                tooltip.receivesPointer,
                true,
                `${name}: help is above the drawer backdrop and receives pointer input`,
            );
            assert.equal(
                tooltip.fits,
                true,
                `${name}: help fits viewport: ${JSON.stringify(tooltip.bounds)}`,
            );
            assert.equal(
                tooltip.expanded,
                expanded,
                `${name}: help does not toggle the section`,
            );
            if (tooltip.scrolls) {
                const position = () =>
                    evaluate(`(() => {
                    const button = document.querySelector('#${id}');
                    const tip = document.getElementById(button.getAttribute('aria-describedby'));
                    return { top: tip.scrollTop, end: tip.scrollHeight - tip.clientHeight, focused: document.activeElement === button };
                })()`);
                for (const [down, up] of [
                    ["ArrowDown", "ArrowUp"],
                    ["PageDown", "PageUp"],
                    ["End", "Home"],
                ] as const) {
                    await key(down);
                    const lower = await position();
                    assert.ok(
                        lower.top > 0 && lower.focused,
                        `${name}: ${down} scrolls help without moving focus`,
                    );
                    if (down === "End")
                        assert.ok(
                            Math.abs(lower.top - lower.end) <= 1,
                            `${name}: final explanation reachable`,
                        );
                    await key(up);
                    assert.equal(
                        (await position()).top,
                        0,
                        `${name}: ${up} scrolls back`,
                    );
                }
                const pointer = {
                    x: tooltip.bounds.x + tooltip.bounds.width / 2,
                    y: tooltip.bounds.y + tooltip.bounds.height / 2,
                };
                await cdp("Input.dispatchMouseEvent", {
                    type: "mouseMoved",
                    ...pointer,
                });
                await cdp("Input.dispatchMouseEvent", {
                    type: "mouseWheel",
                    ...pointer,
                    deltaX: 0,
                    deltaY: 160,
                });
                await until(
                    async () => (await position()).top > 0,
                    `${name}: mouse wheel scrolls help`,
                );
                await key("Home");
            }
            await key("Escape");
            await until(
                () => evaluate(`!document.querySelector('[role="tooltip"]')`),
                `${name}: focused help dismisses`,
            );
            assert.equal(
                await evaluate(
                    `!!document.querySelector('#home-details') && document.querySelectorAll('#home-details [data-collapsible-trigger]')[${index}].getAttribute('aria-expanded') === '${expanded}'`,
                ),
                true,
                `${name}: Escape leaves Details open`,
            );
            await evaluate(`document.getElementById('${id}').blur()`);
        };
        const sectionHelp = [
            {
                id: "home-audio-help",
                index: 0,
                labels: [
                    messages.home_rail_inference,
                    messages.home_rail_rms,
                    messages.home_rail_vad,
                    messages.home_rail_vad_skip_rate,
                    messages.home_rail_vad_speech_ratio,
                    messages.home_help_inference_deviation_label,
                    [
                        messages.home_rail_inference_p90,
                        messages.home_rail_inference_p95,
                        messages.home_rail_inference_p99,
                    ].join(" / "),
                ],
                descriptions: [
                    "inference",
                    "rms",
                    "vad",
                    "vad_skip_rate",
                    "vad_speech_ratio",
                    "inference_deviation",
                    "inference_percentiles",
                ].map((field) => messages[`home_help_${field}`]),
            },
            {
                id: "home-filtering-help",
                index: 1,
                labels: [
                    messages.home_help_gate_seq_label,
                    messages.home_rail_gate_decision,
                    messages.home_rail_gate_words,
                    messages.home_help_gate_distance_label,
                    messages.home_help_gate_time_label,
                ],
                descriptions: [
                    "seq",
                    "decision",
                    "words",
                    "distance",
                    "time",
                ].map((field) => messages[`home_help_gate_${field}`]),
            },
        ];
        {
            const name = `filtering-${locale}-${width}-${fontSize}`;
            await cdp("Emulation.setDeviceMetricsOverride", {
                width,
                height,
                deviceScaleFactor: 1,
                mobile: false,
            });
            await evaluate(`document.documentElement.style.fontSize = '${fontSize}px';
                window.fixtureStates.app_state.obj.home_right_rail.audio_metrics = false;
                window.fixtureStates.app_state.obj.home_right_rail.gate = true`);
            await delay(250);
            for (const fixture of [
                [],
                ...entries.slice(0, 8).map((entry) => [entry]),
                entries,
            ] as const) {
                await evaluate(
                    `document.querySelector('[data-details-scroll]').scrollTop = 0;
                    window.fixtureStates.gate_telemetry.obj.entries = ${JSON.stringify(fixture)}`,
                );
                await delay(50);
                const fit = await measureFit(name);
                const actual = await evaluate(`(() => {
                    const panel = document.querySelector('#home-details');
                    const scroller = panel.querySelector('.overflow-y-auto');
                    const list = panel.querySelector('[data-caption-filtering]');
                    const bounds = panel.getBoundingClientRect();
                    const rows = list && !list.hidden ? [...list.children].filter(row => !row.hidden) : [];
                    const fields = rows.flatMap(row => [...row.querySelectorAll('span, dt, dd')]);
                    return {
                        count: rows.length,
                        empty: panel.textContent.includes(${JSON.stringify(messages.home_rail_gate_empty)}),
                        overflow: [panel, scroller, list, ...fields].filter(Boolean).filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.outerHTML.slice(0, 200)),
                        clipped: fields.filter(el => {
                            const range = document.createRange(); range.selectNodeContents(el);
                            return [...range.getClientRects()].some(rect => rect.left < bounds.left - 1 || rect.right > bounds.right + 1);
                        }).map(el => el.textContent),
                        rows: rows.map(row => ({
                            sequence: row.firstElementChild.firstElementChild.textContent.trim(),
                            decision: row.querySelector('[title]').textContent.trim(),
                            segment: row.querySelector('[title]').title,
                            live: row.querySelector('[title]').classList.contains('text-status-live'),
                            labels: [...row.querySelectorAll('dt')].map(el => el.textContent.trim()),
                            values: [...row.querySelectorAll('dd')].map(el => el.textContent.trim()),
                        })),
                    };
                })()`);
                const expected = fixture
                    .slice(-12)
                    .reverse()
                    .slice(0, fit.count);
                assert.equal(
                    actual.count,
                    expected.length,
                    `${name}: newest entries that fit`,
                );
                if (width === 1254 && fixture.length)
                    assert.ok(
                        actual.count > 0,
                        `${name}: available space shows recent checks`,
                    );
                assert.equal(
                    actual.empty,
                    !fixture.length,
                    `${name}: empty state`,
                );
                if (actual.overflow.length) {
                    const geometry = await evaluate(`(() => {
                        const scroller = document.querySelector('[data-details-scroll]');
                        return [scroller, ...scroller.querySelectorAll('*')].map(node => ({
                            tag:node.tagName, text:node.textContent.slice(0,60), class:node.className,
                            rect:node.getBoundingClientRect().toJSON(), scroll:node.scrollWidth,
                            padding:getComputedStyle(node).padding, minWidth:getComputedStyle(node).minWidth,
                        }));
                    })()`);
                    await writeFile(
                        join(artifacts, `${name}-overflow.json`),
                        JSON.stringify(geometry, null, 2),
                    );
                }
                assert.deepEqual(
                    actual.overflow,
                    [],
                    `${name}: no horizontal overflow`,
                );
                assert.deepEqual(
                    actual.clipped,
                    [],
                    `${name}: all field text fits the panel`,
                );
                assert.deepEqual(
                    actual.rows,
                    expected.map((entry) => ({
                        sequence: `#${entry.sequence}`,
                        decision:
                            messages[
                                `home_rail_gate_${decisions[Number(entry.segment_id.split("-")[1]) % 8]}`
                            ],
                        segment: entry.segment_id,
                        live: entry.decision === "Emit",
                        labels: [
                            messages.home_rail_gate_words,
                            messages.home_rail_gate_distance,
                            messages.home_rail_gate_time,
                        ],
                        values: [
                            String(entry.candidate_words),
                            entry.distance === null
                                ? "-"
                                : String(entry.distance),
                            entry.evaluate_ms.toFixed(
                                entry.evaluate_ms < 10 ? 1 : 0,
                            ),
                        ],
                    })),
                    `${name}: all fields, formatting, and ordering preserved`,
                );
            }
            await evaluate(
                `window.fixtureStates.gate_telemetry.obj.entries = ${JSON.stringify(entries.slice(0, 12))}`,
            );
            await delay(100);
            const full = await measureFit(name);
            await cdp("Emulation.setDeviceMetricsOverride", {
                width,
                height: height - 240,
                deviceScaleFactor: 1,
                mobile: false,
            });
            await delay(250);
            const shorter = await measureFit(`${name} shorter`);
            assert.ok(
                shorter.count <= full.count,
                `${name}: shorter windows show fewer entries`,
            );
            if (width === 1254)
                assert.ok(
                    shorter.count < full.count,
                    `${name}: reducing height removes older entries`,
                );
            await cdp("Emulation.setDeviceMetricsOverride", {
                width,
                height,
                deviceScaleFactor: 1,
                mobile: false,
            });
            await delay(250);
            assert.equal(
                (await measureFit(`${name} restored`)).count,
                full.count,
                `${name}: growing the window restores entries`,
            );
            await evaluate(
                `window.fixtureStates.app_state.obj.home_right_rail.audio_metrics = true`,
            );
            await delay(300);
            const audio = await measureFit(`${name} audio expanded`);
            assert.ok(
                audio.count <= full.count,
                `${name}: expanded audio reduces history space`,
            );
            if (width === 1254)
                assert.ok(
                    audio.count < full.count,
                    `${name}: opening audio removes older entries`,
                );
            await evaluate(`window.fixtureStates.app_state.obj.home_right_rail.audio_metrics = false;
                document.querySelector('[data-details-scroll]').scrollTop = 0`);
            await delay(300);
            assert.equal(
                (await measureFit(`${name} audio closed`)).count,
                full.count,
                `${name}: closing audio restores entries`,
            );
            await writeFile(
                join(artifacts, `${name}-fit.json`),
                JSON.stringify({ full, shorter, audio }, null, 2),
            );
            for (const open of [false, true] as const) {
                await evaluate(`window.fixtureStates.app_state.obj.home_right_rail.audio_metrics = ${open};
                    window.fixtureStates.app_state.obj.home_right_rail.gate = ${open}`);
                await delay(250);
                for (const help of sectionHelp) {
                    await checkHelp(
                        help,
                        `${name}-${help.id}-${open ? "open" : "closed"}`,
                    );
                }
            }
            await evaluate(`window.fixtureStates.app_state.obj.home_right_rail.audio_metrics = false;
                window.fixtureStates.app_state.obj.home_right_rail.gate = true`);
            await delay(250);
            await evaluate(`document.querySelector('#home-filtering-help').blur();
                window.fixtureStates.gate_telemetry.obj.entries = ${JSON.stringify(entries.slice(0, 12))};
                document.querySelector('#home-details .overflow-y-auto').scrollTop = 0`);
            await delay(50);
        }
        await cdp("Emulation.setDeviceMetricsOverride", {
            width: original.width,
            height: original.height,
            deviceScaleFactor: 1,
            mobile: false,
        });
        await evaluate(`document.documentElement.style.fontSize = ${JSON.stringify(original.fontSize)};
            window.fixtureStates.gate_telemetry.obj.entries = ${JSON.stringify(original.entries)};
            window.fixtureStates.app_state.obj.home_right_rail.audio_metrics = ${original.audio};
            window.fixtureStates.app_state.obj.home_right_rail.gate = ${original.gate}`);
        await delay(250);
    };
    const duration = async (
        selector: string,
        property: string,
        expected: number,
    ) => {
        const values = await evaluate<string[]>(
            `Array.from(document.querySelectorAll(${JSON.stringify(selector)}), element => getComputedStyle(element)[${JSON.stringify(property)}])`,
        );
        assert.ok(values.length, `${selector}: rendered for timing check`);
        for (const value of values) {
            assert.ok(
                value
                    .split(",")
                    .every(
                        (part) =>
                            Math.abs(parseFloat(part) - expected) < 0.000001,
                    ),
                `${selector}: ${property} is ${expected}s, got ${value}`,
            );
        }
    };
    const activeNav = async (href: string | null) => {
        const state = await evaluate(`(async () => {
            await document.fonts.ready;
            await new Promise(requestAnimationFrame);
            const marker = document.querySelector('.nav-active-indicator');
            await Promise.all(marker.getAnimations().map(animation => animation.finished.catch(() => {})));
            const links = [...document.querySelectorAll('[data-sidebar="content"] a[aria-current="page"]')];
            const link = links[0];
            return {
                hrefs: links.map(link => link.getAttribute('href')),
                active: link?.dataset.active,
                color: link && getComputedStyle(link.querySelector('svg')).color,
                markerColor: getComputedStyle(marker).backgroundColor,
                visible: marker.dataset.visible,
                opacity: +getComputedStyle(marker).opacity,
                top: marker.getBoundingClientRect().top,
                height: marker.getBoundingClientRect().height,
                rowTop: link?.getBoundingClientRect().top,
                rowHeight: link?.getBoundingClientRect().height,
            };
        })()`);
        assert.deepEqual(state.hrefs, href ? [href] : []);
        assert.equal(state.visible, href ? "true" : "false");
        assert.equal(state.opacity, href ? 1 : 0);
        if (href) {
            assert.equal(state.active, "true");
            assert.equal(
                state.color,
                state.markerColor,
                "Active icon uses the marker accent",
            );
            assert.ok(
                state.height > 0 && Math.abs(state.top - state.rowTop) <= 1,
                `Active navigation marker matches ${href}: ${JSON.stringify(state)}`,
            );
            assert.ok(Math.abs(state.height - state.rowHeight) <= 1);
        }
    };
    const navTransitions = async (name: string, reducedMotion = false) => {
        const transitions = [];
        for (const href of ["/overlay", "/settings", "/about", "/"] as const) {
            const frames = await evaluate<NavFrame[]>(`(async () => {
                const marker = document.querySelector('.nav-active-indicator');
                const sample = () => {
                    const style = getComputedStyle(marker);
                    return { top: marker.getBoundingClientRect().top, opacity: +style.opacity,
                        properties: style.transitionProperty, durations: style.transitionDuration };
                };
                const frames = [sample()];
                document.querySelector('a[href="${href}"]').click();
                const started = performance.now();
                let arrived;
                await new Promise((resolve, reject) => {
                    const frame = now => {
                        frames.push(sample());
                        if (location.pathname === '${href}') arrived ??= now;
                        if (arrived && now - arrived > 250) return resolve();
                        if (now - started > 15000) return reject(new Error('Navigation timed out: ${href}'));
                        requestAnimationFrame(frame);
                    };
                    requestAnimationFrame(frame);
                });
                return frames;
            })()`);
            transitions.push({ href, frames });
            await activeNav(href === "/about" ? null : href);
            const start = frames[0];
            const end = frames.at(-1)!;
            const expected = reducedMotion
                ? [0.00001, 0.00001, 0.00001]
                : [0.08, 0.08, 0.15];
            assert.equal(end.properties, "transform, height, opacity");
            const durations = end.durations.split(",").map(parseFloat);
            assert.deepEqual(
                expected.map((_, index) => durations[index % durations.length]),
                expected,
            );
            for (const property of ["top", "opacity"] as const) {
                if (Math.abs(start[property] - end[property]) < 0.01) continue;
                const intermediate = frames.some(
                    (frame) =>
                        frame[property] >
                            Math.min(start[property], end[property]) + 0.01 &&
                        frame[property] <
                            Math.max(start[property], end[property]) - 0.01,
                );
                assert.equal(
                    intermediate,
                    !reducedMotion,
                    `${name} ${href}: ${property} motion`,
                );
            }
        }
        await writeFile(
            join(artifacts, `nav-${name}.json`),
            JSON.stringify(transitions, null, 2),
        );
    };
    const detailsTransitions = async (name: string, reducedMotion = false) => {
        await evaluate(`window.fixtureStates.app_state.obj.home_right_rail.audio_metrics = true;
            window.fixtureStates.app_state.obj.home_right_rail.gate = true`);
        await delay(250);
        const transitions = [];
        for (const index of [0, 1] as const) {
            for (const open of [false, true] as const) {
                const frames = await evaluate<DetailsFrame[]>(`(async () => {
                    const trigger = document.querySelectorAll('#home-details [data-collapsible-trigger]')[${index}];
                    const content = document.getElementById(trigger.getAttribute('aria-controls'));
                    const sample = () => {
                        const style = getComputedStyle(content);
                        const chevron = getComputedStyle(trigger.querySelector('[data-disclosure-chevron]'));
                        return { height: content.getBoundingClientRect().height, scrollHeight: content.scrollHeight,
                            hidden: content.hidden, expanded: trigger.getAttribute('aria-expanded'),
                            duration: style.animationDuration, easing: style.animationTimingFunction,
                            opacity: +style.opacity, chevronDuration: chevron.transitionDuration,
                            chevronEasing: chevron.transitionTimingFunction,
                            focused: document.activeElement === trigger };
                    };
                    trigger.focus();
                    const frames = [sample()];
                    trigger.dispatchEvent(new KeyboardEvent('keydown', {
                        key: ${JSON.stringify(open ? "Enter" : " ")}, bubbles: true, cancelable: true,
                    }));
                    const started = performance.now();
                    await new Promise(resolve => {
                        const frame = now => {
                            frames.push(sample());
                            if (now - started < 350) requestAnimationFrame(frame);
                            else resolve();
                        };
                        requestAnimationFrame(frame);
                    });
                    return frames;
                })()`);
                transitions.push({ index, open, frames });
                await writeFile(
                    join(artifacts, `details-${name}.json`),
                    JSON.stringify(transitions, null, 2),
                );
                const start = frames[0];
                const end = frames.at(-1)!;
                assert.equal(
                    end.expanded,
                    String(open),
                    `${name}: section ${index} toggles`,
                );
                assert.equal(
                    end.hidden,
                    !open,
                    `${name}: closed content is hidden`,
                );
                assert.ok(
                    end.focused,
                    `${name}: keyboard focus stays on trigger`,
                );
                assert.equal(
                    parseFloat(end.duration),
                    reducedMotion ? 0.00001 : 0.15,
                );
                assert.equal(
                    parseFloat(end.chevronDuration),
                    reducedMotion ? 0.00001 : 0.15,
                );
                assert.equal(end.easing, "cubic-bezier(0, 0, 0.2, 1)");
                assert.equal(end.chevronEasing, end.easing);
                assert.ok(
                    frames.every((frame) => frame.opacity === 1),
                    "Height animation does not fade text",
                );
                const intermediate = frames.some(
                    ({ height }) =>
                        height > Math.min(start.height, end.height) + 1 &&
                        height < Math.max(start.height, end.height) - 1,
                );
                assert.equal(
                    intermediate,
                    !reducedMotion && Math.abs(start.height - end.height) > 1,
                    `${name}: section ${index} has intermediate heights`,
                );
                if (open) {
                    assert.ok(
                        Math.abs(end.scrollHeight - end.height) <= 1,
                        `${name}: open content has natural height`,
                    );
                } else {
                    assert.equal(end.height, 0);
                }
            }
            const recovered = await evaluate(`(async () => {
                const trigger = document.querySelectorAll('#home-details [data-collapsible-trigger]')[${index}];
                const content = document.getElementById(trigger.getAttribute('aria-controls'));
                for (let i = 0; i < 3; i++) {
                    trigger.click();
                    await new Promise(requestAnimationFrame);
                }
                await new Promise(resolve => setTimeout(resolve, 250));
                const closed = content.hidden && content.getBoundingClientRect().height === 0;
                trigger.click();
                await new Promise(resolve => setTimeout(resolve, 250));
                return closed && !content.hidden && Math.abs(content.scrollHeight - content.getBoundingClientRect().height) <= 1;
            })()`);
            assert.ok(
                recovered,
                `${name}: section ${index} recovers after rapid toggles`,
            );
        }
        await writeFile(
            join(artifacts, `details-${name}.json`),
            JSON.stringify(transitions, null, 2),
        );
    };
    const sidebarTransitions = async (name: string, reducedMotion = false) => {
        await evaluate(
            `window.fixtureStates.app_state.obj.sidebar_open = true`,
        );
        await delay(350);
        await duration(
            'div:has(> [data-sidebar="sidebar"])',
            "transitionDuration",
            reducedMotion ? 0.00001 : 0.15,
        );
        await duration(
            ".nav-label",
            "transitionDuration",
            reducedMotion ? 0.00001 : 0.15,
        );
        const transitions = [];
        const minimumControlSize = await evaluate(
            `2 * parseFloat(getComputedStyle(document.documentElement).fontSize)`,
        );
        for (const state of ["collapsed", "expanded"] as const) {
            const frames = await evaluate<SidebarFrame[]>(`(async () => {
                await document.fonts.ready;
                const panel = document.querySelector('[data-sidebar="sidebar"]');
                const content = panel.querySelector('[data-sidebar="content"]');
                const links = [...content.querySelectorAll('a[data-sidebar="menu-button"]')];
                const rect = element => {
                    const { x, y, width, height } = element.getBoundingClientRect();
                    return { x, y, width, height };
                };
                const sample = () => ({
                    width: panel.getBoundingClientRect().width,
                    state: panel.closest('[data-state]').dataset.state,
                    overflow: content.scrollWidth - content.clientWidth,
                    marker: rect(content.querySelector('.nav-active-indicator')),
                    items: links.map(link => ({
                        title: link.textContent.trim(),
                        row: rect(link),
                        icon: rect(link.querySelector('svg')),
                        label: rect(link.querySelector('span')),
                        opacity: +getComputedStyle(link.querySelector('span')).opacity,
                    })),
                });
                const frames = [sample()];
                document.querySelector('[data-sidebar="trigger"]').click();
                const started = performance.now();
                await new Promise(resolve => {
                    const frame = now => {
                        frames.push(sample());
                        if (now - started < 350) requestAnimationFrame(frame);
                        else resolve();
                    };
                    requestAnimationFrame(frame);
                });
                return frames;
            })()`);
            transitions.push({ state, frames });
        }
        await writeFile(
            join(artifacts, `sidebar-${name}.json`),
            JSON.stringify(transitions, null, 2),
        );
        for (const { state, frames } of transitions) {
            const start = frames[0];
            const end = frames.at(-1)!;
            assert.equal(end.state, state, `${name}: sidebar reaches ${state}`);
            assert.ok(start.items.length >= 3, `${name}: navigation rendered`);
            if (!reducedMotion) {
                assert.ok(
                    frames.some(
                        ({ width }) =>
                            width > Math.min(start.width, end.width) + 1 &&
                            width < Math.max(start.width, end.width) - 1,
                    ),
                    `${name}: sampled intermediate ${state} animation frames`,
                );
            } else {
                assert.ok(
                    frames.every(
                        ({ width }) =>
                            Math.abs(width - start.width) <= 1 ||
                            Math.abs(width - end.width) <= 1,
                    ),
                    `${name}: reduced motion uses only endpoint widths`,
                );
            }
            for (const frame of frames) {
                assert.ok(
                    frame.overflow <= 1,
                    `${name}: no horizontal nav overflow`,
                );
                for (const key of ["y", "height"] as const) {
                    assert.ok(
                        Math.abs(frame.marker[key] - start.marker[key]) <= 1,
                        `${name} ${state}: active marker ${key} stays stable`,
                    );
                }
                frame.items.forEach((item, index) => {
                    assert.ok(
                        item.row.width >= minimumControlSize - 0.1 &&
                            item.row.height >= minimumControlSize - 0.1,
                        `${name}: ${item.title} retains its minimum hit area`,
                    );
                    for (const [element, keys] of [
                        ["row", ["x", "y", "height"]],
                        ["icon", ["x", "y", "width", "height"]],
                    ] as const) {
                        for (const key of keys) {
                            assert.ok(
                                Math.abs(
                                    item[element][key] -
                                        start.items[index][element][key],
                                ) <= 1,
                                `${name} ${state}: ${item.title} ${element} ${key} stays stable`,
                            );
                        }
                    }
                });
            }
            for (const item of end.items) {
                assert.equal(item.opacity, state === "expanded" ? 1 : 0);
                if (state === "expanded") {
                    assert.ok(
                        item.label.x + item.label.width <=
                            item.row.x + item.row.width + 1 &&
                            item.label.y + item.label.height <=
                                item.row.y + item.row.height + 1,
                        `${name}: expanded label fits its row`,
                    );
                }
            }
        }
    };

    return {
        contrastReport,
        filteringChecks,
        duration,
        activeNav,
        navTransitions,
        detailsTransitions,
        sidebarTransitions,
    };
}
test("Home caption workflow, navigation, responsive Details and recovery", async ({
    app,
}) => {
    const { evaluate, cdp, viewport, key, click, errors, artifacts } = app;

    const {
        contrastReport,
        duration,
        activeNav,
        navTransitions,
        detailsTransitions,
        sidebarTransitions,
    } = homeChecks(app);
    await cdp("Emulation.setDeviceMetricsOverride", {
        width: 1300,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
    });
    await app.page.goto("/");
    await until(
        () =>
            evaluate(`document.querySelector('#home-details-toggle') !== null`),
        "Homepage did not render",
    );
    await activeNav("/");
    await duration("#home-details-toggle", "transitionDuration", 0.08);
    await duration(".ls-trigger", "transitionDuration", 0.08);
    await evaluate(`(async () => {
        window.fixtureStates = await import('/src/lib/stores/state.svelte.ts');
        window.fixtureSession = (await import('/src/lib/stores/session.svelte.ts')).session;
        for (const state of Object.values(window.fixtureStates)) state.ready = true;
    })()`);
    assert.equal(
        await evaluate(`getComputedStyle(document.body).backgroundColor`),
        "rgb(16, 17, 20)",
    );
    assert.equal(
        await evaluate(
            `document.querySelector('[data-sidebar="header"] a span').textContent.trim()`,
        ),
        "SCRYBE",
    );

    await contrastReport("empty");
    await sidebarTransitions("en");
    await evaluate(`document.documentElement.style.fontSize = '32px'`);
    await sidebarTransitions("en-enlarged");
    await evaluate(`document.documentElement.style.fontSize = '16px'`);
    await evaluate(`document.querySelector('.ls-trigger').click()`);
    await delay(200);
    assert.equal(
        await evaluate(
            `getComputedStyle(document.querySelector('.ls-content')).backgroundColor`,
        ),
        "rgb(31, 35, 41)",
    );

    await cdp("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
    });
    await cdp("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Escape",
        code: "Escape",
    });
    await evaluate(`document.querySelector('#home-details-toggle').click()`);
    await until(
        () =>
            evaluate(
                `document.querySelector('#home-details')?.getAttribute('aria-hidden') === 'false'`,
            ),
        "Details did not open",
    );
    await duration("#home-details", "transitionDuration", 0.15);
    await detailsTransitions("desktop-empty");
    await evaluate(`window.fixtureStates.app_state.obj.home_right_rail.audio_metrics = true; window.fixtureStates.app_state.obj.home_right_rail.gate = true;
        Object.assign(window.fixtureStates.audio_metrics.obj, { inference_sample_count: 20, last_inference_ms: 123, input_rms: 0.12, inference_std_dev_ms: 20, inference_p90_ms: 160, inference_p95_ms: 180, inference_p99_ms: 200, vad_total_evaluations: 20, last_vad_ms: 4, vad_skip_rate: 0.2, vad_speech_ratio: 0.6 });
        window.fixtureStates.gate_telemetry.obj.entries = [{ sequence: 1, segment_id: 'fixture', candidate_words: 4, decision: 'Suppress', suppression_reason: 'PendingDrasticChange', distance: 3, evaluate_ms: 1.2 }];
        window.fixtureStates.internal_state.obj.transcribe_running = true;
        window.fixtureSession.add_segment({ id: 'sample', index: 0, items: [{ text: 'Welcome to the stream. These captions keep updating as you speak.', start_time: 0, end_time: 2000 }] });`);
    await delay(350);
    const audioFields = await evaluate(`(() => {
        const trigger = document.querySelector('#home-details [data-collapsible-trigger]');
        const content = document.getElementById(trigger.getAttribute('aria-controls'));
        return [...content.querySelectorAll('dl')].map(group => [...group.children].map(field => ({
            label: field.querySelector('dt').textContent.trim(),
            value: field.querySelector('dd').textContent.trim(),
        })));
    })()`);
    assert.deepEqual(
        audioFields,
        [
            [
                { label: "Inference", value: "123 ms" },
                { label: "RMS", value: "0.120" },
                { label: "VAD", value: "4.0 ms" },
                { label: "VAD skips", value: "20%" },
                { label: "Speech", value: "60%" },
            ],
            [
                { label: "Dev", value: "20 ms" },
                { label: "p90", value: "160 ms" },
                { label: "p95", value: "180 ms" },
                { label: "p99", value: "200 ms" },
            ],
        ],
        "Audio preserves all nine values and their grouping",
    );
    await detailsTransitions("desktop-populated");
    const gateGrowth = await evaluate(`(async () => {
        const trigger = document.querySelectorAll('#home-details [data-collapsible-trigger]')[1];
        const content = document.getElementById(trigger.getAttribute('aria-controls'));
        const before = content.getBoundingClientRect().height;
        const original = [...window.fixtureStates.gate_telemetry.obj.entries];
        window.fixtureStates.gate_telemetry.obj.entries = Array.from({ length: 6 }, (_, i) => ({ ...original[0], sequence: i + 1 }));
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        const after = content.getBoundingClientRect().height;
        const natural = Math.abs(content.scrollHeight - after) <= 1;
        const list = content.querySelector('[data-caption-filtering]');
        const fits = list.scrollWidth <= list.clientWidth + 1;
        const viewport = document.querySelector('[data-details-scroll]');
        const fitsHeight = viewport.scrollHeight <= viewport.clientHeight + 1;
        window.fixtureStates.gate_telemetry.obj.entries = original;
        return { before, after, natural, fits, fitsHeight };
    })()`);
    assert.ok(
        gateGrowth.after >= gateGrowth.before &&
            gateGrowth.natural &&
            gateGrowth.fitsHeight,
        "Expanded filtering stays within the available height as checks arrive",
    );
    assert.ok(
        gateGrowth.fits,
        "Caption filtering fits without horizontal scrolling",
    );
    await delay(100);

    await contrastReport("live-details");
    await cdp("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Tab",
        code: "Tab",
    });
    await evaluate(`document.querySelector('#home-audio-help').focus()`);
    await delay(300);
    await until(
        () => evaluate(`!!document.querySelector('[role="tooltip"]')`),
        "Metric help did not open on focus",
    );
    assert.equal(
        await evaluate(
            `document.activeElement.getAttribute('aria-describedby') === document.querySelector('[role="tooltip"]').id && !!document.querySelector('[role="tooltip"]').id`,
        ),
        true,
    );

    await duration('[role="tooltip"]', "animationDuration", 0.08);
    await contrastReport("tooltip");
    await cdp("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
    });
    await evaluate(
        `window.fixtureFailure = 'stop_transcribe'; document.querySelector('button[aria-label="Stop"]').click()`,
    );
    await until(
        () =>
            evaluate(
                `document.body.textContent.includes('Could not stop captions.')`,
            ),
        "Stop error did not render",
    );
    assert.equal(
        await evaluate(
            `document.querySelector('[data-inbound-toast] details')`,
        ),
        null,
    );
    const errorTarget = await evaluate(
        `(() => { const r = document.querySelector('[data-inbound-toast]').getBoundingClientRect(); return { x: r.x + 8, y: r.y + 8 }; })()`,
    );
    await cdp("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        ...errorTarget,
    });
    await evaluate(
        `document.querySelector('[data-inbound-toast] button').focus()`,
    );
    await delay(500);

    await duration("[data-sonner-toast]", "transitionDuration", 0.15);
    await contrastReport("error");
    assert.equal(
        await evaluate(
            `document.querySelector('[data-sonner-toast] button').getBoundingClientRect().bottom <= window.innerHeight`,
        ),
        true,
    );
    await delay(10500);
    assert.equal(
        await evaluate(
            `document.querySelector('[data-inbound-toast]').textContent.includes('Fixture diagnostic <private>')`,
        ),
        false,
    );
    assert.equal(
        await evaluate(
            `window.fixtureCalls.filter(command => command === 'stop_transcribe').length`,
        ),
        1,
    );
    await evaluate(
        `document.querySelector('[data-inbound-toast] button:last-child').click()`,
    );
    await until(
        () => evaluate(`!!document.querySelector('[data-inbound-wizard]')`),
        "Report did not open",
    );
    for (
        let step = 0;
        step < 10 &&
        (await evaluate(
            `document.querySelector('[data-inbound-wizard]').dataset.step`,
        )) !== "error";
        step++
    ) {
        await until(
            () =>
                evaluate(
                    `!!document.querySelector('[data-inbound-action="next"]:disabled')===false && !!document.querySelector('[data-inbound-action="next"]')`,
                ),
            "Report details did not load",
        );
        await evaluate(
            `document.querySelector('[data-inbound-action="next"]').click()`,
        );
        await delay(50);
    }
    assert.equal(
        await evaluate(
            `document.querySelector('[data-inbound-wizard]').dataset.step`,
        ),
        "error",
    );
    assert.equal(
        await evaluate(
            `document.querySelector('[data-inbound-preview]').textContent.includes('Fixture diagnostic <private>')`,
        ),
        true,
    );

    await cdp("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
    });
    await cdp("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Escape",
        code: "Escape",
    });
    await until(
        () => evaluate(`!document.querySelector('[data-inbound-wizard]')`),
        "Report did not close",
    );
    await cdp("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await sidebarTransitions("en-reduced-motion", true);
    await detailsTransitions("desktop-reduced-motion", true);
    await navTransitions("reduced-motion", true);
    await evaluate(
        `document.querySelector('[data-sidebar="trigger"]').click()`,
    );
    await delay(100);
    assert.equal(
        await evaluate(
            `document.querySelector('[data-state="collapsed"]') !== null`,
        ),
        true,
    );

    await activeNav("/");
    await navTransitions("collapsed-reduced-motion", true);
    await cdp("Emulation.setDeviceMetricsOverride", {
        width: 880,
        height: 560,
        deviceScaleFactor: 1,
        mobile: false,
    });
    await until(
        () => evaluate(`!!document.querySelector('[role="dialog"]')`),
        "Narrow Details sheet did not open",
    );
    await detailsTransitions("narrow-reduced-motion", true);
    await cdp("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
    });
    await duration("#home-details", "animationDuration", 0.15);
    await duration("[data-dialog-overlay]", "animationDuration", 0.15);
    await detailsTransitions("narrow-populated");
    await cdp("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });

    await evaluate(
        `document.querySelector('[aria-label="Close details"]').click()`,
    );
    await delay(100);
    assert.equal(
        await evaluate(`document.activeElement.id`),
        "home-details-toggle",
    );
    await evaluate(`localStorage.setItem('PARAGLIDE_LOCALE', 'ru')`);
    await app.page.reload();
    await until(
        () => evaluate(`document.body.textContent.includes('Новая сессия')`),
        "Russian copy did not render",
    );
    await evaluate(`(async () => {
        window.fixtureStates = await import('/src/lib/stores/state.svelte.ts');
        window.fixtureSession = (await import('/src/lib/stores/session.svelte.ts')).session;
        for (const state of Object.values(window.fixtureStates)) state.ready = true;
    })()`);
    await cdp("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
    });
    await sidebarTransitions("ru");

    await evaluate(`document.documentElement.style.fontSize = '32px'`);
    await sidebarTransitions("ru-enlarged");
    const originalNavLabel = await evaluate(`(() => {
        const label = document.querySelector('[data-sidebar="menu-button"] span');
        const original = label.textContent;
        label.textContent = Array(3).fill(original).join(' ');
        return original;
    })()`);
    assert.equal(
        await evaluate(`(() => {
            const label = document.querySelector('[data-sidebar="menu-button"] span');
            return label.getBoundingClientRect().height > parseFloat(getComputedStyle(label).lineHeight);
        })()`),
        true,
        "Long navigation labels still wrap",
    );
    await sidebarTransitions("ru-wrapped-enlarged");
    await activeNav("/");
    await navTransitions("wrapped-enlarged");

    await evaluate(
        `document.querySelector('[data-sidebar="menu-button"] span').textContent = ${JSON.stringify(originalNavLabel)}`,
    );
    await delay(250);

    assert.equal(
        await evaluate(
            `Array.from(document.querySelectorAll('[data-sidebar="menu-button"] span')).every(el => el.scrollWidth <= el.clientWidth + 1)`,
        ),
        true,
    );
    assert.equal(
        await evaluate(
            `document.documentElement.scrollWidth <= window.innerWidth`,
        ),
        true,
    );
    await evaluate(
        `document.querySelector('#home-details-toggle').click(); window.fixtureStates.app_state.obj.home_right_rail.audio_metrics = true`,
    );
    await delay(200);
    await detailsTransitions("narrow-enlarged-ru");

    await evaluate(
        `document.querySelector('[aria-label="Закрыть подробности"]').click(); document.documentElement.style.fontSize = '16px'`,
    );
    await cdp("Emulation.setDeviceMetricsOverride", {
        width: 1300,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
    });
    for (const route of ["overlay", "settings"] as const) {
        await evaluate(`document.querySelector('a[href="/${route}"]').click()`);
        await until(
            () =>
                evaluate(
                    `location.pathname === '/${route}' && document.querySelector('#home-details-toggle') === null`,
                ),
            `${route} did not render`,
        );
        await delay(250);
        assert.equal(
            await evaluate(`getComputedStyle(document.body).backgroundColor`),
            "rgb(16, 17, 20)",
        );

        if (route === "settings") {
            await evaluate(
                `window.fixtureStates.internal_state.obj.transcribe_running = false`,
            );
            await until(
                () =>
                    evaluate(
                        `!document.querySelector('#device-select').disabled`,
                    ),
                "Device menu did not become available",
            );
            await evaluate(`document.querySelector('#device-select').focus()`);
            await cdp("Input.dispatchKeyEvent", {
                type: "keyDown",
                key: "ArrowDown",
                code: "ArrowDown",
            });
            await cdp("Input.dispatchKeyEvent", {
                type: "keyUp",
                key: "ArrowDown",
                code: "ArrowDown",
            });
            await until(
                () =>
                    evaluate(
                        `!!document.querySelector('[data-select-content]')`,
                    ),
                "Device menu did not open",
            );
            await duration("[data-select-content]", "animationDuration", 0.15);
            await cdp("Input.dispatchKeyEvent", {
                type: "keyDown",
                key: "Escape",
                code: "Escape",
            });
            await cdp("Input.dispatchKeyEvent", {
                type: "keyUp",
                key: "Escape",
                code: "Escape",
            });
        }
    }
    await navTransitions("expanded");
    await evaluate(
        `document.querySelector('[data-sidebar="trigger"]').click()`,
    );
    await delay(200);
    await navTransitions("collapsed");
    assert.deepEqual(errors, []);
});
for (const locale of ["en", "ru"] as const) {
    for (const [width, height, fontSize] of [
        [1254, 824, 16],
        [1300, 900, 32],
        [880, 560, 16],
        [880, 560, 32],
        [320, 560, 16],
        [320, 560, 32],
    ] as const) {
        test(
            "Home filtering/help " +
                locale +
                " " +
                width +
                "x" +
                height +
                " font " +
                fontSize,
            async ({ app }) => {
                const { evaluate } = app;
                await app.page.goto("/");
                await until(
                    () =>
                        evaluate(
                            "!!document.querySelector('#home-details-toggle')",
                        ),
                    "Home did not mount",
                );
                await evaluate(
                    "localStorage.setItem('PARAGLIDE_LOCALE'," +
                        JSON.stringify(locale) +
                        ")",
                );
                await app.page.reload();
                await until(
                    () =>
                        evaluate(
                            "!!document.querySelector('#home-details-toggle')",
                        ),
                    "Home did not reload",
                );
                await evaluate(
                    "(async () => {\nwindow.fixtureStates = await import('/src/lib/stores/state.svelte.ts');\nwindow.fixtureSession = (await import('/src/lib/stores/session.svelte.ts')).session;\nfor (const state of Object.values(window.fixtureStates)) state.ready = true;\nwindow.fixtureStates.app_state.obj.sidebar_open = false;\nwindow.fixtureStates.app_state.obj.home_right_rail.open = true;\nwindow.fixtureStates.app_state.obj.home_right_rail.gate = true;\n})()",
                );
                await delay(250);
                await homeChecks(app).filteringChecks(
                    locale,
                    width,
                    height,
                    fontSize,
                );
            },
        );
    }
}
