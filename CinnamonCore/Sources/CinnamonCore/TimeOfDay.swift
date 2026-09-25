import Foundation

/// A time within Que's day, stored as minutes after midnight.
///
/// Values of 1440 or more are allowed on purpose: a bedtime of 01:00 belongs to
/// the same "day" as the dinner before it, so it is stored as 25:00.
public struct TimeOfDay: Codable, Hashable, Comparable, Sendable {
    public var minutes: Int

    public init(minutes: Int) {
        self.minutes = minutes
    }

    public init(hour: Int, minute: Int = 0) {
        self.minutes = hour * 60 + minute
    }

    public var hour: Int { (minutes / 60) % 24 }
    public var minute: Int { ((minutes % 60) + 60) % 60 }

    public func adding(minutes delta: Int) -> TimeOfDay {
        TimeOfDay(minutes: minutes + delta)
    }

    /// The absolute date for this time on the day that starts at `day`'s midnight.
    public func date(on day: Date, calendar: Calendar) -> Date {
        calendar.startOfDay(for: day).addingTimeInterval(TimeInterval(minutes * 60))
    }

    /// Minutes between the start of `day` and `date`, so 00:30 the next morning is 1470.
    public static func of(_ date: Date, relativeTo day: Date, calendar: Calendar) -> TimeOfDay {
        let start = calendar.startOfDay(for: day)
        return TimeOfDay(minutes: Int(date.timeIntervalSince(start) / 60))
    }

    /// "09:05", wrapping times after midnight back to the clock face.
    public var clockText: String {
        let h = hour < 10 ? "0\(hour)" : "\(hour)"
        let m = minute < 10 ? "0\(minute)" : "\(minute)"
        return "\(h):\(m)"
    }

    public static func < (lhs: TimeOfDay, rhs: TimeOfDay) -> Bool {
        lhs.minutes < rhs.minutes
    }
}

/// Stable "yyyy-MM-dd" keys for per-day records.
public enum DayKey {
    public static func key(for date: Date, calendar: Calendar) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        let y = c.year ?? 0, m = c.month ?? 0, d = c.day ?? 0
        return "\(y)-\(m < 10 ? "0" : "")\(m)-\(d < 10 ? "0" : "")\(d)"
    }
}
