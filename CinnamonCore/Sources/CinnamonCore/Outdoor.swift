import Foundation

/// One forecast hour, merged from public sources.
public struct HourlyConditions: Codable, Hashable, Sendable {
    public var time: Date
    public var usAQI: Int?
    public var uvIndex: Double?
    public var temperatureC: Double?
    public var relativeHumidity: Double?

    public init(time: Date, usAQI: Int? = nil, uvIndex: Double? = nil, temperatureC: Double? = nil, relativeHumidity: Double? = nil) {
        self.time = time
        self.usAQI = usAQI
        self.uvIndex = uvIndex
        self.temperatureC = temperatureC
        self.relativeHumidity = relativeHumidity
    }

    public var heatIndexC: Double? {
        guard let temperatureC, let relativeHumidity else { return temperatureC }
        return HeatIndex.celsius(temperatureC: temperatureC, relativeHumidity: relativeHumidity)
    }
}

/// NOAA heat index (Rothfusz regression with its standard adjustments).
public enum HeatIndex {
    public static func celsius(temperatureC: Double, relativeHumidity rh: Double) -> Double {
        let t = temperatureC * 9 / 5 + 32
        var hi = 0.5 * (t + 61.0 + (t - 68.0) * 1.2 + rh * 0.094)
        if (hi + t) / 2 >= 80 {
            hi = -42.379 + 2.04901523 * t + 10.14333127 * rh
                - 0.22475541 * t * rh - 0.00683783 * t * t
                - 0.05481717 * rh * rh + 0.00122874 * t * t * rh
                + 0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh
            if rh < 13, t >= 80, t <= 112 {
                hi -= ((13 - rh) / 4) * ((17 - abs(t - 95)) / 17).squareRoot()
            } else if rh > 85, t >= 80, t <= 87 {
                hi += ((rh - 85) / 10) * ((87 - t) / 5)
            }
        }
        return (hi - 32) * 5 / 9
    }
}

public enum Risk: Int, Codable, Comparable, Sendable {
    case good = 0, caution = 1, danger = 2

    public static func < (lhs: Risk, rhs: Risk) -> Bool { lhs.rawValue < rhs.rawValue }
}

public enum RiskFactor: String, Codable, Hashable, Sendable {
    case air, sun, heat
}

/// Que's personal limits. Defaults are conservative for lupus and reduced lung capacity,
/// and she can change them in settings.
public struct OutdoorThresholds: Codable, Hashable, Sendable {
    public var aqiCaution: Int
    public var aqiDanger: Int
    public var aqiSevere: Int
    public var uvCaution: Double
    public var heatCautionC: Double
    public var heatDangerC: Double

    public init(aqiCaution: Int = 51, aqiDanger: Int = 101, aqiSevere: Int = 151, uvCaution: Double = 3, heatCautionC: Double = 32, heatDangerC: Double = 40) {
        self.aqiCaution = aqiCaution
        self.aqiDanger = aqiDanger
        self.aqiSevere = aqiSevere
        self.uvCaution = uvCaution
        self.heatCautionC = heatCautionC
        self.heatDangerC = heatDangerC
    }
}

public struct HourAssessment: Hashable, Sendable {
    public var conditions: HourlyConditions
    public var risk: Risk
    public var factors: Set<RiskFactor>
    public var time: Date { conditions.time }
}

public struct DayOutlook: Hashable, Sendable {
    public var hours: [HourAssessment]
    /// Longest stretch at the lowest risk available, if any hour is not dangerous.
    public var bestWindow: DateInterval?
    public var bestWindowRisk: Risk?
    public var worstRisk: Risk
    public var severeAir: Bool
    public var heatDanger: DateInterval?

    /// Every waking hour is dangerous: stay in.
    public var stayIn: Bool { bestWindow == nil }

    public var worstFactors: Set<RiskFactor> {
        hours.filter { $0.risk == worstRisk }.reduce(into: Set<RiskFactor>()) { $0.formUnion($1.factors) }
    }
}

public struct OutdoorAdvisor: Sendable {
    public var thresholds: OutdoorThresholds

    public init(thresholds: OutdoorThresholds = OutdoorThresholds()) {
        self.thresholds = thresholds
    }

    public func assess(_ hour: HourlyConditions) -> HourAssessment {
        var risk = Risk.good
        var factors: Set<RiskFactor> = []

        func raise(_ level: Risk, _ factor: RiskFactor) {
            guard level > .good else { return }
            factors.insert(factor)
            risk = max(risk, level)
        }

        if let aqi = hour.usAQI {
            raise(aqi >= thresholds.aqiDanger ? .danger : aqi >= thresholds.aqiCaution ? .caution : .good, .air)
        }
        if let uv = hour.uvIndex {
            raise(uv >= thresholds.uvCaution ? .caution : .good, .sun)
        }
        if let heat = hour.heatIndexC {
            raise(heat >= thresholds.heatDangerC ? .danger : heat >= thresholds.heatCautionC ? .caution : .good, .heat)
        }
        return HourAssessment(conditions: hour, risk: risk, factors: factors)
    }

    /// Outlook for the hours in `range` (her waking hours).
    public func outlook(for forecast: [HourlyConditions], within range: DateInterval) -> DayOutlook {
        let hours = forecast
            .filter { range.contains($0.time) }
            .sorted { $0.time < $1.time }
            .map(assess)

        let worst = hours.map(\.risk).max() ?? .good
        let severe = hours.contains { ($0.conditions.usAQI ?? 0) >= thresholds.aqiSevere }

        var best: DateInterval?
        var bestRisk: Risk?
        if let floor = hours.map(\.risk).min(), floor < .danger {
            best = longestRun(in: hours) { $0.risk == floor }
            bestRisk = floor
        }

        let heatDanger = longestRun(in: hours) {
            ($0.conditions.heatIndexC ?? 0) >= thresholds.heatDangerC
        }

        return DayOutlook(hours: hours, bestWindow: best, bestWindowRisk: bestRisk, worstRisk: worst, severeAir: severe, heatDanger: heatDanger)
    }

    /// The longest run of consecutive hours matching `predicate`; the earliest wins a tie.
    private func longestRun(in hours: [HourAssessment], where predicate: (HourAssessment) -> Bool) -> DateInterval? {
        var best: (start: Date, end: Date)?
        var current: (start: Date, end: Date)?
        for hour in hours {
            let end = hour.time.addingTimeInterval(3600)
            if predicate(hour) {
                if let c = current, c.end == hour.time {
                    current = (c.start, end)
                } else {
                    current = (hour.time, end)
                }
                if let c = current {
                    let length = c.end.timeIntervalSince(c.start)
                    if best == nil || length > best!.end.timeIntervalSince(best!.start) {
                        best = c
                    }
                }
            } else {
                current = nil
            }
        }
        return best.map { DateInterval(start: $0.start, end: $0.end) }
    }
}

/// How far Que should walk today, in minutes each way (PRD table).
public enum WalkingLimit {
    public static func minutes(for risk: Risk, energy: EnergyLevel?) -> Int {
        var base: Int
        switch risk {
        case .good: base = 15
        case .caution: base = 5
        case .danger: base = 0
        }
        switch energy {
        case .low?: base /= 2
        case .veryLow?: base = 0
        default: break
        }
        return base
    }
}

/// Coordinates are coarsened before leaving the phone, so weather requests reveal
/// her district, never her address.
public struct Coordinate: Codable, Hashable, Sendable {
    public var latitude: Double
    public var longitude: Double

    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }

    /// Rounded to a 0.05° grid, roughly 5 km.
    public var coarsened: Coordinate {
        func round(_ v: Double) -> Double { (v / 0.05).rounded() * 0.05 }
        return Coordinate(latitude: round(latitude), longitude: round(longitude))
    }
}
