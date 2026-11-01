// swift-tools-version: 5.9
import PackageDescription

// CadenceCore is pure Swift (no AppKit), so its tests run on any platform, including Linux.
// The Cadence app target needs AppKit/SceneKit and is only declared on macOS.
var products: [Product] = [
    .library(name: "CadenceCore", targets: ["CadenceCore"]),
]
var targets: [Target] = [
    .target(name: "CadenceCore"),
    .testTarget(name: "CadenceCoreTests", dependencies: ["CadenceCore"]),
]

#if os(macOS)
products.append(.executable(name: "Cadence", targets: ["Cadence"]))
targets.append(.executableTarget(name: "Cadence", dependencies: ["CadenceCore"]))
#endif

let package = Package(
    name: "Cadence",
    platforms: [.macOS(.v14)],
    products: products,
    targets: targets
)
