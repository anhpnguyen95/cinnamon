import Foundation

public struct ReminderSettings: Codable, Hashable, Sendable {
    /// Before-meal pills fire this long before her usual meal time, unless she says she is eating.
    public var beforeMealLeadMinutes: Int
    /// After-meal pills fire this long after her usual meal time, unless she marks the meal done.
    public var afterMealDelayMinutes: Int
    /// A dose not confirmed this long after it is due counts as missed.
    public var missedAfterMinutes: Int
    /// Backup contacts are told this long after Que's own missed-dose alert.
    public var backupDelayMinutes: Int
    public var snoozeMinutes: Int
    /// Gentle repeats after the first nudge, in minutes.
    public var renudgeOffsets: [Int]

    public init(
        beforeMealLeadMinutes: Int = 30,
        afterMealDelayMinutes: Int = 15,
        missedAfterMinutes: Int = 90,
        backupDelayMinutes: Int = 30,
        snoozeMinutes: Int = 15,
        renudgeOffsets: [Int] = [15, 45]
    ) {
        self.beforeMealLeadMinutes = beforeMealLeadMinutes
        self.afterMealDelayMinutes = afterMealDelayMinutes
        self.missedAfterMinutes = missedAfterMinutes
        self.backupDelayMinutes = backupDelayMinutes
        self.snoozeMinutes = snoozeMinutes
        self.renudgeOffsets = renudgeOffsets
    }
}

/// What actually happened today, from taps or voice ("I'm eating now").
public struct DayEvents: Codable, Hashable, Sendable {
    public var wokeAt: Date?
    public var bedAt: Date?
    private var mealStarts: [String: Date]
    private var mealEnds: [String: Date]

    public init(wokeAt: Date? = nil, bedAt: Date? = nil) {
        self.wokeAt = wokeAt
        self.bedAt = bedAt
        self.mealStarts = [:]
        self.mealEnds = [:]
    }

    public func mealStarted(_ meal: MealSlot) -> Date? { mealStarts[meal.rawValue] }
    public func mealFinished(_ meal: MealSlot) -> Date? { mealEnds[meal.rawValue] }

    public mutating func startMeal(_ meal: MealSlot, at date: Date) {
        mealStarts[meal.rawValue] = date
    }

    public mutating func finishMeal(_ meal: MealSlot, at date: Date) {
        if mealStarts[meal.rawValue] == nil { mealStarts[meal.rawValue] = date }
        mealEnds[meal.rawValue] = date
    }
}

public struct DoseItem: Codable, Hashable, Sendable {
    public var medicationID: UUID
    public var quantity: DoseQuantity

    public init(medicationID: UUID, quantity: DoseQuantity) {
        self.medicationID = medicationID
        self.quantity = quantity
    }
}

/// One grouped reminder: every pill Que takes at the same moment.
public struct PlannedDose: Hashable, Identifiable, Sendable {
    public var id: String
    public var dayKey: String
    public var anchor: DoseAnchor
    public var dueAt: Date
    public var missedAt: Date
    public var items: [DoseItem]
    /// True when the time comes from something she did (e.g. finished lunch), not her usual schedule.
    public var isFromEvent: Bool
    public var notifiesBackup: Bool

    public var totalHalves: Int { items.reduce(0) { $0 + $1.quantity.halves } }
}

public struct ReminderPlanner: Sendable {
    public var rhythm: DailyRhythm
    public var settings: ReminderSettings
    public var calendar: Calendar

    public init(rhythm: DailyRhythm, settings: ReminderSettings = ReminderSettings(), calendar: Calendar) {
        self.rhythm = rhythm
        self.settings = settings
        self.calendar = calendar
    }

    /// All grouped reminders for the day that starts at `day`, earliest first.
    public func plan(day: Date, medications: [Medication], events: DayEvents) -> [PlannedDose] {
        var order: [DoseAnchor] = []
        var groups: [DoseAnchor: [DoseItem]] = [:]
        var backup: Set<DoseAnchor> = []

        for medication in medications where medication.isActive {
            for anchor in medication.timing.anchors {
                if groups[anchor] == nil { order.append(anchor) }
                groups[anchor, default: []].append(DoseItem(medicationID: medication.id, quantity: medication.quantity))
                if medication.notifyBackupIfMissed { backup.insert(anchor) }
            }
        }

        let dayKey = DayKey.key(for: day, calendar: calendar)
        return order.map { anchor in
            let (due, fromEvent) = dueDate(for: anchor, day: day, events: events)
            return PlannedDose(
                id: "\(dayKey)|\(anchor.key)",
                dayKey: dayKey,
                anchor: anchor,
                dueAt: due,
                missedAt: due.addingTimeInterval(TimeInterval(settings.missedAfterMinutes * 60)),
                items: groups[anchor] ?? [],
                isFromEvent: fromEvent,
                notifiesBackup: backup.contains(anchor)
            )
        }
        .sorted { $0.dueAt < $1.dueAt }
    }

    func dueDate(for anchor: DoseAnchor, day: Date, events: DayEvents) -> (Date, Bool) {
        switch anchor {
        case .waking:
            if let woke = events.wokeAt { return (woke, true) }
            return (rhythm.wake.date(on: day, calendar: calendar), false)

        case .beforeMeal(let meal):
            if let started = events.mealStarted(meal) { return (started, true) }
            let usual = rhythm.time(of: meal).adding(minutes: -settings.beforeMealLeadMinutes)
            return (usual.date(on: day, calendar: calendar), false)

        case .afterMeal(let meal):
            if let finished = events.mealFinished(meal) { return (finished, true) }
            let delay = TimeInterval(settings.afterMealDelayMinutes * 60)
            if let started = events.mealStarted(meal) {
                // She started eating but hasn't said she's done: assume a 20-minute meal.
                return (started.addingTimeInterval(20 * 60 + delay), true)
            }
            return (rhythm.time(of: meal).date(on: day, calendar: calendar).addingTimeInterval(delay), false)

        case .bedtime:
            if let bed = events.bedAt { return (bed, true) }
            return (rhythm.bed.date(on: day, calendar: calendar), false)

        case .clock(let time):
            return (time.date(on: day, calendar: calendar), false)
        }
    }
}
