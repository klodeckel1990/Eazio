import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// Geteilt zwischen App (startet/aktualisiert die Live Activity) und der
/// Widget-Extension (rendert sie). Attributes = fix pro Activity (ein Tag),
/// ContentState = die Tagesbilanz, die sich mit jedem Log ändert.
@available(iOS 16.2, *)
struct TellerwertActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var kcalRemaining: Int
        var kcalTarget: Int
        var kcalConsumed: Int
        var protein: Double
        var carbs: Double
        var fat: Double
        var waterMl: Int
        var waterTargetMl: Int
        var steps: Int?
        var streak: Int
    }

    /// YYYY-MM-DD — ein Tageswechsel beendet die alte Activity.
    var date: String
}
#endif
