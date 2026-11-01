import XCTest
@testable import CadenceCore

private final class FakeRunner: ScriptRunner, @unchecked Sendable {
    var scripts: [String] = []
    var shortcuts: [String] = []
    var reply = ""
    var fail = false

    func osascript(_ source: String) async throws -> String {
        scripts.append(source)
        if fail { throw ScriptError(status: 1, message: "boom") }
        return reply
    }
    func runShortcut(_ name: String) async throws {
        shortcuts.append(name)
        if fail { throw ScriptError(status: 1, message: "boom") }
    }
}

final class KasetTests: XCTestCase {

    func testCommandScripts() {
        XCTAssertEqual(KasetScripts.script(for: .togglePlayPause), #"tell application "Kaset" to playpause"#)
        XCTAssertEqual(KasetScripts.script(for: .next), #"tell application "Kaset" to next track"#)
        XCTAssertEqual(KasetScripts.script(for: .previous), #"tell application "Kaset" to previous track"#)
        XCTAssertEqual(KasetScripts.script(for: .like), #"tell application "Kaset" to like track"#)
    }

    func testPlayScripts() {
        XCTAssertEqual(KasetScripts.play(videoIds: ["abc"]), #"tell application "Kaset" to play video "abc""#)
        XCTAssertEqual(
            KasetScripts.play(videoIds: ["a", "b"]),
            #"tell application "Kaset" to play videos {"a", "b"} starting at 1"#
        )
        XCTAssertNil(KasetScripts.play(videoIds: []))
        XCTAssertNil(KasetScripts.play(videoIds: ["a\" & x"]))
    }

    func testPlayerInfoParsing() {
        let json = """
        {"isPlaying":true,"isPaused":false,"position":30,"duration":120,"volume":50,
         "currentTrack":{"name":"Song","artist":"Band","album":"LP","duration":120,
                         "videoId":"abc","artworkURL":"https://example.com/a.jpg"}}
        """
        let now = KasetPlayerInfo.nowPlaying(fromJSON: json)
        XCTAssertEqual(now.title, "Song")
        XCTAssertEqual(now.artist, "Band")
        XCTAssertEqual(now.artworkURL, URL(string: "https://example.com/a.jpg"))
        XCTAssertTrue(now.isPlaying)
        XCTAssertEqual(now.progress, 0.25, accuracy: 1e-9)
    }

    func testPausedAndMissingFields() {
        let json = #"{"isPaused":true,"currentTrack":{"name":"Only a name"}}"#
        let now = KasetPlayerInfo.nowPlaying(fromJSON: json)
        XCTAssertEqual(now.title, "Only a name")
        XCTAssertFalse(now.isPlaying)
        XCTAssertEqual(now.progress, 0)
    }

    func testIdleCases() {
        XCTAssertEqual(KasetPlayerInfo.nowPlaying(fromJSON: ""), .idle)
        XCTAssertEqual(KasetPlayerInfo.nowPlaying(fromJSON: "garbage"), .idle)
        XCTAssertEqual(KasetPlayerInfo.nowPlaying(fromJSON: #"{"isPlaying":false}"#), .idle)
        XCTAssertEqual(KasetPlayerInfo.nowPlaying(fromJSON: #"{"currentTrack":{"name":""}}"#), .idle)
    }

    func testBackendSendsAndOpens() async {
        let runner = FakeRunner()
        let backend = KasetBackend(runner: runner)
        await backend.send(.next)
        await backend.open(PinnedItem(title: "S", videoIds: ["abc"]))
        await backend.open(PinnedItem(title: "Mix", shortcut: "Cadence Mix"))
        await backend.open(PinnedItem(title: "bad"))
        XCTAssertEqual(runner.scripts, [
            #"tell application "Kaset" to next track"#,
            #"tell application "Kaset" to play video "abc""#,
        ])
        XCTAssertEqual(runner.shortcuts, ["Cadence Mix"])
    }

    func testNowPlayingThroughBackend() async {
        let runner = FakeRunner()
        runner.reply = #"{"isPlaying":true,"position":1,"duration":4,"currentTrack":{"name":"X","artist":"Y"}}"#
        let now = await KasetBackend(runner: runner).nowPlaying()
        XCTAssertEqual(now.title, "X")
        XCTAssertEqual(now.progress, 0.25, accuracy: 1e-9)
        XCTAssertEqual(runner.scripts, [KasetScripts.playerInfo])
    }

    func testBackendSwallowsFailures() async {
        let runner = FakeRunner()
        runner.fail = true
        let backend = KasetBackend(runner: runner)
        await backend.send(.like)
        await backend.open(PinnedItem(title: "Mix", shortcut: "m"))
        let now = await backend.nowPlaying()
        XCTAssertEqual(now, .idle)
    }
}
