import UIKit
import SwiftUI
import Security
import UniformTypeIdentifiers

// MARK: - API-Modelle (Spiegel der Web-Typen)

struct SharedIngredient: Codable, Identifiable {
    var raw: String
    var quantity: String
    var unit: String
    var name: String
    var id: String { raw }

    var display: String {
        let amount = [quantity, unit].filter { !$0.isEmpty }.joined(separator: " ")
        return amount.isEmpty ? name : "\(amount) \(name)"
    }
}

struct ImportedRecipe: Codable {
    var title: String?
    var servings: Int?
    var sourceUrl: String?
    var source: String?
    var imageUrl: String?
    var difficulty: String?
    var totalMinutes: Int?
    var ingredients: [SharedIngredient]
    var steps: [String]
}

// MARK: - Keychain (geteilte Gruppe, wie Widget/App)

func sharedAuthToken() -> String? {
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

// MARK: - API-Client

enum ShareApiError: Error {
    case notLoggedIn
    case importFailed(String)

    var message: String {
        switch self {
        case .notLoggedIn:
            return "Bitte zuerst in der Tellerwert-App anmelden."
        case .importFailed(let code):
            switch code {
            case "instagram_caption_required", "instagram_unavailable":
                return "Instagram-Text konnte nicht gelesen werden – Caption kopieren und in der App als Text importieren."
            case "import_unavailable":
                return "Der Import-Dienst ist gerade nicht verfügbar."
            default:
                return "Rezept konnte nicht gelesen werden – in der App per Text versuchen."
            }
        }
    }
}

enum ShareApi {
    static let base = "https://tellerwert.de"

    private static func request(path: String, body: [String: Any], token: String) async throws -> (Data, Int) {
        var req = URLRequest(url: URL(string: base + path)!)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        req.timeoutInterval = 60
        let (data, response) = try await URLSession.shared.data(for: req)
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }

    static func importRecipe(url: String?, text: String?) async throws -> ImportedRecipe {
        guard let token = sharedAuthToken() else { throw ShareApiError.notLoggedIn }
        var body: [String: Any] = [:]
        if let url { body["url"] = url }
        if let text { body["text"] = text }
        let (data, status) = try await request(path: "/api/recipes/import", body: body, token: token)
        guard status == 200 else {
            if status == 401 { throw ShareApiError.notLoggedIn }
            let code = (try? JSONDecoder().decode([String: String].self, from: data))?["error"] ?? "http_\(status)"
            throw ShareApiError.importFailed(code)
        }
        return try JSONDecoder().decode(ImportedRecipe.self, from: data)
    }

    static func save(_ recipe: ImportedRecipe) async throws {
        guard let token = sharedAuthToken() else { throw ShareApiError.notLoggedIn }
        let ingredients = recipe.ingredients.map {
            ["raw": $0.raw, "quantity": $0.quantity, "unit": $0.unit, "name": $0.name]
        }
        var body: [String: Any] = [
            "sourceType": recipe.source ?? "link",
            "ingredients": ingredients,
            "steps": recipe.steps,
        ]
        body["title"] = recipe.title ?? "Unbenanntes Rezept"
        if let v = recipe.servings { body["servings"] = v }
        if let v = recipe.sourceUrl { body["sourceUrl"] = v }
        if let v = recipe.imageUrl { body["imageUrl"] = v }
        if let v = recipe.difficulty { body["difficulty"] = v }
        if let v = recipe.totalMinutes { body["totalMinutes"] = v }
        let (_, status) = try await request(path: "/api/recipes", body: body, token: token)
        guard status == 201 || status == 200 else {
            throw ShareApiError.importFailed("save_http_\(status)")
        }
    }
}

// MARK: - SwiftUI

private enum TWColor {
    static let paper = Color(red: 0.984, green: 0.965, blue: 0.933)
    static let ink = Color(red: 0.137, green: 0.188, blue: 0.165)
    static let ink2 = Color(red: 0.329, green: 0.396, blue: 0.361)
    static let green = Color(red: 0.180, green: 0.490, blue: 0.322)
    static let coral = Color(red: 0.886, green: 0.416, blue: 0.247)
}

struct ShareImportView: View {
    let sharedUrl: String?
    let sharedText: String?
    let onClose: () -> Void

    enum Phase {
        case loading
        case preview(ImportedRecipe)
        case saving(ImportedRecipe)
        case saved
        case failed(String)
    }

    @State private var phase: Phase = .loading

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(TWColor.ink2.opacity(0.2))
            content
        }
        .background(TWColor.paper)
        .task { await runImport() }
    }

    private var header: some View {
        HStack {
            Text("Tellerwert")
                .font(.system(.title3, design: .serif).weight(.semibold))
                .foregroundStyle(TWColor.green)
            Spacer()
            Button(action: onClose) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(TWColor.ink2.opacity(0.6))
            }
        }
        .padding()
    }

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .loading:
            VStack(spacing: 14) {
                Spacer()
                ProgressView().controlSize(.large).tint(TWColor.green)
                Text("Rezept wird gelesen …")
                    .font(.headline).foregroundStyle(TWColor.ink)
                if let host = sharedUrl.flatMap({ URL(string: $0)?.host }) {
                    Text(host).font(.caption).foregroundStyle(TWColor.ink2)
                }
                Spacer()
            }
            .frame(maxWidth: .infinity)
        case .preview(let recipe), .saving(let recipe):
            preview(recipe, saving: { if case .saving = phase { return true } else { return false } }())
        case .saved:
            VStack(spacing: 12) {
                Spacer()
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 54)).foregroundStyle(TWColor.green)
                Text("Im Rezeptbuch gespeichert")
                    .font(.headline).foregroundStyle(TWColor.ink)
                Spacer()
            }
            .frame(maxWidth: .infinity)
        case .failed(let message):
            VStack(spacing: 12) {
                Spacer()
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 44)).foregroundStyle(TWColor.coral)
                Text(message)
                    .font(.subheadline).foregroundStyle(TWColor.ink)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
                Button("Schließen", action: onClose)
                    .buttonStyle(.bordered).tint(TWColor.ink2)
                Spacer()
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func preview(_ recipe: ImportedRecipe, saving: Bool) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if let imageUrl = recipe.imageUrl, let url = URL(string: imageUrl) {
                        AsyncImage(url: url) { image in
                            image.resizable().aspectRatio(contentMode: .fill)
                        } placeholder: {
                            Rectangle().fill(TWColor.ink2.opacity(0.1))
                        }
                        .frame(height: 170)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                    Text(recipe.title ?? "Unbenanntes Rezept")
                        .font(.system(.title2, design: .serif).weight(.semibold))
                        .foregroundStyle(TWColor.ink)
                    HStack(spacing: 14) {
                        if let servings = recipe.servings {
                            Label("\(servings) Portionen", systemImage: "person.2")
                        }
                        if let minutes = recipe.totalMinutes {
                            Label("\(minutes) Min.", systemImage: "clock")
                        }
                        Label("\(recipe.steps.count) Schritte", systemImage: "list.number")
                    }
                    .font(.caption).foregroundStyle(TWColor.ink2)

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Zutaten")
                            .font(.headline).foregroundStyle(TWColor.ink)
                        ForEach(recipe.ingredients.prefix(8)) { ingredient in
                            HStack(alignment: .top, spacing: 8) {
                                Circle().fill(TWColor.green).frame(width: 5, height: 5).padding(.top, 7)
                                Text(ingredient.display)
                                    .font(.subheadline).foregroundStyle(TWColor.ink)
                            }
                        }
                        if recipe.ingredients.count > 8 {
                            Text("+ \(recipe.ingredients.count - 8) weitere")
                                .font(.caption).foregroundStyle(TWColor.ink2)
                        }
                    }
                }
                .padding()
            }
            Button {
                Task { await save(recipe) }
            } label: {
                HStack {
                    if saving { ProgressView().tint(.white) }
                    Text(saving ? "Speichern …" : "Zu Tellerwert hinzufügen")
                        .font(.headline)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
            }
            .background(TWColor.green)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .disabled(saving)
            .padding()
        }
    }

    private func runImport() async {
        do {
            let recipe = try await ShareApi.importRecipe(url: sharedUrl, text: sharedText)
            phase = .preview(recipe)
        } catch let error as ShareApiError {
            phase = .failed(error.message)
        } catch {
            phase = .failed("Keine Verbindung zum Server.")
        }
    }

    private func save(_ recipe: ImportedRecipe) async {
        phase = .saving(recipe)
        do {
            try await ShareApi.save(recipe)
            phase = .saved
            try? await Task.sleep(nanoseconds: 900_000_000)
            onClose()
        } catch let error as ShareApiError {
            phase = .failed(error.message)
        } catch {
            phase = .failed("Speichern fehlgeschlagen.")
        }
    }
}

// MARK: - Entry Point

class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.984, green: 0.965, blue: 0.933, alpha: 1)
        extractSharedItem()
    }

    private func extractSharedItem() {
        let providers = ((extensionContext?.inputItems as? [NSExtensionItem]) ?? [])
            .flatMap { $0.attachments ?? [] }

        if let urlProvider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) }) {
            urlProvider.loadItem(forTypeIdentifier: UTType.url.identifier) { [weak self] item, _ in
                let url = (item as? URL)?.absoluteString ?? (item as? String)
                DispatchQueue.main.async { self?.present(url: url, text: nil) }
            }
        } else if let textProvider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) }) {
            textProvider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { [weak self] item, _ in
                DispatchQueue.main.async { self?.present(url: nil, text: item as? String) }
            }
        } else {
            present(url: nil, text: nil)
        }
    }

    private func present(url: String?, text: String?) {
        let view = ShareImportView(sharedUrl: url, sharedText: text) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
        let host = UIHostingController(rootView: view)
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        self.view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.topAnchor.constraint(equalTo: self.view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: self.view.bottomAnchor),
            host.view.leadingAnchor.constraint(equalTo: self.view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: self.view.trailingAnchor),
        ])
        host.didMove(toParent: self)
    }
}
