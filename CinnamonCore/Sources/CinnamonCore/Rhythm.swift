import Foundation

public enum MealSlot: String, Codable, CaseIterable, Hashable, Sendable {
    case breakfast, lunch, dinner
}

/// Que's usual day. Reminders fall back to these times when she hasn't told the
/// app what she is actually doing.
public struct DailyRhythm: Codable, Hashable, Sendable {
    public var wake: TimeOfDay
    public var breakfast: TimeOfDay
    public var lunch: TimeOfDay
    public var dinner: TimeOfDay
    public var bed: TimeOfDay

    public init(wake: TimeOfDay, breakfast: TimeOfDay, lunch: TimeOfDay, dinner: TimeOfDay, bed: TimeOfDay) {
        self.wake = wake
        self.breakfast = breakfast
        self.lunch = lunch
        self.dinner = dinner
        self.bed = bed
    }

    public static let standard = DailyRhythm(
        wake: TimeOfDay(hour: 7),
        breakfast: TimeOfDay(hour: 7, minute: 30),
        lunch: TimeOfDay(hour: 12),
        dinner: TimeOfDay(hour: 19),
        bed: TimeOfDay(hour: 23)
    )

    public func time(of meal: MealSlot) -> TimeOfDay {
        switch meal {
        case .breakfast: return breakfast
        case .lunch: return lunch
        case .dinner: return dinner
        }
    }

    public mutating func set(_ time: TimeOfDay, for meal: MealSlot) {
        switch meal {
        case .breakfast: breakfast = time
        case .lunch: lunch = time
        case .dinner: dinner = time
        }
    }

    /// Times shortly after midnight belong to the previous day for a late sleeper.
    public func normalized(_ time: TimeOfDay) -> TimeOfDay {
        time.minutes < wake.minutes - 4 * 60 ? time.adding(minutes: 24 * 60) : time
    }

    /// The meal whose usual time is closest to `time`, used when she says "I'm eating now".
    public func likelyMeal(at time: TimeOfDay) -> MealSlot {
        let t = normalized(time).minutes
        return MealSlot.allCases.min { a, b in
            abs(self.time(of: a).minutes - t) < abs(self.time(of: b).minutes - t)
        } ?? .lunch
    }
}

/// Resolves which day a moment belongs to: 01:00 is still "yesterday" until
/// a few hours before her usual wake time.
public enum ActiveDay {
    public static func resolve(_ now: Date, rhythm: DailyRhythm, calendar: Calendar) -> Date {
        let minutes = TimeOfDay.of(now, relativeTo: now, calendar: calendar).minutes
        let start = calendar.startOfDay(for: now)
        if minutes < rhythm.wake.minutes - 4 * 60 {
            return calendar.date(byAdding: .day, value: -1, to: start) ?? start
        }
        return start
    }
}
