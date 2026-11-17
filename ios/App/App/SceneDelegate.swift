import UIKit
import Capacitor

final class LeafBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(LeafInboxPlugin())
    }
}

@objc(LeafInboxPlugin)
public class LeafInboxPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LeafInboxPlugin"
    public let jsName = "LeafInbox"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "take", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ack", returnType: CAPPluginReturnPromise)
    ]
    static var directory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("leaf-inbox", isDirectory: true)
    }
    @objc func take(_ call: CAPPluginCall) {
        let files = (try? FileManager.default.contentsOfDirectory(at: Self.directory, includingPropertiesForKeys: nil)) ?? []
        if let file = files.first(where: { !$0.lastPathComponent.hasSuffix(".part") }) {
            call.resolve(["id": file.lastPathComponent,
                          "name": String(file.lastPathComponent.dropFirst(37)),
                          "url": file.absoluteString])
        } else { call.resolve() }
    }
    @objc func ack(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.contains("/"), !id.contains("\\"), !id.contains("..") else {
            call.reject("Invalid inbox ID"); return
        }
        do {
            try FileManager.default.removeItem(at: Self.directory.appendingPathComponent(id))
            call.resolve()
        } catch { call.reject("Cannot remove inbox file") }
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private let imports = DispatchQueue(label: "org.leafreader.import")

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = LeafBridgeViewController()
        window?.makeKeyAndVisible()
        for context in connectionOptions.urlContexts { capture(context.url) }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts { capture(context.url) }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    private func capture(_ url: URL) {
        guard url.isFileURL, ["fb2", "epub", "pdf", "djvu", "djv"].contains(url.pathExtension.lowercased()) else { return }
        imports.async { [weak self] in
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            do {
                let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                guard size > 0, size <= 128 * 1024 * 1024 else { throw NSError(domain: "Leaf", code: 1, userInfo: [NSLocalizedDescriptionKey: "Лимит файла — 128 МБ."]) }
                let dir = LeafInboxPlugin.directory
                try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                let pending = try FileManager.default.contentsOfDirectory(atPath: dir.path)
                guard pending.count < 8 else { throw NSError(domain: "Leaf", code: 2, userInfo: [NSLocalizedDescriptionKey: "Слишком много ожидающих файлов."]) }
                let name = UUID().uuidString + "_" + url.lastPathComponent
                let temporary = dir.appendingPathComponent(name + ".part")
                let destination = dir.appendingPathComponent(name)
                defer { try? FileManager.default.removeItem(at: temporary) }
                try FileManager.default.copyItem(at: url, to: temporary)
                try FileManager.default.moveItem(at: temporary, to: destination)
                DispatchQueue.main.async {
                    (self?.window?.rootViewController as? CAPBridgeViewController)?.webView?.evaluateJavaScript("window.dispatchEvent(new Event('leaf-inbox'))")
                }
            } catch {
                DispatchQueue.main.async {
                    let alert = UIAlertController(title: "Не удалось открыть книгу", message: error.localizedDescription, preferredStyle: .alert)
                    alert.addAction(UIAlertAction(title: "OK", style: .default))
                    self?.window?.rootViewController?.present(alert, animated: true)
                }
            }
        }
    }
}
