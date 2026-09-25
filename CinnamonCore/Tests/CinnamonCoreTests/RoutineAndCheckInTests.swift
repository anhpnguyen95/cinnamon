import XCTest
@testable import CinnamonCore

final class RoutineAndCheckInTests: XCTestCase {
    let calendar = TestCalendar.hanoi

    func testTargetMovesFifteenMinutesAfterAGoodWeek() {
        let target = RoutineTarget(current: TimeOfDay(hour: 21, minute: 30), goal: TimeOfDay(hour: 19))
        let actuals = [21 * 60 + 10, 21 * 60 + 25, 21 * 60 + 30, 21 * 60, 22 * 60].map(TimeOfDay.init(minutes:))
        let next = RoutineCoach.review(target, actuals: actuals, hold: false, now: TestCalendar.date(12), calendar: calendar)
        XCTAssertEqual(next.current, TimeOfDay(hour: 21, minute: 15))
        XCTAssertEqual(next.lastShiftedAt, TestCalendar.date(12))
    }

    func testTargetHoldsAfterBadWeekOrTooSoon() {
        let target = RoutineTarget(current: TimeOfDay(hour: 21, minute: 30), goal: TimeOfDay(hour: 19))
        let good = Array(repeating: TimeOfDay(hour: 21), count: 5)
        XCTAssertEqual(RoutineCoach.review(target, actuals: good, hold: true, now: TestCalendar.date(12), calendar: calendar), target)

        let missed = Array(repeating: TimeOfDay(hour: 22), count: 5)
        XCTAssertEqual(RoutineCoach.review(target, actuals: missed, hold: false, now: TestCalendar.date(12), calendar: calendar), target)

        var recent = target
        recent.lastShiftedAt = TestCalendar.date(12, day: 22)
        XCTAssertEqual(RoutineCoach.review(recent, actuals: good, hold: false, now: TestCalendar.date(12), calendar: calendar), recent)
    }

    func testTargetNeverPassesGoal() {
        let target = RoutineTarget(current: TimeOfDay(hour: 19, minute: 10), goal: TimeOfDay(hour: 19))
        let good = Array(repeating: TimeOfDay(hour: 19), count: 5)
        XCTAssertEqual(RoutineCoach.review(target, actuals: good, hold: false, now: TestCalendar.date(12), calendar: calendar).current, TimeOfDay(hour: 19))
    }

    func testCheckInAdjustsTheDayButNeverMedication() {
        let tired = DayAdjustments.from(CheckIn(dayKey: "2026-09-25", at: TestCalendar.date(11), sleep: .poor, energy: .low))
        XCTAssertEqual(tired.maxSuggestions, 2)
        XCTAssertTrue(tired.holdRoutineShift)
        XCTAssertFalse(tired.indoorOnly)

        let exhausted = DayAdjustments.from(CheckIn(dayKey: "2026-09-25", at: TestCalendar.date(11), sleep: .okay, energy: .veryLow))
        XCTAssertTrue(exhausted.indoorOnly)
        XCTAssertTrue(exhausted.pauseNonMedicationNudges)

        XCTAssertEqual(DayAdjustments.from(nil), .normal)
    }

    func testDoctorSuggestionAfterFiveHardDaysInAWeek() {
        let hard = (19...23).map { day in
            CheckIn(dayKey: "2026-09-\(day)", at: TestCalendar.date(11, day: day), sleep: .poor, energy: .low)
        }
        XCTAssertTrue(FatigueMonitor.shouldSuggestDoctor(checkIns: hard, now: TestCalendar.date(12), calendar: calendar))
        XCTAssertFalse(FatigueMonitor.shouldSuggestDoctor(checkIns: Array(hard.prefix(4)), now: TestCalendar.date(12), calendar: calendar))
    }

    func testLabelParserFindsNameAndStrength() {
        let lines = [
            RecognizedLine(text: "Hộp 10 vỉ x 10 viên", height: 0.03),
            RecognizedLine(text: "Prednisolon", height: 0.09),
            RecognizedLine(text: "5 mg", height: 0.05),
            RecognizedLine(text: "SĐK: VD-12345-10", height: 0.02)
        ]
        let guess = LabelParser.guess(from: lines)
        XCTAssertEqual(guess.name, "Prednisolon")
        XCTAssertEqual(guess.strength, "5 mg")
        XCTAssertEqual(LabelParser.strength(in: "Hydroxychloroquine 200MG"), "200 mg")
        XCTAssertEqual(LabelParser.strength(in: "Vitamin D 2,5 mcg"), "2.5 mcg")
    }
}
