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
    static let apiBase = "https://tellerwert.de"

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

/// Adaptive Palette: Hellmodus = "Fresh Market"-Papier, Dunkelmodus (und die
/// immer dunkle Dynamic Island) = Waldgrün-Anthrazit mit aufgehellten Akzenten.
enum TW {
    private static func dyn(_ l: (Double, Double, Double), _ d: (Double, Double, Double)) -> Color {
        Color(UIColor { trait in
            let c = trait.userInterfaceStyle == .dark ? d : l
            return UIColor(red: c.0, green: c.1, blue: c.2, alpha: 1)
        })
    }

    static let paper = dyn((0.984, 0.965, 0.933), (0.094, 0.114, 0.104)) // #fbf6ee / dunkles Waldgrün
    static let ink = dyn((0.137, 0.188, 0.165), (0.925, 0.945, 0.929))
    static let ink2 = dyn((0.329, 0.396, 0.361), (0.640, 0.700, 0.662))
    static let green = dyn((0.180, 0.490, 0.322), (0.455, 0.780, 0.580))
    static let coral = dyn((0.886, 0.416, 0.247), (0.949, 0.569, 0.412))
    static let amber = dyn((0.843, 0.604, 0.196), (0.918, 0.737, 0.392))
    static let teal = dyn((0.184, 0.561, 0.525), (0.420, 0.760, 0.718))
    static let track = dyn((0.925, 0.878, 0.800), (0.235, 0.275, 0.255))
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

/// Tellerwert-Keimling — derselbe Pfad wie das IconLeaf der App (24er-Raster).
struct SproutShape: Shape {
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 24
        let ox = rect.midX - 12 * s
        let oy = rect.midY - 12 * s
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: ox + x * s, y: oy + y * s) }
        var path = Path()
        // Stiel
        path.move(to: p(12, 21))
        path.addLine(to: p(12, 14))
        // linkes Blatt
        path.move(to: p(12, 14))
        path.addCurve(to: p(6, 8), control1: p(12, 10.7), control2: p(9.3, 8))
        path.addLine(to: p(4, 8))
        path.addCurve(to: p(10, 14), control1: p(4, 11.3), control2: p(6.7, 14))
        path.closeSubpath()
        // rechtes Blatt
        path.move(to: p(12, 12))
        path.addCurve(to: p(19, 5), control1: p(12, 8.1), control2: p(15.1, 5))
        path.addLine(to: p(20, 5))
        path.addCurve(to: p(13, 12), control1: p(20, 8.9), control2: p(16.9, 12))
        path.closeSubpath()
        return path
    }
}

struct BrandMark: View {
    var size: CGFloat
    var color: Color = TW.green
    var body: some View {
        SproutShape()
            .stroke(color, style: StrokeStyle(
                lineWidth: max(1.2, size / 24 * 1.9), lineCap: .round, lineJoin: .round))
            .frame(width: size, height: size)
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
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
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
                    HStack(spacing: 4) {
                        BrandMark(size: 15)
                        Text("Tellerwert")
                            .font(.system(.subheadline, design: .serif).weight(.semibold))
                            .foregroundStyle(TW.green)
                    }
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
                            .foregroundStyle(TW.ink)
                            .minimumScaleFactor(0.6)
                    }
                    .frame(width: 44, height: 44)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        StreakBadge(streak: context.state.streak)
                        StepsBadge(steps: context.state.steps)
                    }
                    .padding(.trailing, 6)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 1) {
                        HStack(spacing: 4) {
                            BrandMark(size: 17)
                            Text("Tellerwert")
                                .font(.system(.caption, design: .serif).weight(.semibold))
                                .foregroundStyle(TW.green)
                        }
                        Text("\(max(0, context.state.kcalRemaining)) kcal übrig")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(TW.ink)
                        Text("von \(context.state.kcalTarget)")
                            .font(.caption2)
                            .foregroundStyle(TW.ink2)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 6) {
                        Image(systemName: "drop.fill").font(.caption2).foregroundStyle(TW.teal)
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(TW.track)
                                Capsule().fill(TW.teal).frame(
                                    width: max(4, geo.size.width * min(1.0, context.state.waterTargetMl > 0
                                        ? Double(context.state.waterMl) / Double(context.state.waterTargetMl) : 0)))
                            }
                        }
                        .frame(height: 5)
                        Text("\(context.state.waterMl) ml")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(TW.ink2)
                            .monospacedDigit()
                            .lineLimit(1)
                            .fixedSize()
                            .layoutPriority(1)
                    }
                    .padding(.horizontal, 6)
                    .padding(.top, 4)
                }
            } compactLeading: {
                BrandMark(size: 16)
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
