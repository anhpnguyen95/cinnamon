import CinnamonCore
import Foundation

/// Vietnamese copy for core types. v1 is Vietnamese only.
extension MealSlot {
    var name: String {
        switch self {
        case .breakfast: return "bữa sáng"
        case .lunch: return "bữa trưa"
        case .dinner: return "bữa tối"
        }
    }

    var shortName: String {
        switch self {
        case .breakfast: return "Sáng"
        case .lunch: return "Trưa"
        case .dinner: return "Tối"
        }
    }
}

extension DoseAnchor {
    var title: String {
        switch self {
        case .waking: return "Khi thức dậy"
        case .beforeMeal(let meal): return "Trước \(meal.name)"
        case .afterMeal(let meal): return "Sau \(meal.name)"
        case .bedtime: return "Trước khi ngủ"
        case .clock(let time): return "Lúc \(time.clockText)"
        }
    }
}

extension DoseTiming {
    var summary: String {
        switch self {
        case .onWaking: return "khi thức dậy"
        case .beforeMeals(let meals): return "trước " + Self.list(meals)
        case .afterMeals(let meals): return "sau " + Self.list(meals)
        case .atBedtime: return "trước khi ngủ"
        case .everyHours(let hours, let start): return "cứ \(hours) tiếng một lần, từ \(start.clockText)"
        case .asNeeded: return "khi cần"
        }
    }

    private static func list(_ meals: [MealSlot]) -> String {
        let names = MealSlot.allCases.filter { meals.contains($0) }.map(\.name)
        switch names.count {
        case 0: return "bữa ăn"
        case 1: return names[0]
        default: return names.dropLast().joined(separator: ", ") + " và " + names.last!
        }
    }
}

extension SleepQuality {
    var label: String {
        switch self {
        case .good: return "Ngủ ngon"
        case .okay: return "Bình thường"
        case .poor: return "Ngủ không ngon"
        }
    }
}

extension EnergyLevel {
    var label: String {
        switch self {
        case .good: return "Khoẻ"
        case .low: return "Hơi mệt"
        case .veryLow: return "Rất mệt"
        }
    }
}

extension Risk {
    var label: String {
        switch self {
        case .good: return "Tốt"
        case .caution: return "Cẩn thận"
        case .danger: return "Nên ở nhà"
        }
    }
}

enum Format {
    static let time: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "vi_VN")
        f.dateFormat = "HH:mm"
        return f
    }()

    static let weekday: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "vi_VN")
        f.dateFormat = "EEEE, d/M"
        return f
    }()

    static func time(_ date: Date) -> String { time.string(from: date) }

    static func window(_ interval: DateInterval) -> String {
        "\(time(interval.start)) – \(time(interval.end))"
    }
}
