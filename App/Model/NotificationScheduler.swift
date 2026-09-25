import CinnamonCore
import Foundation
import UserNotifications

/// Schedules medication reminders as local notifications, so they fire with no network.
/// Reminders are Time Sensitive so Focus modes don't hide them.
final class NotificationScheduler: NSObject, UNUserNotificationCenterDelegate {
    static let doseCategory = "DOSE"
    static let takenAction = "TAKEN"
    static let snoozeAction = "SNOOZE"
    static let notEatingAction = "NOT_EATING"
    static let doseIDKey = "doseID"

    private let center = UNUserNotificationCenter.current()

    /// Called on the main actor when she answers from a notification.
    var onAction: (@MainActor (_ action: String, _ doseID: String) -> Void)?
    /// Called when she taps a notification to open the app.
    var onOpen: (@MainActor (_ doseID: String) -> Void)?

    override init() {
        super.init()
        center.delegate = self
        registerCategories()
    }

    func requestPermission() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    private func registerCategories() {
        let taken = UNNotificationAction(identifier: Self.takenAction, title: "Đã uống", options: [])
        let snooze = UNNotificationAction(identifier: Self.snoozeAction, title: "Nhắc lại sau 15 phút", options: [])
        let notEating = UNNotificationAction(identifier: Self.notEatingAction, title: "Tôi chưa ăn", options: [])
        let category = UNNotificationCategory(identifier: Self.doseCategory, actions: [taken, snooze, notEating], intentIdentifiers: [])
        center.setNotificationCategories([category])
    }

    /// Replaces all pending reminders: first nudge, gentle repeats, then Que's own missed-dose alert.
    func schedule(doses: [PlannedDose], log: DoseLog, settings: ReminderSettings, medicationName: (UUID) -> String) {
        center.removeAllPendingNotificationRequests()
        let now = Date()
        var requests: [UNNotificationRequest?] = []

        for dose in doses {
            let due = log.effectiveDueAt(dose)
            let names = dose.items.map { "\(medicationName($0.medicationID)) ×\($0.quantity.text)" }.joined(separator: ", ")
            let pills = DoseQuantity(halves: max(1, dose.totalHalves)).text

            let first = content(title: "Đến giờ uống thuốc", body: "\(dose.anchor.title) · \(pills) viên\n\(names)", doseID: dose.id)
            requests.append(request(id: "\(dose.id)#due", content: first, at: due, now: now))

            for offset in settings.renudgeOffsets {
                let repeatContent = content(title: "Nhắc lại: \(dose.anchor.title.lowercased())", body: names, doseID: dose.id)
                requests.append(request(id: "\(dose.id)#re\(offset)", content: repeatContent, at: due.addingTimeInterval(TimeInterval(offset * 60)), now: now))
            }

            let missedAt = dose.missedAt.addingTimeInterval(due.timeIntervalSince(dose.dueAt))
            let missed = content(
                title: "Chưa thấy xác nhận uống thuốc",
                body: "Thuốc \(dose.anchor.title.lowercased()) chưa được đánh dấu là đã uống. Nếu đã uống, bấm \"Đã uống\".",
                doseID: dose.id
            )
            requests.append(request(id: "\(dose.id)#missed", content: missed, at: missedAt, now: now))
        }

        // iOS keeps at most 64 pending notifications; the soonest matter most.
        for request in requests.compactMap({ $0 }).prefix(64) {
            center.add(request)
        }
    }

    private func content(title: String, body: String, doseID: String) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.categoryIdentifier = Self.doseCategory
        content.interruptionLevel = .timeSensitive
        content.userInfo = [Self.doseIDKey: doseID]
        return content
    }

    private func request(id: String, content: UNMutableNotificationContent, at date: Date, now: Date) -> UNNotificationRequest? {
        guard date > now else { return nil }
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, date.timeIntervalSince(now)), repeats: false)
        return UNNotificationRequest(identifier: id, content: content, trigger: trigger)
    }

    // MARK: - UNUserNotificationCenterDelegate

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let doseID = response.notification.request.content.userInfo[Self.doseIDKey] as? String else { return }
        let action = response.actionIdentifier
        await MainActor.run {
            if action == UNNotificationDefaultActionIdentifier {
                onOpen?(doseID)
            } else {
                onAction?(action, doseID)
            }
        }
    }
}
