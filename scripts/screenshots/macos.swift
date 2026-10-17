import Cocoa
import ApplicationServices
import ImageIO

struct Copy: Decodable {
    let navigation: [String: String]
    let ready: [String: String]
    let loading: [String]
    let dismiss: String
}
struct Config: Decodable {
    let pid: Int32
    let width: Int
    let height: Int
    let locale: String
    let pages: [String]
    let outputDir: String
    let labels: [String: Copy]
    let startupTimeout: Double
    let pageTimeout: Double
}

func failure(_ message: String) -> NSError {
    NSError(domain: "ScrybeScreenshots", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}

func attribute(_ node: AXUIElement, _ name: String) -> CFTypeRef? {
    var result: CFTypeRef?
    guard AXUIElementCopyAttributeValue(node, name as CFString, &result) == .success else { return nil }
    return result
}

func elements(_ node: AXUIElement, depth: Int = 0) -> [AXUIElement] {
    if depth > 32 { return [] }
    let children = attribute(node, kAXChildrenAttribute) as? [AXUIElement] ?? []
    return [node] + children.flatMap { elements($0, depth: depth + 1) }
}

func text(_ node: AXUIElement) -> String {
    for key in [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute] {
        if let value = attribute(node, key) as? String, !value.isEmpty { return value }
    }
    return ""
}

func size(_ node: AXUIElement) throws -> CGSize {
    guard let raw = attribute(node, kAXSizeAttribute), CFGetTypeID(raw) == AXValueGetTypeID() else { throw failure("Accessibility size is unavailable") }
    var result = CGSize.zero
    guard AXValueGetValue(raw as! AXValue, .cgSize, &result) else { throw failure("Cannot read accessibility size") }
    return result
}

func setSize(_ node: AXUIElement, _ value: CGSize) throws {
    var value = value
    let raw = AXValueCreate(.cgSize, &value)!
    guard AXUIElementSetAttributeValue(node, kAXSizeAttribute as CFString, raw) == .success else { throw failure("Accessibility denied window resizing") }
}

func preflight() throws {
    guard AXIsProcessTrusted() else { throw failure("Grant Accessibility permission to the terminal/helper in System Settings → Privacy & Security, then retry") }
    if #available(macOS 10.15, *) {
        guard CGPreflightScreenCaptureAccess() else { throw failure("Grant Screen Recording permission to the terminal/helper in System Settings → Privacy & Security, then retry") }
    }
}

final class Automation {
    let config: Config
    let app: AXUIElement
    let copy: Copy
    init(_ config: Config) {
        self.config = config
        app = AXUIElementCreateApplication(config.pid)
        copy = config.labels[config.locale]!
    }

    func wait<T>(_ message: String, timeout: Double? = nil, _ check: () throws -> T?) throws -> T {
        let deadline = Date().addingTimeInterval(timeout ?? config.pageTimeout)
        while Date() < deadline {
            if kill(config.pid, 0) != 0 { throw failure("Owned Scrybe process exited") }
            if let value = try check() { return value }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        throw failure(message)
    }

    func find(_ names: [String], roles: [String]) -> AXUIElement? {
        elements(app).first { node in
            names.contains(text(node).trimmingCharacters(in: .whitespacesAndNewlines)) && roles.contains(attribute(node, kAXRoleAttribute) as? String ?? "")
        }
    }

    func activate(_ names: [String], roles: [String]) throws {
        let node = try wait("Missing accessible control: \(names)") { self.find(names, roles: roles) }
        guard AXUIElementPerformAction(node, kAXPressAction as CFString) == .success else { throw failure("Cannot activate \(names)") }
    }

    func window() -> AXUIElement? {
        let windows = attribute(app, kAXWindowsAttribute) as? [AXUIElement] ?? []
        return windows.count == 1 ? windows[0] : nil
    }

    func webArea() -> AXUIElement? {
        elements(app).first { attribute($0, kAXRoleAttribute) as? String == "AXWebArea" }
    }

    func settled(_ page: String) throws {
        var previous: [String] = []
        var since = Date()
        let _: Bool = try wait("Page did not settle: \(page)") {
            let texts = elements(self.app).map(text)
            if texts != previous { previous = texts; since = Date() }
            if texts.contains(where: { $0.contains(self.copy.ready[page]!) }) && !texts.contains(where: { self.copy.loading.contains($0) }) && Date().timeIntervalSince(since) >= 1.5 { return true }
            return nil
        }
    }

    func capture() throws {
        let win = try wait("Scrybe did not expose its window; check model setup logs", timeout: config.startupTimeout) { self.window() }
        NSRunningApplication(processIdentifier: config.pid)?.activate(options: [.activateIgnoringOtherApps])
        try activate(["English", "Русский"], roles: ["AXButton", "AXMenuButton", "AXPopUpButton", "AXComboBox"])
        let language = config.locale == "en" ? "English" : "Русский"
        try activate(["\(config.locale.uppercased()) \(language)", "\(config.locale.uppercased())\(language)", language], roles: ["AXMenuItem", "AXButton"])
        let _: AXUIElement = try wait("Locale change did not complete") { self.find([self.copy.navigation["home"]!], roles: ["AXLink"]) }
        let web = try wait("Web content did not expose its bounds") { self.webArea() }
        let outer = try size(win), inner = try size(web)
        let requested = CGSize(width: CGFloat(config.width) + outer.width - inner.width, height: CGFloat(config.height) + outer.height - inner.height)
        guard let screen = NSScreen.main, requested.width <= screen.visibleFrame.width, requested.height <= screen.visibleFrame.height else { throw failure("Requested content size does not fit the display work area") }
        try setSize(win, requested)
        let top = screen.frame.maxY - screen.visibleFrame.maxY
        var position = CGPoint(x: screen.visibleFrame.minX + (screen.visibleFrame.width-requested.width)/2, y: top + (screen.visibleFrame.height-requested.height)/2)
        guard AXUIElementSetAttributeValue(win, kAXPositionAttribute as CFString, AXValueCreate(.cgPoint, &position)!) == .success else { throw failure("Accessibility denied moving the window") }
        let _: Bool = try wait("Window content dimensions did not settle") {
            let actual = try size(web)
            return abs(actual.width-CGFloat(self.config.width)) < 0.5 && abs(actual.height-CGFloat(self.config.height)) < 0.5 ? true : nil
        }
        var results: [[String: Any]] = []
        for page in config.pages {
            try activate([copy.navigation[page]!], roles: ["AXLink"])
            try settled(page)
            if let dismiss = find([copy.dismiss], roles: ["AXButton"]) { AXUIElementPerformAction(dismiss, kAXPressAction as CFString) }
            CGWarpMouseCursorPosition(CGPoint(x: screen.frame.minX, y: screen.frame.minY))
            try settled(page)
            let actual = try size(try wait("Web area is unavailable") { self.webArea() })
            guard abs(actual.width-CGFloat(config.width)) < 0.5 && abs(actual.height-CGFloat(config.height)) < 0.5 else { throw failure("Window content dimensions changed") }
            guard let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { throw failure("Cannot enumerate owned window") }
            let owned = windows.filter { ($0[kCGWindowOwnerPID as String] as? Int32) == config.pid && ($0[kCGWindowLayer as String] as? Int) == 0 }
            guard owned.count == 1, let id = owned[0][kCGWindowNumber as String] as? Int else { throw failure("Expected exactly one owned native window") }
            let path = "\(config.outputDir)/\(page)-\(config.locale)-darwin.png"
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
            process.arguments = ["-x", "-o", "-l", String(id), path]
            try process.run()
            process.waitUntilExit()
            guard process.terminationStatus == 0, let image = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil), let props = CGImageSourceCopyPropertiesAtIndex(image, 0, nil) as? [String: Any], let pixelWidth = props[kCGImagePropertyPixelWidth as String] as? Int, let pixelHeight = props[kCGImagePropertyPixelHeight as String] as? Int else { throw failure("Native screenshot failed") }
            let frame = try size(win)
            let scale = CGFloat(pixelWidth) / frame.width
            guard scale >= 1, abs(CGFloat(pixelHeight) - frame.height*scale) <= 1 else { throw failure("Screenshot frame bounds or native density mismatch") }
            results.append(["page": page, "width": config.width, "height": config.height, "pixelWidth": pixelWidth, "pixelHeight": pixelHeight, "scale": scale])
        }
        try JSONSerialization.data(withJSONObject: results, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: "\(config.outputDir)/result.json"))
    }
}

do {
    try preflight()
    if CommandLine.arguments[1] == "--preflight" {
        print("macOS screenshot prerequisites ready")
    } else {
        let config = try JSONDecoder().decode(Config.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
        try Automation(config).capture()
    }
} catch {
    fputs("Screenshot failed: \(error.localizedDescription)\n", stderr)
    exit(1)
}
