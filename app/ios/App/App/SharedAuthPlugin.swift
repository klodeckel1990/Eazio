import Foundation
import Capacitor
import WidgetKit
import Security

/// Bridges the web layer's bearer token into the shared keychain group so the
/// widget extension can call the Tellerwert API on its own, and lets the web
/// layer poke WidgetKit after diary writes.
///
/// Storage is the keychain (not an App Group): both targets list
/// `$(AppIdentifierPrefix)de.tellerwert.shared` as their first keychain access
/// group, so items land there by default — and unlike App Groups this works
/// on free personal signing teams.
@objc(SharedAuthPlugin)
public class SharedAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SharedAuthPlugin"
    public let jsName = "SharedAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refreshWidgets", returnType: CAPPluginReturnPromise),
    ]

    static let service = "de.tellerwert.auth"
    static let account = "bearer"

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    @objc func setToken(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), !token.isEmpty else {
            call.reject("token fehlt")
            return
        }
        let data = Data(token.utf8)
        let update: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(Self.baseQuery as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var add = Self.baseQuery
            add[kSecValueData as String] = data
            // widgets refresh in the background — must be readable after first unlock
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(add as CFDictionary, nil)
        }
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    @objc func clearToken(_ call: CAPPluginCall) {
        SecItemDelete(Self.baseQuery as CFDictionary)
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    @objc func refreshWidgets(_ call: CAPPluginCall) {
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
