import XCTest
@testable import CinnamonCore

final class DoseLogTests: XCTestCase {
    let planner = ReminderPlanner(rhythm: queRhythm, calendar: TestCalendar.hanoi)
    let critical = Medication(name: "A", timing: .afterMeals([.lunch]), notifyBackupIfMissed: true)

    var dose: PlannedDose {
        planner.plan(day: TestCalendar.date(0), medications: [critical], events: DayEvents())[0]
    }

    func testStatusMovesFromUpcomingToDueToMissed() {
        let log = DoseLog()
        XCTAssertEqual(log.status(of: dose, now: TestCalendar.date(14)), .upcoming)
        XCTAssertEqual(log.status(of: dose, now: TestCalendar.date(15, 30)), .due)
        XCTAssertEqual(log.status(of: dose, now: TestCalendar.date(17)), .missed)
    }

    func testTakenIsFinal() {
        var log = DoseLog()
        log.markTaken(dose, at: TestCalendar.date(15, 20))
        XCTAssertEqual(log.status(of: dose, now: TestCalendar.date(20)), .taken(at: TestCalendar.date(15, 20)))
        XCTAssertTrue(log.status(of: dose, now: TestCalendar.date(20)).isHandled)
    }

    func testSnoozePushesMissedPointBack() {
        var log = DoseLog()
        log.snooze(dose, until: TestCalendar.date(15, 45))
        XCTAssertEqual(log.status(of: dose, now: TestCalendar.date(15, 30)), .snoozed(until: TestCalendar.date(15, 45)))
        // Due 15:15, missed after 90 min normally (16:45); snoozed 30 min → 17:15.
        XCTAssertEqual(log.status(of: dose, now: TestCalendar.date(17, 0)), .due)
        XCTAssertEqual(log.status(of: dose, now: TestCalendar.date(17, 20)), .missed)
    }

    func testQueIsAlertedBeforeBackupContacts() {
        let alerts = BackupAlertPolicy.alerts(for: [dose], log: DoseLog(), settings: ReminderSettings())
        XCTAssertEqual(alerts.count, 1)
        XCTAssertLessThan(alerts[0].queAlertAt, alerts[0].backupAlertAt)
        XCTAssertEqual(alerts[0].backupAlertAt.timeIntervalSince(alerts[0].queAlertAt), 30 * 60)
    }

    func testNoBackupAlertWhenTakenOrNotFlagged() {
        var log = DoseLog()
        log.markTaken(dose, at: TestCalendar.date(15, 20))
        XCTAssertTrue(BackupAlertPolicy.alerts(for: [dose], log: log, settings: ReminderSettings()).isEmpty)

        let quiet = Medication(name: "B", timing: .afterMeals([.lunch]), notifyBackupIfMissed: false)
        let quietDose = planner.plan(day: TestCalendar.date(0), medications: [quiet], events: DayEvents())[0]
        XCTAssertTrue(BackupAlertPolicy.alerts(for: [quietDose], log: DoseLog(), settings: ReminderSettings()).isEmpty)
    }

    func testLogRoundTripsThroughJSON() throws {
        var data = AppData()
        data.medications = [critical]
        data.doseLog.markTaken(dose, at: TestCalendar.date(15, 20))
        var events = DayEvents()
        events.finishMeal(.lunch, at: TestCalendar.date(15, 10))
        data.events["2026-09-25"] = events

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("cinnamon-test-\(UUID().uuidString).json")
        let store = JSONStore<AppData>(url: url)
        try store.save(data)
        let loaded = try XCTUnwrap(store.load())
        XCTAssertEqual(loaded.medications, [critical])
        XCTAssertEqual(loaded.doseLog, data.doseLog)
        XCTAssertEqual(loaded.events["2026-09-25"]?.mealFinished(.lunch), TestCalendar.date(15, 10))
        try? FileManager.default.removeItem(at: url)
    }
}
