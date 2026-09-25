import CinnamonCore
import SwiftUI

/// Morning check-in: two taps, skippable, asked once a day.
struct CheckInView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var sleep: SleepQuality?
    @State private var energy: EnergyLevel?

    var body: some View {
        ZStack {
            ScreenBackground()
            VStack(alignment: .leading, spacing: 22) {
                HStack {
                    HStack(spacing: 10) {
                        SpiralBadge(size: 32)
                        Text("Hỏi thăm buổi sáng")
                            .font(Typography.text(16, .semibold))
                            .foregroundStyle(Palette.bark)
                    }
                    .padding(.vertical, 6)
                    .padding(.leading, 6)
                    .padding(.trailing, 14)
                    .background(Palette.chai, in: Capsule())
                    Spacer()
                    Button("Bỏ qua") { dismiss() }
                        .font(Typography.text(18, .semibold))
                        .frame(minHeight: 44)
                }

                Text("Đêm qua ngủ thế nào?")
                    .font(Typography.display(34))
                    .foregroundStyle(Palette.ink)
                VStack(spacing: 10) {
                    ForEach(SleepQuality.allCases, id: \.self) { option in
                        Button {
                            sleep = option
                        } label: {
                            HStack {
                                Text(option.label)
                                Spacer()
                                if sleep == option { Image(systemName: "checkmark.circle.fill").foregroundStyle(Palette.caramel) }
                            }
                            .padding(.horizontal, 12)
                        }
                        .buttonStyle(ChoiceButtonStyle(isSelected: sleep == option))
                        .accessibilityAddTraits(sleep == option ? .isSelected : [])
                    }
                }

                Text("Hôm nay thấy sức thế nào?")
                    .font(Typography.display(34))
                    .foregroundStyle(Palette.ink)
                HStack(spacing: 10) {
                    ForEach(EnergyLevel.allCases, id: \.self) { option in
                        Button {
                            energy = option
                        } label: {
                            VStack(spacing: 10) {
                                EnergyBattery(level: option, onDark: energy == option)
                                Text(option.label)
                            }
                        }
                        .buttonStyle(ChoiceButtonStyle(isSelected: energy == option, height: 108))
                        .accessibilityAddTraits(energy == option ? .isSelected : [])
                    }
                }

                Spacer(minLength: 0)

                Button("Xong") {
                    model.recordCheckIn(sleep: sleep, energy: energy)
                    dismiss()
                }
                .buttonStyle(PillButtonStyle())
                .disabled(sleep == nil && energy == nil)
            }
            .padding(20)
        }
        .interactiveDismissDisabled(false)
    }
}

/// A battery with 3, 2 or 1 bars, in jade, cinnamon or chili.
struct EnergyBattery: View {
    let level: EnergyLevel
    var onDark = false

    private var bars: Int {
        switch level {
        case .good: return 3
        case .low: return 2
        case .veryLow: return 1
        }
    }

    private var color: Color {
        if onDark { return Palette.caramel }
        switch level {
        case .good: return Palette.jade
        case .low: return Palette.cinnamon
        case .veryLow: return Palette.chili
        }
    }

    var body: some View {
        HStack(spacing: 2) {
            HStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { index in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(index < bars ? color : .clear)
                        .frame(width: 8, height: 10)
                }
            }
            .padding(4)
            .overlay(RoundedRectangle(cornerRadius: 5).stroke(color, lineWidth: 2))
            RoundedRectangle(cornerRadius: 1.5).fill(color).frame(width: 3, height: 6)
        }
        .accessibilityHidden(true)
    }
}
