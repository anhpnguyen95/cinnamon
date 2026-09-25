import XCTest
@testable import CinnamonCore

final class ReminderPlannerTests: XCTestCase {
    let day = TestCalendar.date(0)
    lazy var planner = ReminderPlanner(rhythm: queRhythm, calendar: TestCalendar.hanoi)

    func testBeforeAndAfterMealPillsAreNeverGrouped() {
        let before = Medication(name: "A", timing: .beforeMeals([.lunch]))
        let after = Medication(name: "B", timing: .afterMeals([.lunch]))
        let plan = planner.plan(day: day, medications: [before, after], events: DayEvents())
        XCTAssertEqual(plan.count, 2)
        XCTAssertEqual(Set(plan.map(\.anchor)), [.beforeMeal(.lunch), .afterMeal(.lunch)])
    }

    func testSameMomentPillsAreGroupedIntoOneReminder() {
        let a = Medication(name: "A", quantity: .pills(1), timing: .afterMeals([.lunch]))
        let b = Medication(name: "B", quantity: .pills(2), timing: .afterMeals([.lunch, .dinner]))
        let plan = planner.plan(day: day, medications: [a, b], events: DayEvents())
        let lunch = plan.first { $0.anchor == .afterMeal(.lunch) }
        XCTAssertEqual(lunch?.items.count, 2)
        XCTAssertEqual(lunch?.totalHalves, 6)
        XCTAssertEqual(plan.count, 2)
    }

    func testUsualTimesAreUsedWithoutEvents() {
        let before = Medication(name: "A", timing: .beforeMeals([.breakfast]))
        let after = Medication(name: "B", timing: .afterMeals([.dinner]))
        let bed = Medication(name: "C", timing: .atBedtime)
        let plan = planner.plan(day: day, medications: [before, after, bed], events: DayEvents())
        XCTAssertEqual(plan[0].dueAt, TestCalendar.date(11, 0))           // 30 min before 11:30
        XCTAssertEqual(plan[1].dueAt, TestCalendar.date(21, 45))          // 15 min after 21:30
        XCTAssertEqual(plan[2].dueAt, TestCalendar.date(1, 0, day: 26))   // bedtime after midnight
        XCTAssertFalse(plan[0].isFromEvent)
    }

    func testImEatingNowFiresBeforeMealDoseImmediately() {
        let before = Medication(name: "A", timing: .beforeMeals([.lunch]))
        var events = DayEvents()
        let now = TestCalendar.date(16, 10)
        events.startMeal(.lunch, at: now)
        let dose = planner.plan(day: day, medications: [before], events: events)[0]
        XCTAssertEqual(dose.dueAt, now)
        XCTAssertTrue(dose.isFromEvent)
    }

    func testAfterMealDoseFollowsFinishedMeal() {
        let after = Medication(name: "B", timing: .afterMeals([.lunch]))
        var events = DayEvents()
        events.startMeal(.lunch, at: TestCalendar.date(16, 0))
        XCTAssertEqual(planner.plan(day: day, medications: [after], events: events)[0].dueAt, TestCalendar.date(16, 35))
        events.finishMeal(.lunch, at: TestCalendar.date(16, 20))
        XCTAssertEqual(planner.plan(day: day, medications: [after], events: events)[0].dueAt, TestCalendar.date(16, 20))
    }

    func testIntervalDosesAndAsNeeded() {
        let every12 = Medication(name: "A", timing: .everyHours(12, startingAt: TimeOfDay(hour: 9)))
        let prn = Medication(name: "B", timing: .asNeeded)
        let plan = planner.plan(day: day, medications: [every12, prn], events: DayEvents())
        XCTAssertEqual(plan.map(\.dueAt), [TestCalendar.date(9), TestCalendar.date(21)])
    }

    func testInactiveMedicationIsIgnored() {
        let med = Medication(name: "A", timing: .onWaking, isActive: false)
        XCTAssertTrue(planner.plan(day: day, medications: [med], events: DayEvents()).isEmpty)
    }

    func testLikelyMealAndActiveDayForALateSleeper() {
        XCTAssertEqual(queRhythm.likelyMeal(at: TimeOfDay(hour: 22)), .dinner)
        XCTAssertEqual(queRhythm.likelyMeal(at: TimeOfDay(hour: 0, minute: 30)), .dinner)
        XCTAssertEqual(queRhythm.likelyMeal(at: TimeOfDay(hour: 12)), .breakfast)
        let lateNight = TestCalendar.date(1, 0, day: 26)
        XCTAssertEqual(ActiveDay.resolve(lateNight, rhythm: queRhythm, calendar: TestCalendar.hanoi), TestCalendar.date(0))
    }

    func testDoseQuantityText() {
        XCTAssertEqual(DoseQuantity(halves: 1).text, "½")
        XCTAssertEqual(DoseQuantity(halves: 3).text, "1½")
        XCTAssertEqual(DoseQuantity.pills(2).text, "2")
        XCTAssertEqual(DoseQuantity(halves: 1).decremented().halves, 1)
    }

    func testRefillWhenFiveDaysLeft() {
        var med = Medication(name: "A", quantity: .pills(1), timing: .afterMeals([.breakfast, .dinner]))
        med.remainingHalves = 20 // 10 pills, 2 a day
        XCTAssertEqual(med.daysOfSupplyLeft, 5)
        XCTAssertTrue(med.needsRefill)
        med.remainingHalves = 40
        XCTAssertFalse(med.needsRefill)
    }
}
