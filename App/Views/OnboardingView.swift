import CinnamonCore
import SwiftUI

/// First run: her usual day, her home area, and notification permission.
struct OnboardingView: View {
    @Environment(AppModel.self) private var model
    @State private var rhythm = DailyRhythm.standard
    @State private var address = ""
    @State private var isSaving = false

    var body: some View {
        ZStack {
            ScreenBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    SpiralBadge(size: 64)
                    Text("Chào mừng đến với Cinnamon")
                        .font(Typography.display(36))
                        .foregroundStyle(Palette.ink)
                    Text("Cho Cinnamon biết một ngày bình thường của bạn, để nhắc thuốc đúng lúc bạn ăn và ngủ.")
                        .font(Typography.text(19))
                        .foregroundStyle(Palette.body)

                    VStack(spacing: 0) {
                        timeRow("Thức dậy", time: $rhythm.wake)
                        Divider()
                        timeRow("Bữa sáng", time: mealBinding(.breakfast))
                        Divider()
                        timeRow("Bữa trưa", time: mealBinding(.lunch))
                        Divider()
                        timeRow("Bữa tối", time: mealBinding(.dinner))
                        Divider()
                        timeRow("Đi ngủ", time: $rhythm.bed)
                    }
                    .card(padding: 8)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("KHU VỰC NHÀ BẠN").eyebrow()
                        TextField("Ví dụ: phường Láng Hạ, Đống Đa, Hà Nội", text: $address, axis: .vertical)
                            .font(Typography.text(19))
                            .padding(16)
                            .background(Palette.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        Text("Địa chỉ chỉ lưu trên điện thoại. Khi xem thời tiết, Cinnamon chỉ gửi khu vực gần đúng.")
                            .font(Typography.text(15))
                            .foregroundStyle(Palette.muted)
                    }

                    Button {
                        Task { await finish() }
                    } label: {
                        if isSaving { ProgressView().tint(.white) } else { Text("Bắt đầu") }
                    }
                    .buttonStyle(PillButtonStyle())
                    .disabled(isSaving)
                }
                .padding(20)
            }
        }
    }

    private func timeRow(_ title: String, time: Binding<TimeOfDay>) -> some View {
        DatePicker(selection: dateBinding(time), displayedComponents: .hourAndMinute) {
            Text(title).font(Typography.text(19, .semibold)).foregroundStyle(Palette.ink)
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 60)
    }

    private func mealBinding(_ meal: MealSlot) -> Binding<TimeOfDay> {
        Binding(get: { rhythm.time(of: meal) }, set: { rhythm.set($0, for: meal) })
    }

    /// DatePicker works in dates; the rhythm keeps after-midnight bedtimes as 24:00+.
    private func dateBinding(_ time: Binding<TimeOfDay>) -> Binding<Date> {
        let calendar = model.calendar
        let day = calendar.startOfDay(for: Date())
        return Binding(
            get: { TimeOfDay(minutes: time.wrappedValue.minutes % (24 * 60)).date(on: day, calendar: calendar) },
            set: { time.wrappedValue = TimeOfDay.of($0, relativeTo: day, calendar: calendar) }
        )
    }

    private func finish() async {
        isSaving = true
        var final = rhythm
        final.bed = final.normalized(final.bed)
        if final.bed < final.dinner { final.bed = final.bed.adding(minutes: 24 * 60) }
        let coordinate = await HomeLocator.coordinate(for: address)
        _ = await model.notifications.requestPermission()
        model.completeOnboarding(rhythm: final, address: address, coordinate: coordinate)
        isSaving = false
        await model.refreshForecast()
    }
}
