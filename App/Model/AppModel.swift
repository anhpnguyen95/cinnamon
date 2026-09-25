import CinnamonCore
import CoreLocation
import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
    private(set) var data: AppData
    private(set) var forecast: [HourlyConditions] = []
    private(set) var forecastUpdatedAt: Date?
    private(set) var forecastError: String?
    /// The clock the UI reads; refreshed every minute so statuses move on their own.
    var now = Date()

    let calendar: Calendar
    let notifications: NotificationScheduler
    private let store: JSONStore<AppData>
    private let photos: PhotoStore

    init(calendar: Calendar = .current, directory: URL = AppModel.defaultDirectory) {
        let store = JSONStore<AppData>(url: directory.appendingPathComponent("cinnamon.json"))
        self.calendar = calendar
        self.store = store
        self.photos = PhotoStore(directory: directory.appendingPathComponent("photos", isDirectory: true))
        self.notifications = NotificationScheduler()
        self.data = (try? store.load()) ?? AppData()
    }

    nonisolated static var defaultDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Cinnamon", isDirectory: true)
    }

    // MARK: - Day and doses

    var activeDay: Date { ActiveDay.resolve(now, rhythm: data.rhythm, calendar: calendar) }
    var activeDayKey: String { DayKey.key(for: activeDay, calendar: calendar) }

    private var planner: ReminderPlanner {
        ReminderPlanner(rhythm: data.rhythm, settings: data.reminderSettings, calendar: calendar)
    }

    func events(for dayKey: String) -> DayEvents { data.events[dayKey] ?? DayEvents() }

    func doses(on day: Date) -> [PlannedDose] {
        planner.plan(day: day, medications: data.medications, events: events(for: DayKey.key(for: day, calendar: calendar)))
    }

    var todaysDoses: [PlannedDose] { doses(on: activeDay) }

    func status(of dose: PlannedDose) -> DoseStatus { data.doseLog.status(of: dose, now: now) }

    /// The dose Home shows: the first one today that still needs her.
    var nextDose: PlannedDose? {
        todaysDoses.first { !status(of: $0).isHandled }
    }

    func dose(withID id: String) -> PlannedDose? {
        let yesterday = calendar.date(byAdding: .day, value: -1, to: activeDay) ?? activeDay
        return (doses(on: yesterday) + todaysDoses).first { $0.id == id }
    }

    func medication(_ id: UUID) -> Medication? { data.medications.first { $0.id == id } }

    func markTaken(_ dose: PlannedDose) {
        data.doseLog.markTaken(dose, at: Date())
        for item in dose.items {
            guard let index = data.medications.firstIndex(where: { $0.id == item.medicationID }),
                  let remaining = data.medications[index].remainingHalves else { continue }
            data.medications[index].remainingHalves = max(0, remaining - item.quantity.halves)
        }
        commit()
    }

    func skip(_ dose: PlannedDose) {
        data.doseLog.markSkipped(dose, at: Date())
        commit()
    }

    func snooze(_ dose: PlannedDose, minutes: Int? = nil) {
        let delay = minutes ?? data.reminderSettings.snoozeMinutes
        data.doseLog.snooze(dose, until: Date().addingTimeInterval(TimeInterval(delay * 60)))
        commit()
    }

    // MARK: - Meals

    /// The meal she is probably eating now, based on her usual times.
    var currentMeal: MealSlot {
        data.rhythm.likelyMeal(at: TimeOfDay.of(now, relativeTo: activeDay, calendar: calendar))
    }

    func mealInProgress() -> MealSlot? {
        let events = events(for: activeDayKey)
        return MealSlot.allCases.first { events.mealStarted($0) != nil && events.mealFinished($0) == nil }
    }

    /// "Tôi đang ăn": fires before-meal pills now. Returns the before-meal dose to show, if any.
    @discardableResult
    func startMeal(_ meal: MealSlot? = nil) -> PlannedDose? {
        let slot = meal ?? currentMeal
        var events = events(for: activeDayKey)
        events.startMeal(slot, at: Date())
        data.events[activeDayKey] = events
        commit()
        return todaysDoses.first { $0.anchor == .beforeMeal(slot) && !status(of: $0).isHandled }
    }

    /// "Ăn xong rồi": fires after-meal pills now. Returns the after-meal dose to show, if any.
    @discardableResult
    func finishMeal(_ meal: MealSlot) -> PlannedDose? {
        var events = events(for: activeDayKey)
        events.finishMeal(meal, at: Date())
        data.events[activeDayKey] = events
        commit()
        return todaysDoses.first { $0.anchor == .afterMeal(meal) && !status(of: $0).isHandled }
    }

    // MARK: - Medications

    func save(_ medication: Medication) {
        if let index = data.medications.firstIndex(where: { $0.id == medication.id }) {
            data.medications[index] = medication
        } else {
            data.medications.append(medication)
        }
        commit()
    }

    func delete(_ medication: Medication) {
        data.medications.removeAll { $0.id == medication.id }
        if let file = medication.photoFilename { photos.delete(file) }
        commit()
    }

    func savePhoto(_ jpeg: Data) -> String? { photos.save(jpeg) }
    func photoURL(_ filename: String?) -> URL? { filename.map(photos.url(for:)) }

    // MARK: - Check-in

    var todaysCheckIn: CheckIn? { data.checkIns.last { $0.dayKey == activeDayKey } }

    var needsCheckIn: Bool { data.isOnboarded && todaysCheckIn == nil }

    var adjustments: DayAdjustments { DayAdjustments.from(todaysCheckIn) }

    var shouldSuggestDoctor: Bool {
        FatigueMonitor.shouldSuggestDoctor(checkIns: data.checkIns, now: now, calendar: calendar)
    }

    func recordCheckIn(sleep: SleepQuality?, energy: EnergyLevel?) {
        data.checkIns.removeAll { $0.dayKey == activeDayKey }
        data.checkIns.append(CheckIn(dayKey: activeDayKey, at: Date(), sleep: sleep, energy: energy))
        var events = events(for: activeDayKey)
        if events.wokeAt == nil { events.wokeAt = Date() }
        data.events[activeDayKey] = events
        commit()
    }

    // MARK: - Outdoors

    var outlook: DayOutlook? {
        guard !forecast.isEmpty else { return nil }
        let start = max(now, data.rhythm.wake.date(on: activeDay, calendar: calendar))
        let end = data.rhythm.dinner.adding(minutes: 60).date(on: activeDay, calendar: calendar)
        guard start < end else { return nil }
        return OutdoorAdvisor(thresholds: data.thresholds).outlook(for: forecast, within: DateInterval(start: start, end: end))
    }

    var currentConditions: HourAssessment? {
        forecast.last { $0.time <= now }.map { OutdoorAdvisor(thresholds: data.thresholds).assess($0) }
    }

    var walkingLimitMinutes: Int {
        let risk = outlook?.bestWindowRisk ?? .danger
        return WalkingLimit.minutes(for: adjustments.indoorOnly ? .danger : risk, energy: adjustments.energy)
    }

    func refreshForecast() async {
        guard let home = data.homeCoordinate else { return }
        do {
            var hours = try await OpenMeteoClient().hourly(at: home)
            if let key = Bundle.main.object(forInfoDictionaryKey: "AirNowAPIKey") as? String, !key.isEmpty,
               let observed = try? await AirNowClient(apiKey: key).currentAQI(at: home) {
                hours = hours.applyingObservedAQI(observed, at: Date())
            }
            forecast = hours
            forecastUpdatedAt = Date()
            forecastError = nil
        } catch {
            forecastError = "Chưa tải được thời tiết. Kiểm tra kết nối mạng."
        }
    }

    // MARK: - Setup

    func completeOnboarding(rhythm: DailyRhythm, address: String, coordinate: Coordinate?) {
        data.rhythm = rhythm
        data.homeAddress = address.isEmpty ? nil : address
        data.homeCoordinate = coordinate
        data.isOnboarded = true
        commit()
    }

    func updateHealthLimits(fluidMl: Int?, saltMg: Int?, proteinG: Int?) {
        data.fluidLimitMl = fluidMl
        data.saltLimitMg = saltMg
        data.proteinLimitG = proteinG
        commit()
    }

    // MARK: - Persistence and notifications

    private func commit() {
        let cutoff = calendar.date(byAdding: .day, value: -60, to: now) ?? now
        data.doseLog.prune(before: cutoff)
        try? store.save(data)
        rescheduleNotifications()
    }

    func rescheduleNotifications() {
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: activeDay) ?? activeDay
        let upcoming = (todaysDoses + doses(on: tomorrow)).filter { !status(of: $0).isHandled }
        notifications.schedule(
            doses: upcoming,
            log: data.doseLog,
            settings: data.reminderSettings,
            medicationName: { [data] id in data.medications.first { $0.id == id }?.displayName ?? "Thuốc" }
        )
    }
}

/// Medicine photos, kept only on the phone.
struct PhotoStore {
    let directory: URL

    func url(for filename: String) -> URL { directory.appendingPathComponent(filename) }

    func save(_ jpeg: Data) -> String? {
        let name = "\(UUID().uuidString).jpg"
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try jpeg.write(to: url(for: name), options: [.atomic, .completeFileProtection])
            return name
        } catch {
            return nil
        }
    }

    func delete(_ filename: String) {
        try? FileManager.default.removeItem(at: url(for: filename))
    }
}

/// Turns her typed address into a coordinate on the phone (Apple's geocoder).
enum HomeLocator {
    static func coordinate(for address: String) async -> Coordinate? {
        guard !address.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        let placemarks = try? await CLGeocoder().geocodeAddressString(address + ", Việt Nam")
        guard let location = placemarks?.first?.location else { return nil }
        return Coordinate(latitude: location.coordinate.latitude, longitude: location.coordinate.longitude)
    }
}
