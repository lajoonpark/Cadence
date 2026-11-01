import Foundation

public enum PlayerCommand: Equatable, Sendable {
    case togglePlayPause
    case next
    case previous
    case like
}

/// Whatever actually plays YouTube Music. The UI only talks to this protocol, so the player
/// (Kaset today) can change without touching the record.
public protocol MusicBackend: AnyObject, Sendable {
    func nowPlaying() async -> NowPlaying
    func send(_ command: PlayerCommand) async
    /// Do what a pinned ring item says (start a song, run a shortcut).
    func open(_ item: PinnedItem) async
}

/// Reports idle and ignores everything. Useful for tests and previews.
public final class NullBackend: MusicBackend {
    public init() {}
    public func nowPlaying() async -> NowPlaying { .idle }
    public func send(_ command: PlayerCommand) async {}
    public func open(_ item: PinnedItem) async {}
}
