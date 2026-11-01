import Foundation

/// A place the record's outer ring can take you to. Order here is dial order: the first case
/// sits at 12 o'clock and the rest follow clockwise.
public enum QuickTarget: Int, CaseIterable, Codable, Sendable {
    case liked
    case mixes
    case recent
    case playlists
    case search

    public var title: String {
        switch self {
        case .liked: "Liked"
        case .mixes: "Mixes"
        case .recent: "Recent"
        case .playlists: "Playlists"
        case .search: "Search"
        }
    }

    /// Number key that picks this target while the record is open (1-based).
    public var shortcutDigit: Int { rawValue + 1 }

    public init?(digit: Int) {
        self.init(rawValue: digit - 1)
    }
}
