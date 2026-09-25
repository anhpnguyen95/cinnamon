import Foundation

/// Everything the app keeps, stored as one JSON file on the phone.
public struct AppData: Codable, Sendable {
    public var isOnboarded: Bool
    public var medications: [Medication]
    public var rhythm: DailyRhythm
    public var reminderSettings: ReminderSettings
    public var thresholds: OutdoorThresholds
    public var doseLog: DoseLog
    public var events: [String: DayEvents]
    public var checkIns: [CheckIn]
    public var homeAddress: String?
    public var homeCoordinate: Coordinate?
    public var dinnerTarget: RoutineTarget?
    public var bedTarget: RoutineTarget?
    /// Daily fluid limit from her doctor, in ml, if she has one. Hot-day advice never exceeds it.
    public var fluidLimitMl: Int?
    public var saltLimitMg: Int?
    public var proteinLimitG: Int?

    public init() {
        isOnboarded = false
        medications = []
        rhythm = .standard
        reminderSettings = ReminderSettings()
        thresholds = OutdoorThresholds()
        doseLog = DoseLog()
        events = [:]
        checkIns = []
    }
}

public struct JSONStore<Value: Codable>: Sendable {
    public let url: URL

    public init(url: URL) {
        self.url = url
    }

    public func load() throws -> Value? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(Value.self, from: Data(contentsOf: url))
    }

    public func save(_ value: Value) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try encoder.encode(value).write(to: url, options: [.atomic])
    }
}
