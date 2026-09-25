import Foundation
@testable import CinnamonCore

enum TestCalendar {
    static let hanoi: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
        return calendar
    }()

    /// 2026-09-25 at the given local time in Hanoi.
    static func date(_ hour: Int, _ minute: Int = 0, day: Int = 25) -> Date {
        hanoi.date(from: DateComponents(year: 2026, month: 9, day: day, hour: hour, minute: minute))!
    }
}

/// Que's late rhythm from the PRD: up 10:30, breakfast 11:30, lunch 15:00, dinner 21:30, bed 01:00.
let queRhythm = DailyRhythm(
    wake: TimeOfDay(hour: 10, minute: 30),
    breakfast: TimeOfDay(hour: 11, minute: 30),
    lunch: TimeOfDay(hour: 15),
    dinner: TimeOfDay(hour: 21, minute: 30),
    bed: TimeOfDay(hour: 25)
)
