import Foundation

/// A dose in half-pill steps, because "½ viên" is common.
public struct DoseQuantity: Codable, Hashable, Comparable, Sendable {
    public private(set) var halves: Int

    public init(halves: Int) {
        self.halves = max(1, halves)
    }

    public static func pills(_ count: Int) -> DoseQuantity {
        DoseQuantity(halves: count * 2)
    }

    public var text: String {
        let whole = halves / 2
        let hasHalf = halves % 2 == 1
        if whole == 0 { return "½" }
        return hasHalf ? "\(whole)½" : "\(whole)"
    }

    public func incremented() -> DoseQuantity { DoseQuantity(halves: halves + 1) }
    public func decremented() -> DoseQuantity { DoseQuantity(halves: halves - 1) }

    public static func < (lhs: DoseQuantity, rhs: DoseQuantity) -> Bool {
        lhs.halves < rhs.halves
    }
}

/// When a medicine is taken, as Que enters it. There are no built-in medical rules.
public enum DoseTiming: Codable, Hashable, Sendable {
    case onWaking
    case beforeMeals([MealSlot])
    case afterMeals([MealSlot])
    case atBedtime
    case everyHours(Int, startingAt: TimeOfDay)
    case asNeeded

    /// The reminder moments this timing creates each day.
    public var anchors: [DoseAnchor] {
        switch self {
        case .onWaking:
            return [.waking]
        case .beforeMeals(let meals):
            return MealSlot.allCases.filter { meals.contains($0) }.map { .beforeMeal($0) }
        case .afterMeals(let meals):
            return MealSlot.allCases.filter { meals.contains($0) }.map { .afterMeal($0) }
        case .atBedtime:
            return [.bedtime]
        case .everyHours(let hours, let start):
            guard hours > 0 else { return [] }
            return stride(from: 0, to: 24 * 60, by: hours * 60).map { .clock(start.adding(minutes: $0)) }
        case .asNeeded:
            return []
        }
    }
}

/// One reminder moment in the day. Doses sharing an anchor are grouped into one
/// reminder; before-meal and after-meal anchors are never merged.
public enum DoseAnchor: Codable, Hashable, Sendable {
    case waking
    case beforeMeal(MealSlot)
    case afterMeal(MealSlot)
    case bedtime
    case clock(TimeOfDay)

    public var key: String {
        switch self {
        case .waking: return "waking"
        case .beforeMeal(let meal): return "before-\(meal.rawValue)"
        case .afterMeal(let meal): return "after-\(meal.rawValue)"
        case .bedtime: return "bedtime"
        case .clock(let time): return "clock-\(time.minutes)"
        }
    }
}

public struct Medication: Codable, Hashable, Identifiable, Sendable {
    public var id: UUID
    public var name: String
    public var strength: String?
    public var photoFilename: String?
    public var quantity: DoseQuantity
    public var timing: DoseTiming
    public var notifyBackupIfMissed: Bool
    /// Remaining supply in half-pills, if she entered a count.
    public var remainingHalves: Int?
    public var isActive: Bool

    public init(
        id: UUID = UUID(),
        name: String,
        strength: String? = nil,
        photoFilename: String? = nil,
        quantity: DoseQuantity = .pills(1),
        timing: DoseTiming,
        notifyBackupIfMissed: Bool = true,
        remainingHalves: Int? = nil,
        isActive: Bool = true
    ) {
        self.id = id
        self.name = name
        self.strength = strength
        self.photoFilename = photoFilename
        self.quantity = quantity
        self.timing = timing
        self.notifyBackupIfMissed = notifyBackupIfMissed
        self.remainingHalves = remainingHalves
        self.isActive = isActive
    }

    public var displayName: String {
        guard let strength, !strength.isEmpty else { return name }
        return "\(name) \(strength)"
    }

    public var dosesPerDay: Int { timing.anchors.count }

    /// Days of supply left, or nil when unknown or taken only as needed.
    public var daysOfSupplyLeft: Int? {
        guard let remainingHalves, dosesPerDay > 0 else { return nil }
        return remainingHalves / (quantity.halves * dosesPerDay)
    }

    /// PRD: refill reminder when about 5 days remain.
    public var needsRefill: Bool {
        guard let days = daysOfSupplyLeft else { return false }
        return days <= 5
    }
}
