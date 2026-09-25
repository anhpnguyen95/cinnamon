import CinnamonCore
import SwiftUI

/// Home shows only three things: the next dose, today's outdoors, and "Ask Cinnamon".
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @Binding var presentedDoseID: String?
    @Binding var showCheckIn: Bool
    @State private var showAddMedication = false

    var body: some View {
        ZStack {
            ScreenBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    Text(greeting)
                        .font(Typography.display(38))
                        .foregroundStyle(Palette.ink)
                        .padding(.top, 4)
                    if model.shouldSuggestDoctor { doctorNote }
                    doseCard
                    NavigationLink {
                        OutdoorView()
                    } label: {
                        OutdoorSummaryCard()
                    }
                    .buttonStyle(.plain)
                    refillNotes
                }
                .padding(20)
                .padding(.bottom, 100)
            }
            VStack {
                Spacer()
                askButton
            }
            .padding(20)
        }
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $showAddMedication) {
            AddMedicationFlow()
        }
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: model.now)
        switch hour {
        case 4..<11: return "Chào buổi sáng!"
        case 11..<14: return "Chào buổi trưa!"
        case 14..<18: return "Chào buổi chiều!"
        default: return "Chào buổi tối!"
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            SpiralBadge()
            Text("Cinnamon")
                .font(Typography.display(22))
                .foregroundStyle(Palette.bark)
            Spacer()
            NavigationLink {
                MedicationListView()
            } label: {
                Text("Thuốc của tôi")
                    .font(Typography.text(16, .semibold))
                    .foregroundStyle(Palette.bark)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 44)
                    .background(Palette.chai, in: Capsule())
            }
        }
    }

    // MARK: - Dose card

    @ViewBuilder private var doseCard: some View {
        if model.data.medications.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text("CHƯA CÓ THUỐC").eyebrow(Palette.caramel)
                Text("Thêm thuốc đầu tiên")
                    .font(Typography.display(30))
                    .foregroundStyle(Palette.cream)
                Text("Chụp ảnh hộp thuốc, rồi trả lời hai câu hỏi.")
                    .font(Typography.text(18))
                    .foregroundStyle(Palette.chai)
                Button("Thêm thuốc") { showAddMedication = true }
                    .buttonStyle(PillButtonStyle(background: Palette.caramel, foreground: Palette.ink, height: 60))
            }
            .heroCard()
        } else if let dose = model.nextDose {
            DoseHeroCard(dose: dose, presentedDoseID: $presentedDoseID)
        } else {
            HStack(spacing: 14) {
                StarAnise().fill(Palette.jade).frame(width: 40, height: 40)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Xong thuốc hôm nay")
                        .font(Typography.display(26))
                        .foregroundStyle(Palette.ink)
                    Text("Tốt lắm. Hẹn gặp lại ngày mai.")
                        .font(Typography.text(17))
                        .foregroundStyle(Palette.muted)
                }
            }
            .card(background: Palette.jadeSoft)
        }
    }

    private var doctorNote: some View {
        Text("Tuần này bạn hay mệt hoặc ngủ không ngon. Nên kể với bác sĩ trong lần khám tới nhé.")
            .font(Typography.text(17))
            .foregroundStyle(Palette.honeyInk)
            .card(padding: 16, radius: 22, background: Palette.honey)
    }

    @ViewBuilder private var refillNotes: some View {
        ForEach(model.data.medications.filter(\.needsRefill)) { medication in
            Text("\(medication.displayName) còn khoảng \(medication.daysOfSupplyLeft ?? 0) ngày. Nhớ mua thêm nhé.")
                .font(Typography.text(17))
                .foregroundStyle(Palette.body)
                .card(padding: 16, radius: 22, background: Palette.chai)
        }
    }

    private var askButton: some View {
        HStack(spacing: 14) {
            Spiral()
                .stroke(Palette.caramel, style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
                .frame(width: 28, height: 28)
            Text("Hỏi Cinnamon")
                .font(Typography.text(21, .bold))
            Spacer()
            Text("Sắp có")
                .font(Typography.text(15, .semibold))
                .foregroundStyle(Palette.ink)
                .padding(.horizontal, 12)
                .frame(height: 44)
                .background(Palette.caramel, in: Capsule())
        }
        .foregroundStyle(Palette.cream)
        .padding(.leading, 22)
        .padding(.trailing, 10)
        .frame(height: 72)
        .background(Palette.ink, in: Capsule())
        .shadow(color: Palette.ink.opacity(0.25), radius: 12, y: 10)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Hỏi Cinnamon, sắp có")
    }
}

/// The dark bark card with the next dose and the meal buttons.
struct DoseHeroCard: View {
    @Environment(AppModel.self) private var model
    let dose: PlannedDose
    @Binding var presentedDoseID: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(eyebrow).eyebrow(Palette.caramel)
            Text(dose.anchor.title)
                .font(Typography.display(32))
                .foregroundStyle(Palette.cream)
            Text(itemsText)
                .font(Typography.text(18))
                .foregroundStyle(Palette.chai)
            actions
        }
        .heroCard()
    }

    private var eyebrow: String {
        switch model.status(of: dose) {
        case .due: return "ĐẾN GIỜ UỐNG THUỐC"
        case .missed: return "CHƯA UỐNG"
        case .snoozed(let until): return "NHẮC LẠI LÚC \(Format.time(until))"
        default: return "THUỐC TIẾP THEO · \(Format.time(dose.dueAt))"
        }
    }

    private var itemsText: String {
        let pills = DoseQuantity(halves: max(1, dose.totalHalves)).text
        let names = dose.items.compactMap { model.medication($0.medicationID)?.displayName }.joined(separator: ", ")
        return "\(pills) viên · \(names)"
    }

    @ViewBuilder private var actions: some View {
        let status = model.status(of: dose)
        switch dose.anchor {
        case .beforeMeal(let meal) where status == .upcoming:
            Button("Tôi sắp ăn \(meal.name)") {
                presentedDoseID = model.startMeal(meal)?.id
            }
            .buttonStyle(PillButtonStyle(background: Palette.caramel, foreground: Palette.ink, height: 60))
        case .afterMeal(let meal) where status == .upcoming:
            if model.events(for: model.activeDayKey).mealStarted(meal) != nil {
                Button("Tôi ăn xong rồi") {
                    presentedDoseID = model.finishMeal(meal)?.id
                }
                .buttonStyle(PillButtonStyle(background: Palette.caramel, foreground: Palette.ink, height: 60))
            } else {
                Button("Tôi đang ăn \(meal.name)") {
                    model.startMeal(meal)
                }
                .buttonStyle(PillButtonStyle(background: Palette.caramel, foreground: Palette.ink, height: 60))
            }
        default:
            Button("Xem và uống") { presentedDoseID = dose.id }
                .buttonStyle(PillButtonStyle(background: Palette.caramel, foreground: Palette.ink, height: 60))
        }
    }
}

extension View {
    func heroCard() -> some View {
        self
            .padding(22)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(alignment: .topTrailing) {
                SpiralWatermark().offset(x: 80, y: -70)
            }
            .background(Palette.bark)
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .shadow(color: Palette.bark.opacity(0.28), radius: 14, y: 12)
    }
}
