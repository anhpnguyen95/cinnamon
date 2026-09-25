import CinnamonCore
import SwiftUI
import UIKit

/// The reminder screen: big "Đã uống", gentle alternatives, no blame.
struct DoseView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let dose: PlannedDose

    var body: some View {
        ZStack {
            ScreenBackground()
            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(spacing: 12) {
                        ForEach(dose.items, id: \.medicationID) { item in
                            pillRow(item)
                        }
                    }
                    .padding(20)
                }
                actions
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Spiral()
                    .stroke(Palette.caramel, style: StrokeStyle(lineWidth: 2.4, lineCap: .round))
                    .frame(width: 20, height: 20)
                Text(model.status(of: dose) == .missed ? "CHƯA UỐNG" : "ĐẾN GIỜ UỐNG THUỐC")
                    .eyebrow(Palette.caramel)
            }
            Text(dose.anchor.title)
                .font(Typography.display(44))
                .foregroundStyle(Palette.cream)
            Text(dose.items.count > 1 ? "\(DoseQuantity(halves: max(1, dose.totalHalves)).text) viên, uống cùng lúc" : "\(dose.items.first?.quantity.text ?? "1") viên")
                .font(Typography.text(19))
                .foregroundStyle(Palette.chai)
        }
        .padding(.horizontal, 24)
        .padding(.top, 32)
        .padding(.bottom, 30)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(alignment: .bottomTrailing) {
            SpiralWatermark().offset(x: 90, y: 100)
        }
        .background(Palette.bark)
        .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: 36, bottomTrailingRadius: 36, style: .continuous))
    }

    private func pillRow(_ item: DoseItem) -> some View {
        let medication = model.medication(item.medicationID)
        return HStack(spacing: 14) {
            MedicationPhoto(url: model.photoURL(medication?.photoFilename), size: 64)
            Text(medication?.displayName ?? "Thuốc")
                .font(Typography.text(21, .bold))
                .foregroundStyle(Palette.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("×\(item.quantity.text)")
                .font(Typography.text(19, .bold))
                .foregroundStyle(Palette.bark)
                .frame(minWidth: 48, minHeight: 40)
                .background(Palette.chai, in: Capsule())
        }
        .card(padding: 12, radius: 24)
    }

    private var actions: some View {
        VStack(spacing: 10) {
            Button {
                model.markTaken(dose)
                dismiss()
            } label: {
                Label("Đã uống", systemImage: "checkmark")
                    .font(Typography.text(24, .bold))
            }
            .buttonStyle(PillButtonStyle(background: Palette.jade, height: 76))

            HStack(spacing: 10) {
                Button("Nhắc lại 15 phút") {
                    model.snooze(dose)
                    dismiss()
                }
                .buttonStyle(SoftButtonStyle())
                if case .beforeMeal = dose.anchor {
                    Button("Tôi chưa ăn") {
                        model.snooze(dose, minutes: 30)
                        dismiss()
                    }
                    .buttonStyle(SoftButtonStyle())
                }
            }

            Button("Bỏ qua liều này") {
                model.skip(dose)
                dismiss()
            }
            .font(Typography.text(17, .semibold))
            .foregroundStyle(Palette.muted)
            .underline()
            .frame(minHeight: 48)
        }
    }
}

struct MedicationPhoto: View {
    let url: URL?
    var size: CGFloat

    var body: some View {
        Group {
            if let url, let image = UIImage(contentsOfFile: url.path) {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Image(systemName: "pills")
                    .font(.system(size: size * 0.4))
                    .foregroundStyle(Palette.cinnamon)
            }
        }
        .frame(width: size, height: size)
        .background(Palette.chai)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.3, style: .continuous))
        .accessibilityHidden(true)
    }
}
