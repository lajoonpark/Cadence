import Foundation

public enum PlayerCommand: Equatable, Sendable {
    case togglePlayPause
    case next
    case previous
    case toggleLike
}

/// Whatever actually plays YouTube Music. The UI only talks to this protocol, so the choice
/// of player (an embedded web view of music.youtube.com, or driving another client) can be
/// made, or changed, without touching the record.
public protocol MusicBackend: AnyObject, Sendable {
    func nowPlaying() async -> NowPlaying
    func send(_ command: PlayerCommand) async
    /// Start (or open) one of the quick targets.
    func open(_ target: QuickTarget) async
}

/// Placeholder until a real backend exists: reports idle and ignores everything.
public final class NullBackend: MusicBackend {
    public init() {}
    public func nowPlaying() async -> NowPlaying { .idle }
    public func send(_ command: PlayerCommand) async {}
    public func open(_ target: QuickTarget) async {}
}
