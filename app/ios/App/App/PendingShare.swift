import Foundation
import Security

/// Hand-off mailbox between the share extension and the main app, stored in
/// the shared keychain group (App Groups are unavailable on free personal
/// teams). The extension drops {url|text} here; the app consumes it on
/// activation and routes the WebView to the import page.
/// NOTE: compiled into BOTH the App and the TellerwertShare targets.
enum PendingShare {
    private static let service = "de.tellerwert.share"
    private static let account = "pending"

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    struct Payload: Codable {
        var url: String?
        var text: String?
    }

    static func store(url: String?, text: String?) {
        guard url != nil || text != nil else { return }
        guard let data = try? JSONEncoder().encode(Payload(url: url, text: text)) else { return }
        let update: [String: Any] = [kSecValueData as String: data]
        var status = SecItemUpdate(baseQuery as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var add = baseQuery
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            status = SecItemAdd(add as CFDictionary, nil)
        }
        print("[PendingShare] stored, status: \(status)")
    }

    /// Reads without deleting — call clear() once the hand-off succeeded.
    static func peek() -> Payload? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let payload = try? JSONDecoder().decode(Payload.self, from: data) else { return nil }
        return payload
    }

    static func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }
}
