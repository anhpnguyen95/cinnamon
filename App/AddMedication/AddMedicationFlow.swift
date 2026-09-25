import AVFoundation
import CinnamonCore
import SwiftUI
import UIKit

/// Adding a medicine is a short conversation: photo → when → how many → read-back.
struct AddMedicationFlow: View {
    enum Step: Int, CaseIterable { case photo, when, howMany, confirm }

    enum TimingKind: String, CaseIterable, Identifiable {
        case onWaking, beforeMeal, afterMeal, bedtime, interval, asNeeded
        var id: String { rawValue }
        var label: String {
            switch self {
            case .onWaking: return "Khi thức dậy"
            case .beforeMeal: return "Trước bữa ăn"
            case .afterMeal: return "Sau bữa ăn"
            case .bedtime: return "Trước khi ngủ"
            case .interval: return "Cách mấy tiếng"
            case .asNeeded: return "Khi cần"
            }
        }
    }

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    private let existing: Medication?
    @State private var step: Step = .photo
    @State private var name = ""
    @State private var strength = ""
    @State private var photo: UIImage?
    @State private var photoFilename: String?
    @State private var isReading = false
    @State private var showCamera = false
    @State private var kind: TimingKind?
    @State private var meals: Set<MealSlot> = []
    @State private var intervalHours = 12
    @State private var intervalStart = TimeOfDay(hour: 8)
    @State private var quantity = DoseQuantity.pills(1)
    @State private var notifyBackup = true
    @State private var remainingPills = ""
    @State private var speaker = AVSpeechSynthesizer()

    init(existing: Medication? = nil) {
        self.existing = existing
        guard let existing else { return }
        _name = State(initialValue: existing.name)
        _strength = State(initialValue: existing.strength ?? "")
        _photoFilename = State(initialValue: existing.photoFilename)
        _quantity = State(initialValue: existing.quantity)
        _notifyBackup = State(initialValue: existing.notifyBackupIfMissed)
        _remainingPills = State(initialValue: existing.remainingHalves.map { "\($0 / 2)" } ?? "")
        switch existing.timing {
        case .onWaking: _kind = State(initialValue: .onWaking)
        case .beforeMeals(let m): _kind = State(initialValue: .beforeMeal); _meals = State(initialValue: Set(m))
        case .afterMeals(let m): _kind = State(initialValue: .afterMeal); _meals = State(initialValue: Set(m))
        case .atBedtime: _kind = State(initialValue: .bedtime)
        case .everyHours(let h, let start): _kind = State(initialValue: .interval); _intervalHours = State(initialValue: h); _intervalStart = State(initialValue: start)
        case .asNeeded: _kind = State(initialValue: .asNeeded)
        }
    }

    var body: some View {
        ZStack {
            ScreenBackground()
            VStack(alignment: .leading, spacing: 16) {
                progress
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        switch step {
                        case .photo: photoStep
                        case .when: whenStep
                        case .howMany: howManyStep
                        case .confirm: confirmStep
                        }
                    }
                    .padding(.bottom, 12)
                }
                footer
            }
            .padding(20)
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in
                showCamera = false
                if let image { Task { await use(image) } }
            }
            .ignoresSafeArea()
        }
    }

    // MARK: - Chrome

    private var progress: some View {
        HStack(spacing: 14) {
            Button {
                if let previous = Step(rawValue: step.rawValue - 1) { step = previous } else { dismiss() }
            } label: {
                Image(systemName: step == .photo ? "xmark" : "chevron.left")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Palette.bark)
                    .frame(width: 48, height: 48)
                    .background(Palette.chai, in: Circle())
            }
            .accessibilityLabel(step == .photo ? "Đóng" : "Quay lại")
            HStack(spacing: 6) {
                ForEach(Step.allCases, id: \.self) { s in
                    Capsule()
                        .fill(s.rawValue <= step.rawValue ? Palette.cinnamon : Palette.track)
                        .frame(height: 10)
                }
            }
            Text("\(step.rawValue + 1)/4")
                .font(Typography.text(16, .semibold))
                .foregroundStyle(Palette.muted)
        }
    }

    @ViewBuilder private var footer: some View {
        switch step {
        case .photo:
            Button("Tiếp") { step = .when }
                .buttonStyle(PillButtonStyle())
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
        case .when:
            Button("Tiếp") { step = kind == .asNeeded ? .confirm : .howMany }
                .buttonStyle(PillButtonStyle())
                .disabled(!whenIsComplete)
        case .howMany:
            Button("Tiếp") { step = .confirm }
                .buttonStyle(PillButtonStyle())
        case .confirm:
            VStack(spacing: 8) {
                Button {
                    save()
                } label: {
                    Label("Đúng rồi, lưu lại", systemImage: "checkmark")
                }
                .buttonStyle(PillButtonStyle(background: Palette.jade, height: 68))
                Button("Chưa đúng, sửa lại") { step = .when }
                    .font(Typography.text(18, .semibold))
                    .frame(minHeight: 48)
            }
        }
    }

    // MARK: - Step 1: photo

    @ViewBuilder private var photoStep: some View {
        Text("Chụp hộp thuốc hoặc vỉ thuốc")
            .font(Typography.display(34))
            .foregroundStyle(Palette.ink)
        Text("Để tên thuốc nằm rõ trong ảnh, Cinnamon sẽ tự đọc tên.")
            .font(Typography.text(18))
            .foregroundStyle(Palette.body)

        Button {
            showCamera = true
        } label: {
            ZStack {
                if let image = currentPhoto {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    VStack(spacing: 12) {
                        Image(systemName: "camera.fill").font(.system(size: 40))
                        Text("Chụp ảnh").font(Typography.text(20, .bold))
                    }
                    .foregroundStyle(Palette.caramel)
                }
                if isReading {
                    HStack(spacing: 8) {
                        ProgressView().tint(Palette.caramel)
                        Text("Đang tìm tên thuốc…").font(Typography.text(15, .semibold))
                    }
                    .foregroundStyle(Palette.cream)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Palette.ink.opacity(0.7), in: Capsule())
                    .frame(maxHeight: .infinity, alignment: .bottom)
                    .padding(.bottom, 16)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 260)
            .background(Palette.ink)
            .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
        }
        .accessibilityLabel(currentPhoto == nil ? "Chụp ảnh thuốc" : "Chụp lại ảnh thuốc")

        VStack(alignment: .leading, spacing: 8) {
            Text("TÊN THUỐC").eyebrow()
            TextField("Ví dụ: Prednisolon", text: $name)
                .font(Typography.text(20, .semibold))
                .padding(16)
                .background(Palette.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            TextField("Hàm lượng, ví dụ 5 mg (không bắt buộc)", text: $strength)
                .font(Typography.text(18))
                .padding(16)
                .background(Palette.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    private var currentPhoto: UIImage? {
        photo ?? model.photoURL(photoFilename).flatMap { UIImage(contentsOfFile: $0.path) }
    }

    @MainActor
    private func use(_ image: UIImage) async {
        photo = image
        if let jpeg = image.jpegData(compressionQuality: 0.7) {
            photoFilename = model.savePhoto(jpeg)
        }
        isReading = true
        let guess = await LabelReader.read(image)
        isReading = false
        if let found = guess.name, name.isEmpty { name = found }
        if let found = guess.strength, strength.isEmpty { strength = found }
    }

    // MARK: - Step 2: when

    @ViewBuilder private var whenStep: some View {
        Text("Uống thuốc này khi nào?")
            .font(Typography.display(34))
            .foregroundStyle(Palette.ink)
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            ForEach(TimingKind.allCases) { option in
                Button(option.label) { kind = option }
                    .buttonStyle(ChoiceButtonStyle(isSelected: kind == option, height: 64))
                    .accessibilityAddTraits(kind == option ? .isSelected : [])
            }
        }
        if kind == .beforeMeal || kind == .afterMeal {
            VStack(alignment: .leading, spacing: 12) {
                Text(kind == .beforeMeal ? "Trước bữa nào?" : "Sau bữa nào?")
                    .font(Typography.text(20, .bold))
                    .foregroundStyle(Palette.bark)
                HStack(spacing: 8) {
                    ForEach(MealSlot.allCases, id: \.self) { meal in
                        let selected = meals.contains(meal)
                        Button(meal.shortName) {
                            if selected { meals.remove(meal) } else { meals.insert(meal) }
                        }
                        .font(Typography.text(18, selected ? .bold : .semibold))
                        .foregroundStyle(selected ? Color.white : Palette.ink)
                        .frame(maxWidth: .infinity, minHeight: 56)
                        .background(selected ? Palette.cinnamon : Palette.surface, in: Capsule())
                        .accessibilityAddTraits(selected ? .isSelected : [])
                    }
                }
            }
            .card(padding: 16, background: Palette.chai)
        }
        if kind == .interval {
            VStack(alignment: .leading, spacing: 12) {
                Stepper("Cứ \(intervalHours) tiếng một lần", value: $intervalHours, in: 2...24, step: 2)
                    .font(Typography.text(19, .semibold))
                DatePicker("Liều đầu tiên", selection: intervalStartDate, displayedComponents: .hourAndMinute)
                    .font(Typography.text(19, .semibold))
            }
            .card(padding: 16, background: Palette.chai)
        }
    }

    private var whenIsComplete: Bool {
        switch kind {
        case .beforeMeal?, .afterMeal?: return !meals.isEmpty
        case nil: return false
        default: return true
        }
    }

    private var intervalStartDate: Binding<Date> {
        let day = model.calendar.startOfDay(for: Date())
        return Binding(
            get: { intervalStart.date(on: day, calendar: model.calendar) },
            set: { intervalStart = TimeOfDay.of($0, relativeTo: day, calendar: model.calendar) }
        )
    }

    private var timing: DoseTiming {
        let ordered = MealSlot.allCases.filter { meals.contains($0) }
        switch kind ?? .asNeeded {
        case .onWaking: return .onWaking
        case .beforeMeal: return .beforeMeals(ordered)
        case .afterMeal: return .afterMeals(ordered)
        case .bedtime: return .atBedtime
        case .interval: return .everyHours(intervalHours, startingAt: intervalStart)
        case .asNeeded: return .asNeeded
        }
    }

    // MARK: - Step 3: how many

    @ViewBuilder private var howManyStep: some View {
        Text("Mỗi lần uống mấy viên?")
            .font(Typography.display(34))
            .foregroundStyle(Palette.ink)
        HStack {
            Button { quantity = quantity.decremented() } label: {
                Image(systemName: "minus").font(.system(size: 28, weight: .bold))
                    .frame(width: 68, height: 68)
                    .background(Palette.cream.opacity(0.14), in: Circle())
            }
            .accessibilityLabel("Bớt nửa viên")
            Spacer()
            VStack(spacing: 0) {
                Text(quantity.text).font(Typography.display(96))
                Text("viên").font(Typography.text(20)).foregroundStyle(Palette.chai)
            }
            .accessibilityElement(children: .combine)
            Spacer()
            Button { quantity = quantity.incremented() } label: {
                Image(systemName: "plus").font(.system(size: 28, weight: .bold))
                    .foregroundStyle(Palette.ink)
                    .frame(width: 68, height: 68)
                    .background(Palette.caramel, in: Circle())
            }
            .accessibilityLabel("Thêm nửa viên")
        }
        .foregroundStyle(Palette.cream)
        .heroCard()
        HStack(spacing: 10) {
            ForEach([1, 2, 4, 6], id: \.self) { halves in
                let option = DoseQuantity(halves: halves)
                Button(option.text) { quantity = option }
                    .buttonStyle(ChoiceButtonStyle(isSelected: quantity == option, height: 60))
            }
        }
    }

    // MARK: - Step 4: read-back

    @ViewBuilder private var confirmStep: some View {
        VStack(spacing: 16) {
            ZStack(alignment: .bottomTrailing) {
                MedicationPhoto(url: model.photoURL(photoFilename), size: 96)
                StarAnise().fill(Palette.caramel).frame(width: 38, height: 38).offset(x: 10, y: 10)
            }
            Text("Kiểm tra lại nhé")
                .font(Typography.display(30))
                .foregroundStyle(Palette.ink)
            Text(sentence)
                .font(Typography.text(22))
                .foregroundStyle(Palette.ink)
                .multilineTextAlignment(.center)
            Button {
                readAloud()
            } label: {
                Label("Đọc to cho tôi nghe", systemImage: "speaker.wave.2.fill")
                    .font(Typography.text(17, .semibold))
                    .foregroundStyle(Palette.bark)
                    .padding(.horizontal, 18)
                    .frame(minHeight: 48)
                    .background(Palette.chai, in: Capsule())
            }
        }
        .frame(maxWidth: .infinity)
        .card(padding: 22, radius: 32)

        VStack(alignment: .leading, spacing: 8) {
            Text("KHÔNG BẮT BUỘC").eyebrow()
            Toggle("Báo người thân nếu quên liều", isOn: $notifyBackup)
                .font(Typography.text(18))
                .tint(Palette.cinnamon)
                .card(padding: 16, radius: 20)
            HStack {
                Text("Số viên còn lại").font(Typography.text(18))
                Spacer()
                TextField("30", text: $remainingPills)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.center)
                    .font(Typography.text(18, .semibold))
                    .frame(width: 80, height: 44)
                    .background(Palette.chai, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .card(padding: 16, radius: 20)
        }
    }

    private var displayName: String {
        let trimmed = strength.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? name : "\(name) \(trimmed)"
    }

    private var sentence: String {
        if case .asNeeded = timing { return "Uống \(displayName) khi cần." }
        return "Uống \(quantity.text) viên \(displayName) \(timing.summary)."
    }

    private func readAloud() {
        let utterance = AVSpeechUtterance(string: sentence)
        utterance.voice = AVSpeechSynthesisVoice(language: "vi-VN")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.85
        speaker.speak(utterance)
    }

    private func save() {
        var medication = existing ?? Medication(name: name, timing: timing)
        medication.name = name.trimmingCharacters(in: .whitespaces)
        let trimmedStrength = strength.trimmingCharacters(in: .whitespaces)
        medication.strength = trimmedStrength.isEmpty ? nil : trimmedStrength
        medication.photoFilename = photoFilename
        medication.quantity = quantity
        medication.timing = timing
        medication.notifyBackupIfMissed = notifyBackup
        medication.remainingHalves = Int(remainingPills).map { $0 * 2 }
        model.save(medication)
        dismiss()
    }
}
