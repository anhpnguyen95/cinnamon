import Foundation

public enum SleepQuality: String, Codable, CaseIterable, Sendable {
    case good, okay, poor
}

public enum EnergyLevel: String, Codable, CaseIterable, Sendable {
    case good, low, veryLow
}

public struct CheckIn: Codable, Hashable, Sendable {
    public var dayKey: String
    public var at: Date
    public var sleep: SleepQuality?
    public var energy: EnergyLevel?

    public init(dayKey: String, at: Date, sleep: SleepQuality?, energy: EnergyLevel?) {
        self.dayKey = dayKey
        self.at = at
        self.sleep = sleep
        self.energy = energy
    }

    var isHardDay: Bool { sleep == .poor || energy == .low || energy == .veryLow }
    var isVeryHardDay: Bool { sleep == .poor || energy == .veryLow }
}

/// How the day changes after the morning check-in (PRD, Feature 4).
/// Medication reminders are never paused, whatever the answer.
public struct DayAdjustments: Equatable, Sendable {
    public var maxSuggestions: Int
    public var energy: EnergyLevel?
    public var indoorOnly: Bool
    public var pauseNonMedicationNudges: Bool
    public var holdRoutineShift: Bool
    public var suggestAfternoonRest: Bool
    public var windDownEarlierMinutes: Int

    public static let normal = DayAdjustments(
        maxSuggestions: 3, energy: nil, indoorOnly: false, pauseNonMedicationNudges: false,
        holdRoutineShift: false, suggestAfternoonRest: false, windDownEarlierMinutes: 0
    )

    public static func from(_ checkIn: CheckIn?) -> DayAdjustments {
        guard let checkIn else { return .normal }
        if checkIn.energy == .veryLow {
            return DayAdjustments(
                maxSuggestions: 1, energy: .veryLow, indoorOnly: true, pauseNonMedicationNudges: true,
                holdRoutineShift: true, suggestAfternoonRest: true, windDownEarlierMinutes: 15
            )
        }
        if checkIn.isHardDay {
            return DayAdjustments(
                maxSuggestions: 2, energy: checkIn.energy, indoorOnly: false, pauseNonMedicationNudges: false,
                holdRoutineShift: true, suggestAfternoonRest: true,
                windDownEarlierMinutes: checkIn.sleep == .poor ? 15 : 0
            )
        }
        var normal = DayAdjustments.normal
        normal.energy = checkIn.energy
        return normal
    }
}

public enum FatigueMonitor {
    /// PRD: bad sleep or very low energy on 5 of the last 7 days → suggest telling her doctor.
    public static func shouldSuggestDoctor(checkIns: [CheckIn], now: Date, calendar: Calendar) -> Bool {
        guard let weekAgo = calendar.date(byAdding: .day, value: -7, to: now) else { return false }
        let recentDays = Set(checkIns.filter { $0.at > weekAgo && $0.isVeryHardDay }.map(\.dayKey))
        return recentDays.count >= 5
    }
}

/// A meal or bedtime target that moves earlier in small steps (PRD, Feature 4).
public struct RoutineTarget: Codable, Hashable, Sendable {
    public var current: TimeOfDay
    public var goal: TimeOfDay
    public var lastShiftedAt: Date?

    public init(current: TimeOfDay, goal: TimeOfDay, lastShiftedAt: Date? = nil) {
        self.current = current
        self.goal = goal
        self.lastShiftedAt = lastShiftedAt
    }
}

public enum RoutineCoach {
    public static let stepMinutes = 15
    public static let requiredHits = 4

    /// Moves the target 15 minutes earlier once a week, only if she met it on most days
    /// and nothing asked to hold it (a bad-sleep week). Never goes past her goal.
    public static func review(_ target: RoutineTarget, actuals: [TimeOfDay], hold: Bool, now: Date, calendar: Calendar) -> RoutineTarget {
        guard !hold, target.current > target.goal else { return target }
        if let last = target.lastShiftedAt,
           let nextAllowed = calendar.date(byAdding: .day, value: 7, to: last),
           now < nextAllowed {
            return target
        }
        let hits = actuals.filter { $0 <= target.current }.count
        guard hits >= requiredHits else { return target }
        var next = target
        next.current = max(target.goal, target.current.adding(minutes: -stepMinutes))
        next.lastShiftedAt = now
        return next
    }
}
