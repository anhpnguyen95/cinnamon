import CinnamonCore
import SwiftUI

/// The small card on Home.
struct OutdoorSummaryCard: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(model.outlook?.stayIn == true ? "HÔM NAY" : "GIỜ TỐT ĐỂ RA NGOÀI").eyebrow()
                    Text(OutdoorCopy.headline(model.outlook, noLocation: model.data.homeCoordinate == nil))
                        .font(Typography.display(28))
                        .foregroundStyle(Palette.ink)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Palette.bark)
                    .frame(width: 48, height: 48)
                    .background(Palette.chai, in: Circle())
            }
            if let now = model.currentConditions {
                ConditionChips(assessment: now)
            } else if let error = model.forecastError {
                Text(error).font(Typography.text(16)).foregroundStyle(Palette.muted)
            }
        }
        .card(padding: 20)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Xem chi tiết thời tiết hôm nay")
    }
}

struct ConditionChips: View {
    let assessment: HourAssessment

    var body: some View {
        HStack(spacing: 8) {
            chip("Không khí", value: aqiText, factor: .air)
            chip("Nắng (UV)", value: uvText, factor: .sun)
            chip("Cảm giác", value: heatText, factor: .heat)
        }
    }

    private var aqiText: String { assessment.conditions.usAQI.map { "\($0)" } ?? "–" }
    private var uvText: String { assessment.conditions.uvIndex.map { "\(Int($0.rounded()))" } ?? "–" }
    private var heatText: String { assessment.conditions.heatIndexC.map { "\(Int($0.rounded()))°C" } ?? "–" }

    private func chip(_ title: String, value: String, factor: RiskFactor) -> some View {
        let flagged = assessment.factors.contains(factor)
        let danger = flagged && assessment.risk == .danger
        return VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(Typography.text(14, .semibold))
                .foregroundStyle(danger ? Palette.chiliDeep : flagged ? Palette.honeyInk : Palette.jadeDeep)
            Text(value)
                .font(Typography.text(18, .bold))
                .foregroundStyle(Palette.ink)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(danger ? Palette.chiliSoft : flagged ? Palette.honey : Palette.jadeSoft, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// Full outdoor brief: day bar, best window, what to bring, heat plan, fluids.
struct OutdoorView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ZStack {
            ScreenBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let outlook = model.outlook {
                        if outlook.stayIn || outlook.severeAir {
                            StayInBanner(outlook: outlook)
                        } else {
                            Text(OutdoorCopy.headline(outlook, noLocation: false))
                                .font(Typography.display(36))
                                .foregroundStyle(Palette.ink)
                        }
                        DayBar(outlook: outlook)
                        if let now = model.currentConditions { ConditionChips(assessment: now) }
                        advice(outlook)
                        if outlook.heatDanger != nil { heatPlan(outlook) }
                        if outlook.stayIn { IndoorIdeas() }
                    } else {
                        Text(model.data.homeCoordinate == nil
                             ? "Thêm khu vực nhà bạn để xem không khí và thời tiết."
                             : (model.forecastError ?? "Đang tải thời tiết…"))
                            .font(Typography.text(19))
                            .foregroundStyle(Palette.body)
                    }
                    if let updated = model.forecastUpdatedAt {
                        Text("Nguồn: Open-Meteo và AirNow (nếu có) · cập nhật \(Format.time(updated))")
                            .font(Typography.text(14))
                            .foregroundStyle(Palette.muted)
                    }
                }
                .padding(20)
            }
            .refreshable { await model.refreshForecast() }
        }
        .navigationTitle("Bên ngoài hôm nay")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func advice(_ outlook: DayOutlook) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("KHI RA NGOÀI").eyebrow(Palette.bark)
            Text(OutdoorCopy.advice(outlook, walkingMinutes: model.walkingLimitMinutes))
                .font(Typography.text(18))
                .foregroundStyle(Palette.ink)
        }
        .card(padding: 18, radius: 24, background: Palette.chai)
    }

    private func heatPlan(_ outlook: DayOutlook) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if let heat = outlook.heatDanger {
                Text("Nóng nguy hiểm \(Format.window(heat))")
                    .font(Typography.text(19, .bold))
                    .foregroundStyle(Palette.chiliDeep)
            }
            Text("Lúc này nên bật điều hoà. Để 27–28°C và bật thêm quạt cho đỡ tốn điện. Ở phòng mát nhất, lau người bằng khăn mát.")
                .font(Typography.text(17))
                .foregroundStyle(Palette.ink)
            Text(OutdoorCopy.fluids(limitMl: model.data.fluidLimitMl))
                .font(Typography.text(17))
                .foregroundStyle(Palette.body)
        }
        .card(padding: 16, radius: 24, background: Palette.chiliSoft)
    }
}

struct StayInBanner: View {
    let outlook: DayOutlook

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(outlook.worstFactors.contains(.air) ? "KHÔNG KHÍ XẤU" : "NÓNG NGUY HIỂM")
                .eyebrow(Palette.chiliSoft)
            Text("Hôm nay ở nhà nhé")
                .font(Typography.display(38))
                .foregroundStyle(.white)
            Text(outlook.worstFactors.contains(.air) ? "Đóng cửa sổ và cửa ra vào." : "Ở phòng mát nhất trong nhà.")
                .font(Typography.text(19))
                .foregroundStyle(Palette.chiliSoft)
            if outlook.worstFactors.contains(.air) {
                Text("Nếu phải ra ngoài: đeo khẩu trang N95 hoặc KF94.")
                    .font(Typography.text(17, .semibold))
                    .foregroundStyle(.white)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.chiliDeep, in: RoundedRectangle(cornerRadius: 32, style: .continuous))
    }
}

/// A horizontal bar of her waking hours, with the best window ringed in jade.
struct DayBar: View {
    let outlook: DayOutlook

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("HÔM NAY").eyebrow()
            HStack(spacing: 3) {
                ForEach(outlook.hours, id: \.time) { hour in
                    let isBest = outlook.bestWindow?.contains(hour.time) == true && hour.time != outlook.bestWindow?.end
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(color(for: hour.risk, best: isBest))
                        .frame(height: isBest ? 48 : 40)
                }
            }
            .frame(height: 48)
            HStack {
                if let first = outlook.hours.first { Text(Format.time(first.time)) }
                Spacer()
                if let last = outlook.hours.last { Text(Format.time(last.time.addingTimeInterval(3600))) }
            }
            .font(Typography.text(14))
            .foregroundStyle(Palette.muted)
            if let best = outlook.bestWindow {
                HStack(spacing: 10) {
                    StarAnise().fill(Palette.jade).frame(width: 24, height: 24)
                    Text("Tốt nhất: \(Format.window(best))")
                        .font(Typography.text(18, .bold))
                        .foregroundStyle(Palette.jadeDeep)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Palette.jadeSoft, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
        .card()
        .accessibilityElement(children: .combine)
    }

    private func color(for risk: Risk, best: Bool) -> Color {
        if best { return Palette.jade }
        switch risk {
        case .good: return Palette.track
        case .caution: return Palette.honey
        case .danger: return Palette.chili
        }
    }
}

struct IndoorIdeas: View {
    private struct Idea: Hashable {
        var icon: String
        var title: String
        var minutes: String
    }

    private let ideas = [
        Idea(icon: "figure.flexibility", title: "Giãn cơ nhẹ", minutes: "10 phút"),
        Idea(icon: "frying.pan", title: "Nấu một món ít muối", minutes: "20 phút"),
        Idea(icon: "wind", title: "Tập thở chậm", minutes: "5 phút")
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Ở NHÀ HÔM NAY").eyebrow()
            ForEach(ideas, id: \.self) { idea in
                HStack(spacing: 12) {
                    Image(systemName: idea.icon)
                        .foregroundStyle(Palette.bark)
                        .frame(width: 48, height: 48)
                        .background(Palette.chai, in: Circle())
                    Text(idea.title).font(Typography.text(19, .bold)).foregroundStyle(Palette.ink)
                    Spacer()
                    Text(idea.minutes).font(Typography.text(16, .semibold)).foregroundStyle(Palette.muted)
                }
                .card(padding: 10, radius: 24)
            }
        }
    }
}

enum OutdoorCopy {
    static func headline(_ outlook: DayOutlook?, noLocation: Bool) -> String {
        if noLocation { return "Thêm khu vực nhà" }
        guard let outlook else { return "Đang tải…" }
        guard let best = outlook.bestWindow else { return "Nên ở nhà" }
        if best.start <= Date() { return "Bây giờ" }
        return "Sau \(Format.time(best.start))"
    }

    static func advice(_ outlook: DayOutlook, walkingMinutes: Int) -> String {
        var parts: [String] = []
        if walkingMinutes == 0 {
            parts.append("Hôm nay không nên đi bộ ngoài trời.")
        } else {
            parts.append("Đi bộ tối đa \(walkingMinutes) phút, chọn đường có bóng râm.")
        }
        let factors = outlook.hours.filter { outlook.bestWindow?.contains($0.time) == true }
            .reduce(into: Set<RiskFactor>()) { $0.formUnion($1.factors) }
        if factors.contains(.sun) || outlook.worstFactors.contains(.sun) {
            parts.append("Đội mũ, mặc áo dài tay, bôi kem chống nắng.")
        }
        if factors.contains(.air) {
            parts.append("Tránh đường đông xe.")
        }
        return parts.joined(separator: " ")
    }

    /// Never tells her to drink more than a fluid limit she entered.
    static func fluids(limitMl: Int?) -> String {
        if let limitMl {
            return "Giới hạn nước của bạn: \(limitMl) ml mỗi ngày. Làm mát bằng quạt và khăn ướt thay vì uống thêm."
        }
        return "Nhớ uống nước từng ngụm nhỏ. Hỏi bác sĩ về lượng nước nên uống khi trời nóng."
    }
}
