import AppKit
import CadenceCore

/// Draws the ring's slices and their titles on top of the 3D record, and passes every click
/// through to the record underneath.
final class RingOverlayView: NSView {

    var ringLayout = RecordLayout() { didSet { needsDisplay = true } }
    var titles: [String] = [] { didSet { needsDisplay = true } }
    var hovered: RecordLayout.Hit = .none { didSet { needsDisplay = true } }

    override var isFlipped: Bool { true }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    override func draw(_ dirtyRect: NSRect) {
        guard ringLayout.sectorCount > 0 else { return }
        let scale = CGFloat(VinylView.pointsPerUnit(width: bounds.width, layout: ringLayout))
        let center = NSPoint(x: bounds.midX, y: bounds.midY)
        let inner = CGFloat(ringLayout.innerRadius) * scale
        let outer = CGFloat(ringLayout.outerRadius) * scale
        let half = CGFloat(ringLayout.step) / 2

        for index in 0..<ringLayout.sectorCount {
            // Layout angles run clockwise from 12 o'clock; this view is flipped (y down), so
            // an angle `a` maps to the point (sin a, -cos a).
            let mid = CGFloat(ringLayout.centerAngle(of: index))
            let isHovered = hovered == .sector(index)

            let path = NSBezierPath()
            let steps = 24
            func point(_ radius: CGFloat, _ angle: CGFloat) -> NSPoint {
                NSPoint(x: center.x + radius * sin(angle), y: center.y - radius * cos(angle))
            }
            path.move(to: point(inner, mid - half))
            for i in 0...steps { path.line(to: point(outer, mid - half + CGFloat(i) / CGFloat(steps) * 2 * half)) }
            for i in 0...steps { path.line(to: point(inner, mid + half - CGFloat(i) / CGFloat(steps) * 2 * half)) }
            path.close()

            (isHovered ? NSColor.white.withAlphaComponent(0.22) : NSColor.white.withAlphaComponent(0.04)).setFill()
            path.fill()
            NSColor.white.withAlphaComponent(0.25).setStroke()
            path.lineWidth = 1
            path.stroke()

            guard index < titles.count else { continue }
            let label = "\(index + 1)  \(titles[index])" as NSString
            let attributes: [NSAttributedString.Key: Any] = [
                .font: NSFont.systemFont(ofSize: 12, weight: isHovered ? .bold : .medium),
                .foregroundColor: NSColor.white,
            ]
            let size = label.size(withAttributes: attributes)
            let anchor = point((inner + outer) / 2, mid)
            label.draw(at: NSPoint(x: anchor.x - size.width / 2, y: anchor.y - size.height / 2), withAttributes: attributes)
        }
    }
}
