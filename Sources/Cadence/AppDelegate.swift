import AppKit
import CadenceCore

final class AppDelegate: NSObject, NSApplicationDelegate {

    private let hotkey = GlobalHotkey()
    private let panel = CadencePanel()
    private let vinyl = VinylView(frame: NSRect(x: 0, y: 0, width: VinylView.side, height: VinylView.side))
    private var statusItem: NSStatusItem?
    private var outsideClickMonitor: Any?

    /// Swap for a real YouTube Music backend once one exists.
    private let backend: MusicBackend = NullBackend()

    func applicationDidFinishLaunching(_ notification: Notification) {
        panel.contentView = vinyl
        panel.setContentSize(NSSize(width: VinylView.side, height: VinylView.side))

        vinyl.onDismiss = { [weak self] in self?.hide() }
        vinyl.onLabelClick = { [weak self] in self?.send(.togglePlayPause) }
        vinyl.onSkip = { [weak self] step in self?.send(step > 0 ? .next : .previous) }
        vinyl.onSelect = { [weak self] target in
            Task { await self?.backend.open(target) }
            self?.hide()
        }

        setUpStatusItem()

        let spec = HotkeySpec.default
        if !hotkey.register(spec, action: { [weak self] in self?.toggle() }) {
            NSLog("Cadence: \(spec.displayName) is already taken by another app")
        }
    }

    // MARK: Menu bar

    private func setUpStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "opticaldisc", accessibilityDescription: "Cadence")
        let menu = NSMenu()
        menu.addItem(withTitle: "Show Record (\(HotkeySpec.default.displayName))", action: #selector(show), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Cadence", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.items.first?.target = self
        item.menu = menu
        statusItem = item
    }

    // MARK: Showing and hiding

    @objc private func show() {
        let mouse = NSEvent.mouseLocation
        let side = VinylView.side
        let screen = NSScreen.screens.first { $0.frame.contains(mouse) } ?? NSScreen.main
        var origin = NSPoint(x: mouse.x - side / 2, y: mouse.y - side / 2)
        if let frame = screen?.visibleFrame {
            origin.x = min(max(origin.x, frame.minX), frame.maxX - side)
            origin.y = min(max(origin.y, frame.minY), frame.maxY - side)
        }
        panel.setFrame(NSRect(origin: origin, size: NSSize(width: side, height: side)), display: true)
        panel.makeKeyAndOrderFront(nil)
        panel.makeFirstResponder(vinyl)

        Task { [weak self] in
            guard let self else { return }
            let now = await backend.nowPlaying()
            await MainActor.run { self.vinyl.isPlaying = now.isPlaying }
        }

        // A click anywhere outside the record dismisses it.
        outsideClickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            self?.hide()
        }
    }

    private func hide() {
        panel.orderOut(nil)
        if let outsideClickMonitor {
            NSEvent.removeMonitor(outsideClickMonitor)
            self.outsideClickMonitor = nil
        }
    }

    private func toggle() {
        panel.isVisible ? hide() : show()
    }

    private func send(_ command: PlayerCommand) {
        Task { [weak self] in
            guard let self else { return }
            await backend.send(command)
            let now = await backend.nowPlaying()
            await MainActor.run { self.vinyl.isPlaying = now.isPlaying }
        }
    }
}
