import UIKit
import Capacitor
import WidgetKit

/// Registers locally defined Capacitor plugins and mirrors the WebView's auth
/// token into the shared keychain so the widget can fetch its own data. The
/// mirror runs natively (evaluateJavaScript on localStorage) — independent of
/// any JS bridge plumbing — shortly after launch and whenever the app goes to
/// the background (i.e. right after the user logged a meal and left).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SharedAuthPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(syncTokenToKeychain),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
        // initial sync once the web app has booted and (re)stored its token
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
            self?.syncTokenToKeychain()
        }
    }

    @objc private func syncTokenToKeychain() {
        guard let webView = bridge?.webView else { return }
        webView.evaluateJavaScript("localStorage.getItem('eazio.token')") { result, _ in
            let token = result as? String
            let status = SharedAuthPlugin.store(token: token)
            print("[SharedAuth] native token sync, hasToken: \(token?.isEmpty == false), status: \(status)")
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}
