import Foundation

public enum DoseOutcome: String, Codable, Sendable {
    case taken, skipped
}

public struct DoseRecord: Codable, Hashable, Sendable {
    public var plannedDoseID: String
    public var medicationID: UUID
    public var outcome: DoseOutcome
    public var at: Date

    public init(plannedDoseID: String, medicationID: UUID, outcome: DoseOutcome, at: Date) {
        self.plannedDoseID = plannedDoseID
        self.medicationID = medicationID
        self.outcome = outcome
        self.at = at
    }
}

public enum DoseStatus: Hashable, Sendable {
    case upcoming
    case due
    case snoozed(until: Date)
    case missed
    case taken(at: Date)
    case skipped

    /// Taken or skipped: nothing more to remind about.
    public var isHandled: Bool {
        switch self {
        case .taken, .skipped: return true
        default: return false
        }
    }
}

/// Everything Que confirmed. Stays on the phone; only missed-dose events ever leave it.
public struct DoseLog: Codable, Hashable, Sendable {
    public private(set) var records: [DoseRecord]
    private var snoozes: [String: Date]

    public init() {
        records = []
        snoozes = [:]
    }

    public mutating func markTaken(_ dose: PlannedDose, at date: Date) {
        record(dose, outcome: .taken, at: date)
    }

    public mutating func markSkipped(_ dose: PlannedDose, at date: Date) {
        record(dose, outcome: .skipped, at: date)
    }

    public mutating func snooze(_ dose: PlannedDose, until date: Date) {
        snoozes[dose.id] = date
    }

    private mutating func record(_ dose: PlannedDose, outcome: DoseOutcome, at date: Date) {
        records.removeAll { $0.plannedDoseID == dose.id }
        for item in dose.items {
            records.append(DoseRecord(plannedDoseID: dose.id, medicationID: item.medicationID, outcome: outcome, at: date))
        }
        snoozes[dose.id] = nil
    }

    public func records(for dose: PlannedDose) -> [DoseRecord] {
        records.filter { $0.plannedDoseID == dose.id }
    }

    /// When the dose should next be announced, accounting for snoozes.
    public func effectiveDueAt(_ dose: PlannedDose) -> Date {
        guard let snoozed = snoozes[dose.id] else { return dose.dueAt }
        return max(dose.dueAt, snoozed)
    }

    public func status(of dose: PlannedDose, now: Date) -> DoseStatus {
        let handled = records(for: dose)
        if !handled.isEmpty {
            if handled.contains(where: { $0.outcome == .taken }), let at = handled.map(\.at).max() {
                return .taken(at: at)
            }
            return .skipped
        }
        if let snoozed = snoozes[dose.id], now < snoozed { return .snoozed(until: snoozed) }
        if now < dose.dueAt { return .upcoming }
        // A snooze pushes the missed point back by the same amount.
        let missedAt = dose.missedAt.addingTimeInterval(effectiveDueAt(dose).timeIntervalSince(dose.dueAt))
        return now < missedAt ? .due : .missed
    }

    /// Drop records older than `cutoff` so the file stays small.
    public mutating func prune(before cutoff: Date) {
        records.removeAll { $0.at < cutoff }
    }
}

/// When backup contacts should hear about a missed dose. Que is always alerted first.
public struct BackupAlert: Hashable, Sendable {
    public var doseID: String
    public var medicationIDs: [UUID]
    public var queAlertAt: Date
    public var backupAlertAt: Date
}

public enum BackupAlertPolicy {
    public static func alerts(for doses: [PlannedDose], log: DoseLog, settings: ReminderSettings) -> [BackupAlert] {
        doses.compactMap { dose in
            guard dose.notifiesBackup, !log.status(of: dose, now: .distantPast).isHandled else { return nil }
            let shift = log.effectiveDueAt(dose).timeIntervalSince(dose.dueAt)
            let queAlert = dose.missedAt.addingTimeInterval(shift)
            return BackupAlert(
                doseID: dose.id,
                medicationIDs: dose.items.map(\.medicationID),
                queAlertAt: queAlert,
                backupAlertAt: queAlert.addingTimeInterval(TimeInterval(settings.backupDelayMinutes * 60))
            )
        }
    }
}
