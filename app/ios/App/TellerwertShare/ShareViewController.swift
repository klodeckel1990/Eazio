import UIKit
import UniformTypeIdentifiers

/// "Tellerwert" entry in the iOS share sheet. Extracts the shared URL or text,
/// drops it into the keychain mailbox (PendingShare) and tries to bring the
/// main app to the front. If iOS denies the foreground hop (extensions are not
/// officially allowed to open their host), the app picks the share up on its
/// next activation anyway.
class ShareViewController: UIViewController {
    private let confirmation = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.984, green: 0.965, blue: 0.933, alpha: 1)
        confirmation.text = "An Tellerwert übergeben …"
        confirmation.font = .preferredFont(forTextStyle: .headline)
        confirmation.textColor = UIColor(red: 0.137, green: 0.188, blue: 0.165, alpha: 1)
        confirmation.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(confirmation)
        NSLayoutConstraint.activate([
            confirmation.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            confirmation.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
        extractSharedItem()
    }

    private func extractSharedItem() {
        let providers = ((extensionContext?.inputItems as? [NSExtensionItem]) ?? [])
            .flatMap { $0.attachments ?? [] }

        if let urlProvider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) }) {
            urlProvider.loadItem(forTypeIdentifier: UTType.url.identifier) { [weak self] item, _ in
                let url = (item as? URL)?.absoluteString ?? (item as? String)
                self?.finish(url: url, text: nil)
            }
        } else if let textProvider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) }) {
            textProvider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { [weak self] item, _ in
                self?.finish(url: nil, text: item as? String)
            }
        } else {
            finish(url: nil, text: nil)
        }
    }

    private func finish(url: String?, text: String?) {
        PendingShare.store(url: url, text: text)
        DispatchQueue.main.async { [weak self] in
            self?.openMainApp()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                self?.extensionContext?.completeRequest(returningItems: nil)
            }
        }
    }

    /// Responder-chain workaround — UIApplication.shared is unavailable in
    /// extensions, but walking up to it and calling open(_:) usually works.
    private func openMainApp() {
        guard let url = URL(string: "tellerwert://share") else { return }
        let selector = NSSelectorFromString("openURL:")
        var responder: UIResponder? = self
        while let current = responder {
            if current.responds(to: selector), !(current is UIViewController) {
                current.perform(selector, with: url)
                return
            }
            responder = current.next
        }
    }
}
