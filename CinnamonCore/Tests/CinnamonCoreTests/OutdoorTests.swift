import XCTest
@testable import CinnamonCore

final class OutdoorTests: XCTestCase {
    let advisor = OutdoorAdvisor()

    func testHeatIndexMatchesNOAATable() {
        // NOAA: 90 °F at 70 % humidity feels like about 106 °F (41 °C).
        let hi = HeatIndex.celsius(temperatureC: 32.2, relativeHumidity: 70)
        XCTAssertEqual(hi, 41, accuracy: 1)
        XCTAssertEqual(HeatIndex.celsius(temperatureC: 24, relativeHumidity: 50), 24, accuracy: 1.5)
    }

    func testAssessmentUsesWorstFactor() {
        let smoggy = advisor.assess(HourlyConditions(time: TestCalendar.date(9), usAQI: 120, uvIndex: 1, temperatureC: 26, relativeHumidity: 60))
        XCTAssertEqual(smoggy.risk, .danger)
        XCTAssertEqual(smoggy.factors, [.air])

        let sunny = advisor.assess(HourlyConditions(time: TestCalendar.date(12), usAQI: 40, uvIndex: 8, temperatureC: 29, relativeHumidity: 50))
        XCTAssertEqual(sunny.risk, .caution)
        XCTAssertTrue(sunny.factors.contains(.sun))
    }

    func testBestWindowIsAfterTheHeatOnASummerDay() {
        // 11:00–16:00 dangerous heat, 17:00–18:00 fine, 19:00 moderate air.
        var forecast: [HourlyConditions] = []
        for hour in 11...19 {
            let hot = hour < 17
            forecast.append(HourlyConditions(
                time: TestCalendar.date(hour),
                usAQI: hour == 19 ? 70 : 40,
                uvIndex: hot ? 8 : 1,
                temperatureC: hot ? 36 : 28,
                relativeHumidity: 65
            ))
        }
        let range = DateInterval(start: TestCalendar.date(11), end: TestCalendar.date(20))
        let outlook = advisor.outlook(for: forecast, within: range)
        XCTAssertEqual(outlook.bestWindow, DateInterval(start: TestCalendar.date(17), end: TestCalendar.date(19)))
        XCTAssertEqual(outlook.bestWindowRisk, .good)
        XCTAssertEqual(outlook.worstRisk, .danger)
        XCTAssertEqual(outlook.heatDanger?.start, TestCalendar.date(11))
        XCTAssertFalse(outlook.stayIn)
    }

    func testStayInWhenEveryHourIsDangerous() {
        let forecast = (10...20).map { HourlyConditions(time: TestCalendar.date($0), usAQI: 168, uvIndex: 2, temperatureC: 27, relativeHumidity: 60) }
        let outlook = advisor.outlook(for: forecast, within: DateInterval(start: TestCalendar.date(10), end: TestCalendar.date(21)))
        XCTAssertTrue(outlook.stayIn)
        XCTAssertTrue(outlook.severeAir)
        XCTAssertEqual(outlook.worstFactors, [.air])
    }

    func testWalkingLimitFollowsConditionsAndEnergy() {
        XCTAssertEqual(WalkingLimit.minutes(for: .good, energy: nil), 15)
        XCTAssertEqual(WalkingLimit.minutes(for: .caution, energy: .good), 5)
        XCTAssertEqual(WalkingLimit.minutes(for: .good, energy: .low), 7)
        XCTAssertEqual(WalkingLimit.minutes(for: .good, energy: .veryLow), 0)
        XCTAssertEqual(WalkingLimit.minutes(for: .danger, energy: .good), 0)
    }

    func testCoordinatesAreCoarsenedBeforeLeavingThePhone() {
        let home = Coordinate(latitude: 21.02851, longitude: 105.80417).coarsened
        XCTAssertEqual(home.latitude, 21.05, accuracy: 0.0001)
        XCTAssertEqual(home.longitude, 105.8, accuracy: 0.0001)
    }

    func testOpenMeteoResponsesMerge() throws {
        let air = #"{"hourly":{"time":["2026-09-25T17:00","2026-09-25T18:00"],"us_aqi":[62,null],"uv_index":[1.5,0.2]}}"#
        let weather = #"{"hourly":{"time":["2026-09-25T17:00","2026-09-25T18:00"],"temperature_2m":[31.2,29.8],"relative_humidity_2m":[70,74]}}"#
        let hours = try OpenMeteoParser(timeZone: TestCalendar.hanoi.timeZone)
            .merge(air: Data(air.utf8), weather: Data(weather.utf8))
        XCTAssertEqual(hours.count, 2)
        XCTAssertEqual(hours[0].time, TestCalendar.date(17))
        XCTAssertEqual(hours[0].usAQI, 62)
        XCTAssertNil(hours[1].usAQI)
        XCTAssertEqual(hours[1].temperatureC, 29.8)
    }

    func testAirNowWorseValueWins() throws {
        let json = #"[{"ParameterName":"O3","AQI":40},{"ParameterName":"PM2.5","AQI":158}]"#
        XCTAssertEqual(try AirNowParser.worstAQI(from: Data(json.utf8)), 158)

        let hours = [HourlyConditions(time: TestCalendar.date(10), usAQI: 90), HourlyConditions(time: TestCalendar.date(11), usAQI: 90)]
        let merged = hours.applyingObservedAQI(158, at: TestCalendar.date(10, 20))
        XCTAssertEqual(merged.map(\.usAQI), [158, 90])
    }
}
