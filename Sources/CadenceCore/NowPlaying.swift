import Foundation

public struct NowPlaying: Equatable, Sendable {
    public var title: String
    public var artist: String
    public var artworkURL: URL?
    public var isPlaying: Bool
    /// 0...1 through the current track.
    public var progress: Double

    public init(title: String, artist: String, artworkURL: URL? = nil, isPlaying: Bool = false, progress: Double = 0) {
        self.title = title
        self.artist = artist
        self.artworkURL = artworkURL
        self.isPlaying = isPlaying
        self.progress = min(max(progress, 0), 1)
    }

    public static let idle = NowPlaying(title: "Nothing playing", artist: "")
}
