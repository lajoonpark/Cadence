import AppKit
import CadenceCore

final class AppDelegate: NSObject, NSApplicationDelegate {

    private let hotkey = GlobalHotkey()
    private let panel = CadencePanel()
    private let container = NSView(frame: NSRect(x: 0, y: 0, width: VinylView.side, height: VinylView.side))
    private let vinyl = VinylView(frame: NSRect(x: 0, y: 0, width: VinylView.side, height: VinylView.side))
    private let ring = RingOverlayView(frame: NSRect(x: 0, y: 0, width: VinylView.side, height: VinylView.side))
    private var statusItem: NSStatusItem?
    private var outsideClickMonitor: Any?
    private var pins: [PinnedItem] = []

    private let backend: MusicBackend = KasetBackend()

    /// ~/Library/Application Support/Cadence/pins.json
    private var pinsURL: URL {
        FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Cadence", isDirectory: true)
            .appendingPathComponent("pins.json")
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        container.addSubview(vinyl)
        container.addSubview(ring) // on top; click-through
        panel.contentView = container
        panel.setContentSize(NSSize(width: VinylView.side, height: VinylView.side))

        vinyl.onDismiss = { [weak self] in self?.hide() }
        vinyl.onLabelClick = { [weak self] in self?.send(.togglePlayPause) }
        vinyl.onSkip = { [weak self] step in self?.send(step > 0 ? .next : .previous) }
        vinyl.onHover = { [weak self] hit in self?.ring.hovered = hit }
        vinyl.onSelect = { [weak self] index in
            guard let self, pins.indices.contains(index) else { return }
            let item = pins[index]
            Task { await self.backend.open(item) }
            hide()
        }

        setUpStatusItem()
        reloadPins()

        let spec = HotkeySpec.default
        if !hotkey.register(spec, action: { [weak self] in self?.toggle() }) {
            NSLog("Cadence: \(spec.displayName) is already taken by another app")
        }
    }

    // MARK: Pins

    private func reloadPins() {
        pins = PinnedStore.load(from: pinsURL)
        let layout = RecordLayout(sectorCount: pins.count)
        vinyl.layout = layout
        ring.layout = layout
        ring.titles = pins.map(\.title)
    }

    @objc private func editPins() {
        let url = pinsURL
        if !FileManager.default.fileExists(atPath: url.path) {
            try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            let example = [
                PinnedItem(title: "Example song", videoIds: ["dQw4w9WgXcQ"]),
                PinnedItem(title: "Example shortcut", shortcut: "Name of a shortcut"),
            ]
            if let data = try? PinnedStore.encode(example) { try? data.write(to: url) }
        }
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }

    // MARK: Menu bar

    private func setUpStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "opticaldisc", accessibilityDescription: "Cadence")
        let menu = NSMenu()
        let show = menu.addItem(withTitle: "Show Record (\(HotkeySpec.default.displayName))", action: #selector(show), keyEquivalent: "")
        let edit = menu.addItem(withTitle: "Edit Pinned Items…", action: #selector(editPins), keyEquivalent: "")
        show.target = self
        edit.target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Cadence", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.menu = menu
        statusItem = item
    }

    // MARK: Showing and hiding

    @objc private func show() {
        reloadPins() // pick up edits to pins.json without restarting
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
        refreshPlaying()

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
            await refreshPlayingAsync()
        }
    }

    private func refreshPlaying() {
        Task { [weak self] in await self?.refreshPlayingAsync() }
    }

    private func refreshPlayingAsync() async {
        let now = await backend.nowPlaying()
        await MainActor.run { vinyl.isPlaying = now.isPlaying }
    }
}
