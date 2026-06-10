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

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == Self.handlerName else { return }
        sync()
    }

    func sync() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        store.requestAuthorization(toShare: nil, read: readTypes) { [weak self] granted, _ in
            guard granted else {
                self?.dispatch(["error": "denied"])
                return
            }
            self?.queryToday()
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
