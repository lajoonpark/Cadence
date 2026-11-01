import AppKit
import SceneKit
import CadenceCore

/// The suitcase on screen: owns the animation (lid, record, tonearm, knob) and all input.
///
/// It reports what the user did through closures and holds no playback logic of its own, so the
/// app delegate decides what a press means. Everything runs on the main thread, driven by a
/// display link rather than SceneKit's render thread, so the lid's physics and the input share
/// one clock.
final class SuitcaseView: SCNView {

    static let size = NSSize(width: 880, height: 760)

    typealias L = SuitcaseLayout

    // MARK: Reports

    var onCommand: ((PlayerCommand) -> Void)?
    /// 0...1, as the user turns the knob or scrolls.
    var onVolume: ((Double) -> Void)?
    /// Seconds. Only called when `canScrub` is true.
    var onSeek: ((Double) -> Void)?
    /// The user asked to close it (Esc, a click on empty space).
    var onDismissRequest: (() -> Void)?
    /// The lid has shut and the case has faded out: the window can go.
    var onClosed: (() -> Void)?

    /// Whether the player can seek. Kaset cannot, so by default the record does not scrub.
    var canScrub = false

    // MARK: State

    private let suitcase = SuitcaseScene()
    private var hinge = LidHinge()
    private var knob = VolumeKnob()

    private enum Phase { case hidden, open, closing }
    private var phase = Phase.hidden

    private var displayLink: CADisplayLink?
    private var lastTimestamp: CFTimeInterval?

    /// 0...1: how far the case has arrived (or faded out).
    private var appear = 0.0
    /// Dip of the case when the lid lands on its stop.
    private var thump = 0.0

    private var nowPlaying = NowPlaying.idle
    private var hasTrack = false
    private var playing = false
    private var liked = false
    private var positionStamp: CFTimeInterval = 0

    private var spinAngle = 0.0
    private var spinSpeed = 0.0
    private var armAngle = Tonearm.parkedAngle

    private var lastVolumeChange: CFTimeInterval = 0

    private enum DragState { case none, knob, scrub, button(SuitcaseControl) }
    private var dragState = DragState.none
    private var scrub: RecordScrub?
    private var scrubStep = 0.0
    private var hovered: SuitcaseControl?

    /// 33⅓ rpm, in radians per second.
    private static let spinRate = 3.49

    override var acceptsFirstResponder: Bool { true }
    override var isOpaque: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override init(frame: NSRect, options: [String: Any]? = nil) {
        super.init(frame: frame, options: options)
        setUp()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setUp()
    }

    private func setUp() {
        backgroundColor = .clear
        antialiasingMode = .multisampling4X
        allowsCameraControl = false
        preferredFramesPerSecond = 60
        scene = suitcase.scene
        pointOfView = suitcase.cameraNode

        suitcase.setKnob(volume: knob.volume)
        suitcase.setPlaying(false)
        suitcase.setLiked(false)
        suitcase.setLid(angle: 0)
        suitcase.setTonearm(angle: armAngle)
        suitcase.caseRoot.opacity = 0
        suitcase.floorNode.opacity = 0

        addTrackingArea(NSTrackingArea(
            rect: .zero,
            options: [.mouseMoved, .mouseEnteredAndExited, .activeAlways, .inVisibleRect],
            owner: self,
            userInfo: nil
        ))
    }

    /// Compiles shaders and uploads textures ahead of the first summon, so the lid does not
    /// stutter the first time it opens.
    func prewarm() {
        prepare([suitcase.caseRoot], completionHandler: nil)
    }

    // MARK: Summoning

    /// Opens the case: it arrives and the lid is flicked up. Safe to call while it is closing;
    /// the hinge turns around and carries the lid over the top.
    func summon() {
        if phase == .hidden {
            hinge.snapShut()
            suitcase.setLid(angle: 0)
            appear = 0
            thump = 0
            spinSpeed = 0
            armAngle = hasTrack ? Tonearm.angle(forProgress: displayedProgress()) : Tonearm.parkedAngle
            lastTimestamp = nil
        }
        phase = .open
        hinge.release()
        startDisplayLink()
        window?.makeFirstResponder(self)
    }

    /// Shuts the lid. The case fades once the lid has landed.
    func dismiss() {
        guard phase == .open else { return }
        phase = .closing
        hinge.shut()
        dragState = .none
        scrub = nil
        suitcase.setPressed(nil)
        suitcase.setHover(nil)
    }

    var isShowing: Bool { phase != .hidden }
    var isClosing: Bool { phase == .closing }

    /// Whether the lid is far enough open for the controls to respond. Until then a click is
    /// still on the lid, not the deck.
    private var isInteractive: Bool {
        phase == .open && hinge.openness > 0.55
    }

    // MARK: Player state

    func apply(_ now: NowPlaying) {
        nowPlaying = now
        hasTrack = now.title != NowPlaying.idle.title
        playing = now.isPlaying
        liked = now.isLiked
        positionStamp = CACurrentMediaTime()
        suitcase.setPlaying(playing)
        suitcase.setLiked(liked)

        // Kaset's volume wins, except while the user is turning the knob or just did.
        if let volume = now.volume, !isDraggingKnob, CACurrentMediaTime() - lastVolumeChange > 2 {
            knob.set(volume)
            suitcase.setKnob(volume: volume)
        }
    }

    func apply(artwork: NSImage?) {
        suitcase.setArtwork(artwork)
    }

    private var isDraggingKnob: Bool {
        if case .knob = dragState { return true }
        return false
    }

    private func currentPosition() -> Double {
        guard nowPlaying.duration > 0 else { return 0 }
        let elapsed = playing ? CACurrentMediaTime() - positionStamp : 0
        return min(nowPlaying.position + elapsed, nowPlaying.duration)
    }

    private func displayedProgress() -> Double {
        if let scrub { return scrub.progress }
        guard nowPlaying.duration > 0 else { return 0 }
        return currentPosition() / nowPlaying.duration
    }

    // MARK: Frame loop

    private func startDisplayLink() {
        guard displayLink == nil else { return }
        let link = displayLink(target: self, selector: #selector(tick(_:)))
        link.add(to: .main, forMode: .common)
        displayLink = link
        rendersContinuously = true
    }

    private func stopDisplayLink() {
        displayLink?.invalidate()
        displayLink = nil
        rendersContinuously = false
    }

    @objc private func tick(_ link: CADisplayLink) {
        let now = link.timestamp
        let dt = min(max(lastTimestamp.map { now - $0 } ?? 1.0 / 60, 0), 0.1)
        lastTimestamp = now

        // Lid.
        let impact = hinge.step(dt)
        suitcase.setLid(angle: hinge.angle)
        if impact > 0 { thump = max(thump, min(impact, 8) * 0.012) }
        thump *= exp(-dt * 16)

        // Arrival and departure.
        switch phase {
        case .open:
            appear = min(1, appear + dt / 0.22)
        case .closing:
            if !hinge.isMoving { appear = max(0, appear - dt / 0.16) }
        case .hidden:
            break
        }
        let ease = 1 - pow(1 - appear, 3)
        suitcase.caseRoot.opacity = CGFloat(min(1, appear * 1.6))
        suitcase.floorNode.opacity = CGFloat(appear)
        suitcase.caseRoot.position.y = CGFloat(-thump - (1 - ease) * 0.45)
        let scale = CGFloat(0.94 + 0.06 * ease)
        suitcase.caseRoot.scale = SCNVector3(scale, scale, scale)

        // Record: spins up and winds down, and follows the pointer while it is being scrubbed.
        let target = playing ? SuitcaseView.spinRate : 0
        spinSpeed += (target - spinSpeed) * min(1, dt * (playing ? 1.6 : 2.6))
        if scrub == nil { spinAngle += spinSpeed * dt }
        suitcase.setRecord(angle: spinAngle)

        // Tonearm: creeps inward through the song, and parks clear of the record when idle.
        let armTarget = hasTrack ? Tonearm.angle(forProgress: displayedProgress()) : Tonearm.parkedAngle
        armAngle += (armTarget - armAngle) * min(1, dt * 6)
        suitcase.setTonearm(angle: armAngle)

        if phase == .closing && appear <= 0 && !hinge.isMoving {
            phase = .hidden
            stopDisplayLink()
            onClosed?()
        }
    }

    // MARK: Picking

    private func hit(at point: NSPoint) -> (control: SuitcaseControl?, overCase: Bool) {
        let results = hitTest(point, options: [.searchMode: SCNHitTestSearchMode.all.rawValue])
        var overCase = false
        for result in results where !SuitcaseScene.isFloor(result.node) {
            overCase = true
            if let control = SuitcaseScene.control(for: result.node) {
                return (control, true)
            }
        }
        return (nil, overCase)
    }

    /// Where a view point lands on a horizontal plane at `height`, as a deck position.
    private func deckPoint(for point: NSPoint, height: Double) -> DeckPoint? {
        let near = unprojectPoint(SCNVector3(point.x, point.y, 0))
        let far = unprojectPoint(SCNVector3(point.x, point.y, 1))
        let dy = Double(far.y - near.y)
        guard abs(dy) > 1e-9 else { return nil }
        let t = (height - Double(near.y)) / dy
        return DeckPoint(
            x: Double(near.x) + t * Double(far.x - near.x),
            z: Double(near.z) + t * Double(far.z - near.z)
        )
    }

    private var scrubEnabled: Bool { canScrub && nowPlaying.duration > 0 }

    // MARK: Mouse

    override func mouseMoved(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        guard isInteractive else { setHover(nil); return }
        let control = hit(at: point).control
        setHover(control)
    }

    override func mouseExited(with event: NSEvent) {
        setHover(nil)
    }

    private func setHover(_ control: SuitcaseControl?) {
        guard control != hovered else { return }
        hovered = control
        let lit: SuitcaseControl? = (control == .record) ? nil : control
        suitcase.setHover(lit)
        switch control {
        case .some(let c) where c.isButton: NSCursor.pointingHand.set()
        case .knob?: NSCursor.openHand.set()
        case .record? where scrubEnabled: NSCursor.openHand.set()
        default: NSCursor.arrow.set()
        }
    }

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        let result = hit(at: point)
        guard result.overCase else {
            onDismissRequest?()
            return
        }
        guard isInteractive, let control = result.control else { return }
        switch control {
        case .knob:
            dragState = .knob
            NSCursor.closedHand.set()
            turnKnob(to: point)
        case .record:
            if scrubEnabled { beginScrub(at: point) }
        default:
            dragState = .button(control)
            suitcase.setPressed(control)
        }
    }

    override func mouseDragged(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        switch dragState {
        case .none: break
        case .knob: turnKnob(to: point)
        case .scrub: continueScrub(at: point)
        case .button(let control):
            suitcase.setPressed(hit(at: point).control == control ? control : nil)
        }
    }

    override func mouseUp(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        defer {
            dragState = .none
            suitcase.setPressed(nil)
        }
        switch dragState {
        case .none: break
        case .knob: NSCursor.openHand.set()
        case .scrub: endScrub()
        case .button(let control):
            guard hit(at: point).control == control else { return }
            press(control)
        }
    }

    private func press(_ control: SuitcaseControl) {
        guard let command = control.command else { return }
        // Show the effect straight away; the next poll of the player confirms it.
        switch control {
        case .playPause:
            playing.toggle()
            suitcase.setPlaying(playing)
        case .like:
            liked.toggle()
            suitcase.setLiked(liked)
        default: break
        }
        onCommand?(command)
    }

    // MARK: Knob

    private func turnKnob(to point: NSPoint) {
        guard let p = deckPoint(for: point, height: L.deckHeight + 0.12) else { return }
        let angle = RecordLayout.angle(x: p.x - L.knob.x, y: p.z - L.knob.z)
        knob.drag(toPointerAngle: angle)
        volumeChanged()
    }

    private func volumeChanged() {
        lastVolumeChange = CACurrentMediaTime()
        suitcase.setKnob(volume: knob.volume)
        onVolume?(knob.volume)
    }

    override func scrollWheel(with event: NSEvent) {
        guard phase == .open else { return }
        let dy = Double(event.scrollingDeltaY)
        guard dy != 0 else { return }
        knob.adjust(by: VolumeKnob.volumeChange(
            scrollDeltaY: dy,
            precise: event.hasPreciseScrollingDeltas,
            invertedFromDevice: event.isDirectionInvertedFromDevice
        ))
        volumeChanged()
    }

    // MARK: Scrubbing

    private func recordAngle(at point: NSPoint) -> Double? {
        guard let p = deckPoint(for: point, height: L.recordTop) else { return nil }
        return RecordLayout.angle(x: p.x - L.record.x, y: p.z - L.record.z)
    }

    private func beginScrub(at point: NSPoint) {
        guard let angle = recordAngle(at: point) else { return }
        scrub = RecordScrub(grabAngle: angle, position: currentPosition(), duration: nowPlaying.duration)
        scrubStep = 0
        dragState = .scrub
        NSCursor.closedHand.set()
    }

    private func continueScrub(at point: NSPoint) {
        guard var s = scrub, let angle = recordAngle(at: point) else { return }
        s.update(angle: angle)
        // The record turns with the pointer.
        spinAngle += s.turned - scrubStep
        scrubStep = s.turned
        scrub = s
    }

    private func endScrub() {
        if let s = scrub {
            // The song jumps once, on release: a seek is slow, so it is not sent while dragging.
            onSeek?(s.position)
            nowPlaying.position = s.position
            positionStamp = CACurrentMediaTime()
        }
        scrub = nil
        NSCursor.openHand.set()
    }

    // MARK: Keyboard

    override func keyDown(with event: NSEvent) {
        switch event.keyCode {
        case 53: onDismissRequest?()                              // Esc
        case 49: press(.playPause)                                // Space
        case 123: onCommand?(.previous)                           // ←
        case 124: onCommand?(.next)                               // →
        case 126: knob.adjust(by: 0.05); volumeChanged()          // ↑
        case 125: knob.adjust(by: -0.05); volumeChanged()         // ↓
        case 37: press(.like)                                     // L
        default: break
        }
    }
}
