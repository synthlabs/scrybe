/** @typedef {import('../bindings').OverlayStyle} OverlayStyle */
/** @type {Pick<OverlayStyle, 'text_color' | 'stroke_color' | 'stroke_width' | 'background_color' | 'background_opacity' | 'border_radius' | 'padding'>} */
const classic = {
    text_color: "#ffffff",
    stroke_color: "#000000",
    stroke_width: 0,
    background_color: "#000000",
    background_opacity: 55,
    border_radius: 12,
    padding: "normal",
};
export const STYLE_PRESETS = [
    { id: "classic", style: classic },
    {
        id: "outline",
        style: {
            ...classic,
            background_opacity: 0,
            stroke_width: 2,
            border_radius: 0,
            padding: /** @type {const} */ ("none"),
        },
    },
    { id: "solid", style: { ...classic, background_opacity: 100 } },
    {
        id: "light",
        style: {
            ...classic,
            background_color: "#ffffff",
            background_opacity: 100,
            text_color: "#101114",
        },
    },
];
export const BACKGROUND_SWATCHES = ["#000000", "#101216", "#ffffff", "#e98963"];

/** @param {OverlayStyle} style @param {string} id */
export function applyPreset(style, id) {
    return {
        ...style,
        ...STYLE_PRESETS.find((preset) => preset.id === id)?.style,
    };
}

/** @param {OverlayStyle} style */
export function matchingPreset(style) {
    return (
        STYLE_PRESETS.find((preset) =>
            Object.entries(preset.style).every(
                ([key, value]) =>
                    String(
                        style[/** @type {keyof OverlayStyle} */ (key)],
                    ).toLowerCase() === String(value).toLowerCase(),
            ),
        )?.id ?? "custom"
    );
}

/** @param {OverlayStyle} style @param {string} background_color */
export function pairedColor(style, background_color) {
    return {
        ...style,
        background_color,
        text_color: ["#ffffff", "#e98963"].includes(background_color)
            ? "#101114"
            : "#ffffff",
    };
}
