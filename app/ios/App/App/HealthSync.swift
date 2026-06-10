import Foundation
import HealthKit
import WebKit

/// Apple-Health-Anbindung über einen eigenen WKScriptMessageHandler — bewusst
/// nicht über die Capacitor-Plugin-Bridge (deren Dispatch für handregistrierte
/// Plugins in dieser App nie ankam, siehe SharedAuthPlugin/Token-Mirror).
///
/// JS → native: window.webkit.messageHandlers.eazioHealth.postMessage({action:'sync'})
/// native → JS: window.dispatchEvent(new CustomEvent('eazio:health', {detail:{…}}))
///
/// Gelesen werden die heutigen Schritte und Aktivitätskalorien plus das
/// jüngste Gewicht (Smart Scale). Die Berechtigung wird beim ersten Sync
/// angefragt; danach ist requestAuthorization ein No-op.
final class HealthSync: NSObject, WKScriptMessageHandler {
    static let handlerName = "eazioHealth"

    private let store = HKHealthStore()
    private weak var webView: WKWebView?

    private var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = []
        if let steps = HKObjectType.quantityType(forIdentifier: .stepCount) { types.insert(steps) }
        if let energy = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { types.insert(energy) }
        if let mass = HKObjectType.quantityType(forIdentifier: .bodyMass) { types.insert(mass) }
        return types
    }

    func attach(to webView: WKWebView) {
        self.webView = webView
        let controller = webView.configuration.userContentController
        controller.removeScriptMessageHandler(forName: Self.handlerName)
        controller.add(self, name: Self.handlerName)
    }

    /// Ernährungs-Typen, die Tellerwert nach Health zurückschreibt.
    private var shareTypes: Set<HKSampleType> {
        var types: Set<HKSampleType> = []
        let ids: [HKQuantityTypeIdentifier] = [
            .dietaryEnergyConsumed, .dietaryProtein, .dietaryFatTotal,
            .dietaryCarbohydrates, .dietaryWater,
        ]
        for id in ids {
            if let q = HKObjectType.quantityType(forIdentifier: id) { types.insert(q) }
        }
        return types
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == Self.handlerName else { return }
        let body = message.body as? [String: Any]
        if body?["action"] as? String == "writeDay", let body {
            writeDay(body)
        } else {
            sync()
        }
    }

    func sync() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        store.requestAuthorization(toShare: shareTypes, read: readTypes) { [weak self] granted, _ in
            guard granted else {
                self?.dispatch(["error": "denied"])
                return
            }
            self?.queryToday()
        }
    }

    /// Tages-Abgleich: löscht die von Tellerwert geschriebenen Samples des
    /// Tages und schreibt die aktuellen Summen neu — idempotent, Edits und
    /// Löschungen im Tagebuch zählen in Health nie doppelt.
    private func writeDay(_ body: [String: Any]) {
        guard HKHealthStore.isHealthDataAvailable(),
              let dateStr = body["date"] as? String else { return }
        store.requestAuthorization(toShare: shareTypes, read: readTypes) { [weak self] granted, _ in
            guard granted else { return }
            self?.reconcileDay(dateStr, body)
        }
    }

    private func reconcileDay(_ dateStr: String, _ body: [String: Any]) {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = .current
        guard let dayStart = fmt.date(from: dateStr) else { return }
        // HealthKit lehnt Samples mit Enddatum in der Zukunft ab
        let dayEnd = min(dayStart.addingTimeInterval(86_399), Date())
        guard dayEnd > dayStart else { return }

        let metrics: [(HKQuantityTypeIdentifier, HKUnit, String)] = [
            (.dietaryEnergyConsumed, .kilocalorie(), "kcal"),
            (.dietaryProtein, .gram(), "protein"),
            (.dietaryFatTotal, .gram(), "fat"),
            (.dietaryCarbohydrates, .gram(), "carbs"),
            (.dietaryWater, .literUnit(with: .milli), "waterMl"),
        ]
        let dayPredicate = HKQuery.predicateForSamples(
            withStart: dayStart, end: dayStart.addingTimeInterval(86_400), options: [])
        for (id, unit, key) in metrics {
            guard let type = HKObjectType.quantityType(forIdentifier: id) else { continue }
            let value = (body[key] as? NSNumber)?.doubleValue ?? 0
            // deleteObjects entfernt nur Samples, die DIESE App geschrieben hat
            store.deleteObjects(of: type, predicate: dayPredicate) { [weak self] _, _, _ in
                guard value > 0 else { return }
                let sample = HKQuantitySample(
                    type: type,
                    quantity: HKQuantity(unit: unit, doubleValue: value),
                    start: dayStart,
                    end: dayEnd)
                self?.store.save(sample) { _, _ in }
            }
        }
    }

    private func queryToday() {
        let group = DispatchGroup()
        var payload: [String: Any] = [:]
        let lock = NSLock()
        let now = Date()
        let todayPredicate = HKQuery.predicateForSamples(
            withStart: Calendar.current.startOfDay(for: now), end: now, options: .strictStartDate)

        func sumQuery(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, key: String) {
            guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { return }
            group.enter()
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: todayPredicate,
                                          options: .cumulativeSum) { _, stats, _ in
                if let sum = stats?.sumQuantity() {
                    lock.lock(); payload[key] = sum.doubleValue(for: unit); lock.unlock()
                }
                group.leave()
            }
            store.execute(query)
        }

        sumQuery(.stepCount, unit: .count(), key: "steps")
        sumQuery(.activeEnergyBurned, unit: .kilocalorie(), key: "activeKcal")

        if let massType = HKObjectType.quantityType(forIdentifier: .bodyMass) {
            group.enter()
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            let query = HKSampleQuery(sampleType: massType, predicate: nil, limit: 1,
                                      sortDescriptors: [sort]) { _, samples, _ in
                if let sample = samples?.first as? HKQuantitySample {
                    lock.lock()
                    payload["weightKg"] = sample.quantity.doubleValue(for: .gramUnit(with: .kilo))
                    payload["weightAt"] = ISO8601DateFormatter().string(from: sample.endDate)
                    lock.unlock()
                }
                group.leave()
            }
            store.execute(query)
        }

        group.notify(queue: .main) { [weak self] in
            self?.dispatch(payload)
        }
    }

    private func dispatch(_ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(
                "window.dispatchEvent(new CustomEvent('eazio:health',{detail:\(json)}))",
                completionHandler: nil)
        }
    }
}
