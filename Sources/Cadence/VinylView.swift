import AppKit
import SceneKit
import CadenceCore

/// The 3D record. A black disc with a label, spinning while music plays and leaning toward
/// the cursor. This is a placeholder look: grooves, sector art and the sleeve come later.
///
/// Input is reported through closures so the view owns no playback logic.
final class VinylView: SCNView {

    static let side: CGFloat = 420

    var layout = RecordLayout() {
        didSet { hovered = .none; onHover?(.none) }
    }
    /// Index into the pinned items.
    var onSelect: ((Int) -> Void)?
    var onHover: ((RecordLayout.Hit) -> Void)?
    var onLabelClick: (() -> Void)?
    var onSkip: ((Int) -> Void)?
    var onDismiss: (() -> Void)?

    var isPlaying = false { didSet { updateSpin() } }

    /// Spins about the disc's own axis.
    private let record = SCNNode()
    /// Lays the upright cylinder flat toward the viewer.
    private let flat = SCNNode()
    /// Leans toward the cursor.
    private let tilt = SCNNode()
    private var hovered: RecordLayout.Hit = .none

    override var acceptsFirstResponder: Bool { true }
    override var isOpaque: Bool { false }

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

        let scene = SCNScene()
        self.scene = scene

        let disc = SCNCylinder(radius: 1.0, height: 0.04)
        let vinyl = SCNMaterial()
        vinyl.diffuse.contents = NSColor(white: 0.05, alpha: 1)
        vinyl.metalness.contents = 0.6
        vinyl.roughness.contents = 0.35
        disc.materials = [vinyl]

        let label = SCNCylinder(radius: CGFloat(layout.labelRadius / layout.outerRadius), height: 0.045)
        let labelMaterial = SCNMaterial()
        labelMaterial.diffuse.contents = NSColor.systemRed
        label.materials = [labelMaterial]

        record.addChildNode(SCNNode(geometry: disc))
        record.addChildNode(SCNNode(geometry: label))
        // Cylinders stand on their end; lay the record flat toward the viewer. Spinning is on a
        // child node so it turns about the disc's axis, not the screen's.
        flat.eulerAngles.x = .pi / 2
        flat.addChildNode(record)
        tilt.addChildNode(flat)
        scene.rootNode.addChildNode(tilt)

        let camera = SCNNode()
        camera.camera = SCNCamera()
        camera.camera?.fieldOfView = 35
        camera.position = SCNVector3(0, 0, 4.2)
        scene.rootNode.addChildNode(camera)

        let key = SCNNode()
        key.light = SCNLight()
        key.light?.type = .omni
        key.position = SCNVector3(-2, 3, 4)
        scene.rootNode.addChildNode(key)

        let fill = SCNNode()
        fill.light = SCNLight()
        fill.light?.type = .ambient
        fill.light?.intensity = 400
        scene.rootNode.addChildNode(fill)

        addTrackingArea(NSTrackingArea(
            rect: .zero,
            options: [.mouseMoved, .activeAlways, .inVisibleRect],
            owner: self,
            userInfo: nil
        ))
    }

    private func updateSpin() {
        let key = "spin"
        if isPlaying {
            guard record.action(forKey: key) == nil else { return }
            let turn = SCNAction.rotateBy(x: 0, y: 2 * .pi, z: 0, duration: 1.8)
            record.runAction(.repeatForever(turn), forKey: key)
        } else {
            record.removeAction(forKey: key)
        }
    }

    // MARK: Input

    /// Screen points per layout unit. The ring's outer edge sits at 80% of the half-width,
    /// leaving room for the tilt. `RingOverlayView` draws with the same mapping.
    static func pointsPerUnit(width: CGFloat, layout: RecordLayout) -> Double {
        Double(width / 2 * 0.8) / layout.outerRadius
    }

    /// Mouse position relative to the record centre, y pointing down, in layout units.
    private func layoutPoint(for event: NSEvent) -> (x: Double, y: Double) {
        let p = convert(event.locationInWindow, from: nil)
        let scale = 1 / VinylView.pointsPerUnit(width: bounds.width, layout: layout)
        return (
            x: Double(p.x - bounds.midX) * scale,
            y: Double(bounds.midY - p.y) * scale
        )
    }

    override func mouseMoved(with event: NSEvent) {
        let point = layoutPoint(for: event)
        let hit = layout.hitTest(x: point.x, y: point.y)
        if hit != hovered {
            hovered = hit
            onHover?(hit)
        }
        // Lean toward the cursor, like the compass needle.
        let lean = 0.25
        let nx = max(-1, min(1, point.x / layout.outerRadius))
        let ny = max(-1, min(1, point.y / layout.outerRadius))
        tilt.eulerAngles = SCNVector3(CGFloat(ny * lean), CGFloat(nx * lean), 0)
    }

    override func mouseDown(with event: NSEvent) {
        let point = layoutPoint(for: event)
        switch layout.hitTest(x: point.x, y: point.y) {
        case .label: onLabelClick?()
        case .sector(let i): onSelect?(i)
        case .none: onDismiss?()
        }
    }

    override func scrollWheel(with event: NSEvent) {
        if event.scrollingDeltaY > 2 { onSkip?(-1) } else if event.scrollingDeltaY < -2 { onSkip?(1) }
    }

    override func keyDown(with event: NSEvent) {
        switch event.keyCode {
        case 53: onDismiss?()                       // Esc
        case 49: onLabelClick?()                    // Space
        case 123: onSkip?(-1)                       // ←
        case 124: onSkip?(1)                        // →
        default:
            if let chars = event.charactersIgnoringModifiers, let digit = Int(chars),
               digit >= 1, digit <= layout.sectorCount {
                onSelect?(digit - 1)
            }
        }
    }
}
