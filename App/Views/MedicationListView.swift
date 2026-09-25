import CinnamonCore
import SwiftUI

struct MedicationListView: View {
    @Environment(AppModel.self) private var model
    @State private var editing: Medication?
    @State private var adding = false

    var body: some View {
        ZStack {
            ScreenBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(model.data.medications) { medication in
                        Button {
                            editing = medication
                        } label: {
                            HStack(spacing: 14) {
                                MedicationPhoto(url: model.photoURL(medication.photoFilename), size: 56)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(medication.displayName)
                                        .font(Typography.text(20, .bold))
                                        .foregroundStyle(Palette.ink)
                                    Text("\(medication.quantity.text) viên, \(medication.timing.summary)")
                                        .font(Typography.text(16))
                                        .foregroundStyle(Palette.muted)
                                        .multilineTextAlignment(.leading)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").foregroundStyle(Palette.muted)
                            }
                            .card(padding: 12, radius: 24)
                        }
                        .buttonStyle(.plain)
                    }
                    Button {
                        adding = true
                    } label: {
                        Label("Thêm thuốc", systemImage: "plus")
                    }
                    .buttonStyle(PillButtonStyle())
                    .padding(.top, 8)
                }
                .padding(20)
            }
        }
        .navigationTitle("Thuốc của tôi")
        .sheet(item: $editing) { medication in
            AddMedicationFlow(existing: medication)
        }
        .sheet(isPresented: $adding) {
            AddMedicationFlow()
        }
    }
}
