import XCTest
@testable import CadenceCore

final class ModelTests: XCTestCase {

    func testQuickTargetDigits() {
        XCTAssertEqual(QuickTarget(digit: 1), .liked)
        XCTAssertEqual(QuickTarget(digit: 5), .search)
        XCTAssertNil(QuickTarget(digit: 0))
        XCTAssertNil(QuickTarget(digit: 6))
        for target in QuickTarget.allCases {
            XCTAssertEqual(QuickTarget(digit: target.shortcutDigit), target)
        }
    }

    func testDefaultHotkey() {
        XCTAssertTrue(HotkeySpec.default.isValid)
        XCTAssertEqual(HotkeySpec.default.displayName, "⌃⌥Space")
        XCTAssertFalse(HotkeySpec(keyCode: 14, shift: true).isValid)
    }

    func testProgressIsClamped() {
        XCTAssertEqual(NowPlaying(title: "t", artist: "a", progress: 3).progress, 1)
        XCTAssertEqual(NowPlaying(title: "t", artist: "a", progress: -1).progress, 0)
    }

    func testNullBackendIsIdle() async {
        let backend = NullBackend()
        let now = await backend.nowPlaying()
        XCTAssertEqual(now, .idle)
    }
}
