// The Python adapter replaces this identifier with a JSON object, never executable source.
const config = __CONFIG__;
try {
    const windows = workspace
        .windowList()
        .filter((window) => window.pid === config.pid);
    if (windows.length !== 1)
        throw new Error("Expected exactly one owned Scrybe window");
    const window = windows[0];
    if (config.resize) {
        window.setMaximize(false, false);
        const frame = window.frameGeometry,
            content = window.clientGeometry;
        const area = workspace.clientArea(KWin.PlacementArea, window);
        const width = config.width + frame.width - content.width;
        const height = config.height + frame.height - content.height;
        if (width > area.width || height > area.height)
            throw new Error(
                "Requested content size does not fit the display work area",
            );
        window.frameGeometry = {
            x: area.x + (area.width - width) / 2,
            y: area.y + (area.height - height) / 2,
            width,
            height,
        };
    }
    if (config.resize || config.activate) {
        window.minimized = false;
        workspace.activeWindow = window;
    }
    const frame = window.frameGeometry,
        content = window.clientGeometry;
    callDBus(
        config.busName,
        "/Screenshot",
        "org.scrybe.Screenshot",
        "Report",
        JSON.stringify({
            frame: {
                x: frame.x,
                y: frame.y,
                width: frame.width,
                height: frame.height,
            },
            content: {
                x: content.x,
                y: content.y,
                width: content.width,
                height: content.height,
            },
            active: workspace.activeWindow === window,
            scale: window.output.devicePixelRatio,
        }),
    );
} catch (error) {
    callDBus(
        config.busName,
        "/Screenshot",
        "org.scrybe.Screenshot",
        "Report",
        JSON.stringify({ error: String(error) }),
    );
}
