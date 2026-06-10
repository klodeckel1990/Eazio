import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Daten

struct DaySummary: Codable {
    let date: String
    let kcalTarget: Int
    let kcalConsumed: Int
    let kcalRemaining: Int
    let protein: Double
    let fat: Double
    let carbs: Double
    let waterMl: Int
    let waterTargetMl: Int
    let streak: Int
    let steps: Int?

    static let sample = DaySummary(
        date: "2026-06-10", kcalTarget: 2000, kcalConsumed: 1430, kcalRemaining: 570,
        protein: 82, fat: 50, carbs: 140, waterMl: 1250, waterTargetMl: 2000, streak: 12,
        steps: 6480
    )
}

struct SummaryEntry: TimelineEntry {
    let date: Date
    let summary: DaySummary?
    let loggedIn: Bool
}

// MARK: - Provider

/// Reads the bearer token from the shared keychain group (written by the app's
/// SharedAuthPlugin — both targets share the same default access group).
func sharedToken() -> String? {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "de.tellerwert.auth",
        kSecAttrAccount as String: "bearer",
        kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var result: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
          let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
}

struct SummaryProvider: TimelineProvider {
    static let apiBase = "https://eazio.de"

    func placeholder(in context: Context) -> SummaryEntry {
        SummaryEntry(date: .now, summary: .sample, loggedIn: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (SummaryEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        fetch(completion: completion)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SummaryEntry>) -> Void) {
        fetch { entry in
            let next = Calendar.current.date(byAdding: .minute, value: 30, to: .now) ?? .now
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    private func fetch(completion: @escaping (SummaryEntry) -> Void) {
        guard let token = sharedToken(),
              let url = URL(string: "\(Self.apiBase)/api/widget/summary") else {
            completion(SummaryEntry(date: .now, summary: nil, loggedIn: false))
            return
        }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 12
        // a cached summary defeats the whole point of reloading the timeline
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        URLSession(configuration: .ephemeral).dataTask(with: request) { data, response, _ in
            if let http = response as? HTTPURLResponse, http.statusCode == 401 {
                completion(SummaryEntry(date: .now, summary: nil, loggedIn: false))
                return
            }
            guard let data, let summary = try? JSONDecoder().decode(DaySummary.self, from: data) else {
                completion(SummaryEntry(date: .now, summary: nil, loggedIn: true))
                return
            }
            completion(SummaryEntry(date: .now, summary: summary, loggedIn: true))
        }.resume()
    }
}

// MARK: - Design-Tokens (Fresh Market)

enum TW {
    static let paper = Color(red: 0.984, green: 0.965, blue: 0.933) // #fbf6ee
    static let ink = Color(red: 0.137, green: 0.188, blue: 0.165) // #23302a
    static let ink2 = Color(red: 0.329, green: 0.396, blue: 0.361)
    static let green = Color(red: 0.180, green: 0.490, blue: 0.322) // #2e7d52
    static let coral = Color(red: 0.886, green: 0.416, blue: 0.247) // #e26a3f
    static let amber = Color(red: 0.843, green: 0.604, blue: 0.196)
    static let teal = Color(red: 0.184, green: 0.561, blue: 0.525)
    static let track = Color(red: 0.925, green: 0.878, blue: 0.800)
}

// MARK: - Bausteine

struct KcalRing: View {
    let summary: DaySummary
    var lineWidth: CGFloat = 9

    private var progress: Double {
        guard summary.kcalTarget > 0 else { return 0 }
        return min(1.0, Double(summary.kcalConsumed) / Double(summary.kcalTarget))
    }
    private var over: Bool { summary.kcalConsumed > summary.kcalTarget }

    var body: some View {
        ZStack {
            Circle().stroke(TW.track, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(over ? TW.coral : TW.green, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text("\(max(0, summary.kcalRemaining))")
                    .font(.system(.title2, design: .serif).weight(.semibold))
                    .foregroundStyle(TW.ink)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text("übrig")
                    .font(.caption2)
                    .foregroundStyle(TW.ink2)
            }
            .padding(lineWidth + 4)
        }
    }
}

struct StreakBadge: View {
    let streak: Int
    var body: some View {
        if streak > 1 {
            HStack(spacing: 2) {
                Image(systemName: "flame.fill").font(.caption2)
                Text("\(streak)").font(.caption.weight(.bold))
            }
            .foregroundStyle(TW.coral)
        }
    }
}

struct StepsBadge: View {
    let steps: Int?
    var body: some View {
        if let steps, steps > 0 {
            HStack(spacing: 3) {
                Image(systemName: "figure.walk").font(.caption2)
                Text(steps.formatted(.number.grouping(.automatic)))
                    .font(.caption.weight(.bold))
                    .monospacedDigit()
            }
            .foregroundStyle(TW.green)
        }
    }
}

struct MacroRow: View {
    let label: String
    let value: Double
    let color: Color
    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(label).font(.caption2).foregroundStyle(TW.ink2)
            Spacer(minLength: 2)
            Text("\(Int(value.rounded())) g")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(TW.ink)
                .monospacedDigit()
        }
    }
}

struct WaterBar: View {
    let summary: DaySummary
    private var progress: Double {
        guard summary.waterTargetMl > 0 else { return 0 }
        return min(1.0, Double(summary.waterMl) / Double(summary.waterTargetMl))
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 3) {
                Image(systemName: "drop.fill").font(.caption2).foregroundStyle(TW.teal)
                Text("\(summary.waterMl) ml")
                    .font(.caption2.weight(.semibold)).foregroundStyle(TW.ink).monospacedDigit()
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(TW.track)
                    Capsule().fill(TW.teal).frame(width: max(4, geo.size.width * progress))
                }
            }
            .frame(height: 5)
        }
    }
}

struct LoggedOutView: View {
    var body: some View {
        VStack(spacing: 4) {
            Text("Tellerwert")
                .font(.system(.headline, design: .serif))
                .foregroundStyle(TW.green)
            Text("In der App anmelden")
                .font(.caption2)
                .foregroundStyle(TW.ink2)
        }
    }
}

// MARK: - Widget-Ansichten

struct TellerwertWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: SummaryEntry

    var body: some View {
        Group {
            if let summary = entry.summary {
                switch family {
                case .systemMedium: medium(summary)
                default: small(summary)
                }
            } else {
                LoggedOutView()
            }
        }
        .containerBackground(TW.paper, for: .widget)
    }

    private func small(_ s: DaySummary) -> some View {
        VStack(spacing: 4) {
            KcalRing(summary: s)
            HStack {
                Text("von \(s.kcalTarget)")
                    .font(.caption2).foregroundStyle(TW.ink2)
                Spacer()
                StreakBadge(streak: s.streak)
            }
        }
    }

    private func medium(_ s: DaySummary) -> some View {
        HStack(spacing: 14) {
            KcalRing(summary: s, lineWidth: 10)
                .frame(maxWidth: 110)
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    Text("Heute")
                        .font(.system(.subheadline, design: .serif).weight(.semibold))
                        .foregroundStyle(TW.ink)
                    Spacer()
                    StepsBadge(steps: s.steps)
                    StreakBadge(streak: s.streak)
                }
                MacroRow(label: "Kohlenhydrate", value: s.carbs, color: TW.amber)
                MacroRow(label: "Protein", value: s.protein, color: TW.green)
                MacroRow(label: "Fett", value: s.fat, color: TW.teal)
                // Wasser: Label und Button auf einer Linie, Balken in voller Breite darunter
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        HStack(spacing: 3) {
                            Image(systemName: "drop.fill")
                                .font(.caption2)
                                .foregroundStyle(TW.teal)
                            Text("\(s.waterMl) ml")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(TW.ink)
                                .monospacedDigit()
                        }
                        Spacer()
                        Button(intent: AddWaterIntent(ml: 250)) {
                            Text("+250")
                                .font(.caption2.weight(.bold))
                                .monospacedDigit()
                                .padding(.horizontal, 9)
                                .padding(.vertical, 3.5)
                                .background(TW.teal.opacity(0.16), in: Capsule())
                                .foregroundStyle(TW.teal)
                        }
                        .buttonStyle(.plain)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(TW.track)
                            Capsule().fill(TW.teal).frame(
                                width: max(4, geo.size.width * min(1.0, s.waterTargetMl > 0
                                    ? Double(s.waterMl) / Double(s.waterTargetMl) : 0)))
                        }
                    }
                    .frame(height: 5)
                }
            }
        }
    }
}

// MARK: - Interaktives Wasser-Widget (App Intents, iOS 17+)

/// Loggt Wasser direkt aus dem Widget — ohne die App zu öffnen. Läuft in der
/// Widget-Extension selbst; der Bearer kommt aus der geteilten Keychain.
struct AddWaterIntent: AppIntent {
    static var title: LocalizedStringResource = "Wasser hinzufügen"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Menge (ml)")
    var ml: Int

    init() { self.ml = 250 }
    init(ml: Int) { self.ml = ml }

    func perform() async throws -> some IntentResult {
        guard let token = sharedToken(),
              let url = URL(string: "\(SummaryProvider.apiBase)/api/diary/water") else {
            return .result()
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["ml": ml])
        request.timeoutInterval = 12
        _ = try? await URLSession(configuration: .ephemeral).data(for: request)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

struct WaterAddButton: View {
    let ml: Int
    var body: some View {
        Button(intent: AddWaterIntent(ml: ml)) {
            Text("+\(ml)")
                .font(.caption.weight(.bold))
                .monospacedDigit()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 7)
                .background(TW.teal.opacity(0.16), in: Capsule())
                .foregroundStyle(TW.teal)
        }
        .buttonStyle(.plain)
    }
}

struct WaterWidgetView: View {
    let entry: SummaryEntry

    var body: some View {
        Group {
            if let s = entry.summary {
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 5) {
                        Image(systemName: "drop.fill")
                            .font(.subheadline)
                            .foregroundStyle(TW.teal)
                        Text("\(s.waterMl) ml")
                            .font(.system(.headline, design: .serif).weight(.semibold))
                            .foregroundStyle(TW.ink)
                            .monospacedDigit()
                            .minimumScaleFactor(0.7)
                            .lineLimit(1)
                    }
                    Text("von \(s.waterTargetMl) ml")
                        .font(.caption2)
                        .foregroundStyle(TW.ink2)
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(TW.track)
                            Capsule().fill(TW.teal).frame(
                                width: max(4, geo.size.width * min(1.0, s.waterTargetMl > 0
                                    ? Double(s.waterMl) / Double(s.waterTargetMl) : 0)))
                        }
                    }
                    .frame(height: 6)
                    Spacer(minLength: 2)
                    HStack(spacing: 6) {
                        WaterAddButton(ml: 250)
                        WaterAddButton(ml: 500)
                    }
                }
            } else {
                LoggedOutView()
            }
        }
        .containerBackground(TW.paper, for: .widget)
    }
}

struct TellerwertWaterWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TellerwertWater", provider: SummaryProvider()) { entry in
            WaterWidgetView(entry: entry)
        }
        .configurationDisplayName("Wasser")
        .description("Wasserstand sehen und direkt vom Home-Screen loggen.")
        .supportedFamilies([.systemSmall])
    }
}

// MARK: - Live Activity (Tagesbilanz auf Lock Screen + Dynamic Island)

struct MiniKcalRing: View {
    let state: TellerwertActivityAttributes.ContentState
    var lineWidth: CGFloat = 5

    private var progress: Double {
        guard state.kcalTarget > 0 else { return 0 }
        return min(1.0, Double(state.kcalConsumed) / Double(state.kcalTarget))
    }

    var body: some View {
        ZStack {
            Circle().stroke(TW.track, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(state.kcalConsumed > state.kcalTarget ? TW.coral : TW.green,
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
    }
}

struct LockScreenActivityView: View {
    let state: TellerwertActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                MiniKcalRing(state: state, lineWidth: 6)
                VStack(spacing: 0) {
                    Text("\(max(0, state.kcalRemaining))")
                        .font(.system(.headline, design: .serif).weight(.semibold))
                        .foregroundStyle(TW.ink)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text("übrig")
                        .font(.system(size: 9))
                        .foregroundStyle(TW.ink2)
                }
            }
            .frame(width: 64, height: 64)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text("Tellerwert")
                        .font(.system(.subheadline, design: .serif).weight(.semibold))
                        .foregroundStyle(TW.green)
                    Spacer()
                    StepsBadge(steps: state.steps)
                    StreakBadge(streak: state.streak)
                }
                HStack(spacing: 10) {
                    macro("KH", state.carbs, TW.amber)
                    macro("P", state.protein, TW.green)
                    macro("F", state.fat, TW.teal)
                }
                HStack(spacing: 5) {
                    Image(systemName: "drop.fill").font(.caption2).foregroundStyle(TW.teal)
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(TW.track)
                            Capsule().fill(TW.teal).frame(
                                width: max(4, geo.size.width * min(1.0, state.waterTargetMl > 0
                                    ? Double(state.waterMl) / Double(state.waterTargetMl) : 0)))
                        }
                    }
                    .frame(height: 5)
                    Text("\(state.waterMl) ml")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(TW.ink2)
                        .monospacedDigit()
                }
            }
        }
        .padding(14)
    }

    private func macro(_ label: String, _ value: Double, _ color: Color) -> some View {
        HStack(spacing: 3) {
            Circle().fill(color).frame(width: 5, height: 5)
            Text("\(Int(value.rounded())) g")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(TW.ink)
                .monospacedDigit()
            Text(label).font(.caption2).foregroundStyle(TW.ink2)
        }
    }
}

struct TellerwertLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TellerwertActivityAttributes.self) { context in
            LockScreenActivityView(state: context.state)
                .activityBackgroundTint(TW.paper)
                .activitySystemActionForegroundColor(TW.green)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    ZStack {
                        MiniKcalRing(state: context.state)
                        Text("\(max(0, context.state.kcalRemaining))")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.white)
                            .minimumScaleFactor(0.6)
                    }
                    .frame(width: 44, height: 44)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        StreakBadge(streak: context.state.streak)
                        StepsBadge(steps: context.state.steps)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 1) {
                        Text("\(max(0, context.state.kcalRemaining)) kcal übrig")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                        Text("von \(context.state.kcalTarget)")
                            .font(.caption2)
                            .foregroundStyle(.gray)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 5) {
                        Image(systemName: "drop.fill").font(.caption2).foregroundStyle(TW.teal)
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.gray.opacity(0.35))
                                Capsule().fill(TW.teal).frame(
                                    width: max(4, geo.size.width * min(1.0, context.state.waterTargetMl > 0
                                        ? Double(context.state.waterMl) / Double(context.state.waterTargetMl) : 0)))
                            }
                        }
                        .frame(height: 5)
                        Text("\(context.state.waterMl) ml")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.gray)
                            .monospacedDigit()
                    }
                }
            } compactLeading: {
                MiniKcalRing(state: context.state, lineWidth: 3)
                    .frame(width: 18, height: 18)
            } compactTrailing: {
                Text("\(max(0, context.state.kcalRemaining))")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(context.state.kcalConsumed > context.state.kcalTarget ? TW.coral : TW.green)
                    .monospacedDigit()
            } minimal: {
                MiniKcalRing(state: context.state, lineWidth: 3)
                    .frame(width: 18, height: 18)
            }
        }
    }
}

// MARK: - Deklaration

struct TellerwertWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TellerwertSummary", provider: SummaryProvider()) { entry in
            TellerwertWidgetView(entry: entry)
        }
        .configurationDisplayName("Tagesbilanz")
        .description("Verbleibende Kalorien, Makros und Wasser auf einen Blick.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct TellerwertWidgetBundle: WidgetBundle {
    var body: some Widget {
        TellerwertWidget()
        TellerwertWaterWidget()
        TellerwertLiveActivity()
    }
}
