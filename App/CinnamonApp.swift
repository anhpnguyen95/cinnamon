import CinnamonCore
import Combine
import SwiftUI

@main
struct CinnamonApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .environment(\.locale, Locale(identifier: "vi_VN"))
                .tint(Palette.cinnamon)
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @State private var presentedDoseID: String?
    @State private var showCheckIn = false

    private let minuteTimer = Timer.publish(every: 60, on: .main, in: .common).autoconnect()

    var body: some View {
        Group {
            if model.data.isOnboarded {
                NavigationStack {
                    HomeView(presentedDoseID: $presentedDoseID, showCheckIn: $showCheckIn)
                }
            } else {
                OnboardingView()
            }
        }
        .sheet(item: presentedDose) { dose in
            DoseView(dose: dose)
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showCheckIn) {
            CheckInView()
        }
        .onReceive(minuteTimer) { model.now = $0 }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            model.now = Date()
            model.rescheduleNotifications()
            if model.needsCheckIn { showCheckIn = true }
            Task { await model.refreshForecast() }
        }
        .task {
            model.notifications.onOpen = { id in presentedDoseID = id }
            model.notifications.onAction = { action, id in handle(action: action, doseID: id) }
            model.rescheduleNotifications()
            if model.needsCheckIn { showCheckIn = true }
            await model.refreshForecast()
        }
    }

    private var presentedDose: Binding<PlannedDose?> {
        Binding(
            get: { presentedDoseID.flatMap { model.dose(withID: $0) } },
            set: { presentedDoseID = $0?.id }
        )
    }

    private func handle(action: String, doseID: String) {
        guard let dose = model.dose(withID: doseID) else { return }
        switch action {
        case NotificationScheduler.takenAction:
            model.markTaken(dose)
        case NotificationScheduler.snoozeAction:
            model.snooze(dose)
        case NotificationScheduler.notEatingAction:
            model.snooze(dose, minutes: 30)
        default:
            presentedDoseID = doseID
        }
    }
}
