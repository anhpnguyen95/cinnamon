import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public protocol HTTPFetching: Sendable {
    func data(from url: URL) async throws -> Data
}

public struct URLSessionFetcher: HTTPFetching {
    public init() {}

    public func data(from url: URL) async throws -> Data {
        try await withCheckedThrowingContinuation { continuation in
            URLSession.shared.dataTask(with: url) { data, response, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                    continuation.resume(throwing: URLError(.badServerResponse))
                } else {
                    continuation.resume(returning: data ?? Data())
                }
            }.resume()
        }
    }
}

/// Hourly air quality, UV and weather forecast from Open-Meteo (public, no key).
public struct OpenMeteoClient: Sendable {
    public var fetcher: any HTTPFetching
    public var timeZone: TimeZone

    public init(fetcher: any HTTPFetching = URLSessionFetcher(), timeZone: TimeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh") ?? .current) {
        self.fetcher = fetcher
        self.timeZone = timeZone
    }

    public func airQualityURL(for c: Coordinate) -> URL {
        var parts = URLComponents(string: "https://air-quality-api.open-meteo.com/v1/air-quality")!
        parts.queryItems = [
            URLQueryItem(name: "latitude", value: String(c.latitude)),
            URLQueryItem(name: "longitude", value: String(c.longitude)),
            URLQueryItem(name: "hourly", value: "us_aqi,uv_index"),
            URLQueryItem(name: "timezone", value: timeZone.identifier),
            URLQueryItem(name: "forecast_days", value: "2")
        ]
        return parts.url!
    }

    public func weatherURL(for c: Coordinate) -> URL {
        var parts = URLComponents(string: "https://api.open-meteo.com/v1/forecast")!
        parts.queryItems = [
            URLQueryItem(name: "latitude", value: String(c.latitude)),
            URLQueryItem(name: "longitude", value: String(c.longitude)),
            URLQueryItem(name: "hourly", value: "temperature_2m,relative_humidity_2m"),
            URLQueryItem(name: "timezone", value: timeZone.identifier),
            URLQueryItem(name: "forecast_days", value: "2")
        ]
        return parts.url!
    }

    public func hourly(at coordinate: Coordinate) async throws -> [HourlyConditions] {
        let c = coordinate.coarsened
        async let air = fetcher.data(from: airQualityURL(for: c))
        async let weather = fetcher.data(from: weatherURL(for: c))
        return try OpenMeteoParser(timeZone: timeZone).merge(air: try await air, weather: try await weather)
    }
}

public struct OpenMeteoParser: Sendable {
    public var timeZone: TimeZone

    public init(timeZone: TimeZone) {
        self.timeZone = timeZone
    }

    private struct Response: Decodable {
        struct Hourly: Decodable {
            var time: [String]
            var us_aqi: [Double?]?
            var uv_index: [Double?]?
            var temperature_2m: [Double?]?
            var relative_humidity_2m: [Double?]?
        }
        var hourly: Hourly
    }

    public func merge(air: Data, weather: Data) throws -> [HourlyConditions] {
        let decoder = JSONDecoder()
        let a = try decoder.decode(Response.self, from: air).hourly
        let w = try decoder.decode(Response.self, from: weather).hourly

        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm"

        var byTime: [String: HourlyConditions] = [:]
        for (i, stamp) in a.time.enumerated() {
            guard let date = formatter.date(from: stamp) else { continue }
            var hour = byTime[stamp] ?? HourlyConditions(time: date)
            if let v = value(a.us_aqi, i) { hour.usAQI = Int(v.rounded()) }
            hour.uvIndex = value(a.uv_index, i)
            byTime[stamp] = hour
        }
        for (i, stamp) in w.time.enumerated() {
            guard let date = formatter.date(from: stamp) else { continue }
            var hour = byTime[stamp] ?? HourlyConditions(time: date)
            hour.temperatureC = value(w.temperature_2m, i)
            hour.relativeHumidity = value(w.relative_humidity_2m, i)
            byTime[stamp] = hour
        }
        return byTime.values.sorted { $0.time < $1.time }
    }

    private func value(_ array: [Double?]?, _ i: Int) -> Double? {
        guard let array, i < array.count else { return nil }
        return array[i]
    }
}

/// Current AQI from AirNow (U.S. EPA / State Department monitors). Needs a free API key.
/// Coverage for Hanoi's embassy monitor through this endpoint must be confirmed; the app
/// falls back to Open-Meteo when AirNow returns nothing.
public struct AirNowClient: Sendable {
    public var apiKey: String
    public var fetcher: any HTTPFetching

    public init(apiKey: String, fetcher: any HTTPFetching = URLSessionFetcher()) {
        self.apiKey = apiKey
        self.fetcher = fetcher
    }

    public func currentURL(for c: Coordinate) -> URL {
        var parts = URLComponents(string: "https://www.airnowapi.org/aq/observation/latLong/current/")!
        parts.queryItems = [
            URLQueryItem(name: "format", value: "application/json"),
            URLQueryItem(name: "latitude", value: String(c.latitude)),
            URLQueryItem(name: "longitude", value: String(c.longitude)),
            URLQueryItem(name: "distance", value: "25"),
            URLQueryItem(name: "API_KEY", value: apiKey)
        ]
        return parts.url!
    }

    public func currentAQI(at coordinate: Coordinate) async throws -> Int? {
        let data = try await fetcher.data(from: currentURL(for: coordinate.coarsened))
        return try AirNowParser.worstAQI(from: data)
    }
}

public enum AirNowParser {
    private struct Observation: Decodable {
        var ParameterName: String
        var AQI: Int
    }

    /// The highest AQI across pollutants; AirNow reports PM2.5 and ozone separately.
    public static func worstAQI(from data: Data) throws -> Int? {
        try JSONDecoder().decode([Observation].self, from: data).map(\.AQI).max()
    }
}

extension Array where Element == HourlyConditions {
    /// PRD: when sources disagree, use the worse value. Applies an observed AQI to the hour it falls in.
    public func applyingObservedAQI(_ aqi: Int, at date: Date) -> [HourlyConditions] {
        map { hour in
            guard hour.time <= date, date < hour.time.addingTimeInterval(3600) else { return hour }
            var copy = hour
            copy.usAQI = Swift.max(hour.usAQI ?? 0, aqi)
            return copy
        }
    }
}
