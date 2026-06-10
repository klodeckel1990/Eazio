import Foundation
import WebKit
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Tagesbilanz als Live Activity (Lock Screen + Dynamic Island). Gleicher
/// Kanal wie HealthSync: eigener WKScriptMessageHandler statt der Capacitor-
/// Plugin-Bridge. JS schickt nach jeder Tagebuch-Änderung die Tagessummen;
/// hier wird die Activity gestartet (erster Log des Tages), aktualisiert und
/// beim Tageswechsel oder auf Wunsch beendet. Läuft komplett lokal — kein
/// APNs nötig, funktioniert mit dem Free Personal Team.
final class LiveActivityController: NSObject, WKScriptMessageHandler {
    static let handlerName = "eazioActivity"

    func attach(to webView: WKWebView) {
        let controller = webView.configuration.userContentController
        controller.removeScriptMessageHandler(forName: Self.handlerName)
        controller.add(self, name: Self.handlerName)
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == Self.handlerName,
              let body = message.body as? [String: Any] else { return }
        guard #available(iOS 16.2, *) else { return }
        switch body["action"] as? String {
        case "update": update(body)
        case "end": endAll()
        default: break
        }
    }

    @available(iOS 16.2, *)
    private func update(_ body: [String: Any]) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled,
              let date = body["date"] as? String else { return }
        let num = { (key: String) -> Int in (body[key] as? NSNumber)?.intValue ?? 0 }
        let dbl = { (key: String) -> Double in (body[key] as? NSNumber)?.doubleValue ?? 0 }
        let state = TellerwertActivityAttributes.ContentState(
            kcalRemaining: num("kcalRemaining"),
            kcalTarget: num("kcalTarget"),
            kcalConsumed: num("kcalConsumed"),
            protein: dbl("protein"),
            carbs: dbl("carbs"),
            fat: dbl("fat"),
            waterMl: num("waterMl"),
            waterTargetMl: num("waterTargetMl"),
            steps: (body["steps"] as? NSNumber)?.intValue,
            streak: num("streak"))
        // bis Mitternacht gültig, danach gilt die Anzeige als veraltet
        let staleDate = Calendar.current.startOfDay(for: Date()).addingTimeInterval(86_400)
        let content = ActivityContent(state: state, staleDate: staleDate)

        Task {
            // Tageswechsel: alte Activity beenden, neue starten
            for activity in Activity<TellerwertActivityAttributes>.activities
            where activity.attributes.date != date {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            if let activity = Activity<TellerwertActivityAttributes>.activities
                .first(where: { $0.attributes.date == date }) {
                await activity.update(content)
            } else {
                _ = try? Activity.request(
                    attributes: TellerwertActivityAttributes(date: date),
                    content: content)
            }
        }
    }

    @available(iOS 16.2, *)
    private func endAll() {
        Task {
            for activity in Activity<TellerwertActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}
