import Foundation
import Combine

/// Loads and saves `AppSettings` as JSON in Application Support.
///
/// Decoding merges the saved object over the *encoded defaults* rather than
/// decoding it directly. Swift's synthesised `Codable` treats a missing key
/// as an error, so adding or renaming one field would otherwise throw and
/// silently reset every preference the operator had set — which is exactly
/// how the desktop booth lost its settings once. Never replace this with a
/// plain `JSONDecoder().decode(AppSettings.self, from: data)`.
@MainActor
final class SettingsStore: ObservableObject {
    @Published var settings: AppSettings {
        didSet { save() }
    }

    private let url: URL

    init() {
        let fm = FileManager.default
        let base = (try? fm.url(for: .applicationSupportDirectory,
                                in: .userDomainMask,
                                appropriateFor: nil,
                                create: true))
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        let dir = base.appendingPathComponent("Photobooth", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        url = dir.appendingPathComponent("settings.json")
        settings = SettingsStore.load(from: url)
    }

    private static func load(from url: URL) -> AppSettings {
        let defaults = AppSettings()
        guard
            let data = try? Data(contentsOf: url),
            let saved = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let defaultData = try? JSONEncoder().encode(defaults),
            var merged = try? JSONSerialization.jsonObject(with: defaultData) as? [String: Any]
        else { return defaults }

        for (key, value) in saved { merged[key] = value }

        guard
            let mergedData = try? JSONSerialization.data(withJSONObject: merged),
            let result = try? JSONDecoder().decode(AppSettings.self, from: mergedData)
        else { return defaults }

        return result
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(settings) else { return }
        try? data.write(to: url, options: .atomic)
    }
}
