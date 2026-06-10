import UIKit
import Capacitor
import WidgetKit

/// Registers locally defined Capacitor plugins and runs the native side of two
/// hand-offs that deliberately avoid the JS bridge:
///  - token mirror: localStorage('eazio.token') → shared keychain (widget auth)
///  - pending share: keychain mailbox (from the share extension or the
///    tellerwert:// URL scheme) → WebView navigation to the import page
class MainViewController: CAPBridgeViewController {
    private let healthSync = HealthSync()
    private let liveActivity = LiveActivityController()

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SharedAuthPlugin())
        if let webView = bridge?.webView {
            healthSync.attach(to: webView) // JS: webkit.messageHandlers.eazioHealth
            liveActivity.attach(to: webView) // JS: webkit.messageHandlers.eazioActivity
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(syncTokenToKeychain),
                           name: UIApplication.didEnterBackgroundNotification, object: nil)
        // also fires on the app-switcher peek, before didEnterBackground —
        // the widget is fresh the moment the home screen becomes visible
        center.addObserver(self, selector: #selector(syncTokenToKeychain),
                           name: UIApplication.willResignActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(consumePendingShare),
                           name: UIApplication.didBecomeActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(consumePendingShare),
                           name: Notification.Name("TellerwertPendingShare"), object: nil)
        // initial passes once the web app has booted
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
            self?.syncTokenToKeychain()
            self?.consumePendingShare()
        }
    }

    @objc private func syncTokenToKeychain() {
        guard let webView = bridge?.webView else { return }
        webView.evaluateJavaScript("localStorage.getItem('eazio.token')") { result, _ in
            let token = result as? String
            SharedAuthPlugin.store(token: token)
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    @objc private func consumePendingShare() {
        guard let payload = PendingShare.peek(), let webView = bridge?.webView else { return }
        var components = URLComponents()
        components.path = "/import"
        var items: [URLQueryItem] = []
        if let url = payload.url { items.append(URLQueryItem(name: "import", value: url)) }
        if let text = payload.text { items.append(URLQueryItem(name: "import_text", value: text)) }
        guard !items.isEmpty else {
            PendingShare.clear()
            return
        }
        components.queryItems = items
        guard let target = components.string,
              let encoded = try? JSONEncoder().encode(target),
              let jsString = String(data: encoded, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.location.assign(\(jsString))") { _, error in
            if error == nil {
                PendingShare.clear()
            }
        }
    }
}
