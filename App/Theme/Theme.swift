import SwiftUI

/// Cinnamon palette: bark, cinnamon and caramel on cream, jade for "done", chili for warnings.
enum Palette {
    static let cream = Color(hex: 0xFAF3E8)
    static let surface = Color(hex: 0xFFFDF9)
    static let chai = Color(hex: 0xF3E4D0)
    static let track = Color(hex: 0xE5D6C3)
    static let ink = Color(hex: 0x2B1810)
    static let body = Color(hex: 0x4A3428)
    static let muted = Color(hex: 0x6E5646)
    static let bark = Color(hex: 0x5A2A14)
    static let cinnamon = Color(hex: 0xA2532A)
    static let caramel = Color(hex: 0xE8A15C)
    static let jade = Color(hex: 0x2F6B5A)
    static let jadeDeep = Color(hex: 0x1F4D40)
    static let jadeSoft = Color(hex: 0xDDEEE6)
    static let honey = Color(hex: 0xF6DDA8)
    static let honeyInk = Color(hex: 0x6B4400)
    static let chili = Color(hex: 0xB3261E)
    static let chiliDeep = Color(hex: 0x7E1F15)
    static let chiliSoft = Color(hex: 0xFBE3DE)
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

/// Bricolage Grotesque for headings, Be Vietnam Pro for text. Both scale with Dynamic Type
/// and fall back to the system font until the font files are added (see README).
enum Typography {
    static func display(_ size: CGFloat) -> Font {
        .custom("BricolageGrotesque-Bold", size: size, relativeTo: .largeTitle)
    }

    static func text(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .custom("BeVietnamPro-Regular", size: size, relativeTo: .body).weight(weight)
    }

    static func label(_ size: CGFloat = 14) -> Font {
        .custom("BeVietnamPro-Regular", size: size, relativeTo: .caption).weight(.bold)
    }
}

/// The cinnamon-roll spiral: the app's mark, drawn as an Archimedean spiral.
struct Spiral: Shape {
    var turns: Double = 2.6

    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let maxRadius = min(rect.width, rect.height) * 0.46
        let totalAngle = turns * 2 * .pi
        var path = Path()
        let steps = 160
        for i in 0...steps {
            let t = CGFloat(i) / CGFloat(steps)
            let angle = t * CGFloat(totalAngle)
            let radius = maxRadius * t
            let point = CGPoint(x: center.x + radius * CGFloat(cos(Double(angle))), y: center.y + radius * CGFloat(sin(Double(angle))))
            if i == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        return path
    }
}

/// Star anise: used only for "well done" moments.
struct StarAnise: Shape {
    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let outer = min(rect.width, rect.height) / 2
        let inner = outer * 0.4
        var path = Path()
        for i in 0..<16 {
            let angle = Double(i) * Double.pi / 8 - Double.pi / 2
            let r: CGFloat = i.isMultiple(of: 2) ? outer : inner
            let point = CGPoint(x: center.x + r * CGFloat(cos(angle)), y: center.y + r * CGFloat(sin(angle)))
            if i == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        path.closeSubpath()
        return path
    }
}

struct SpiralBadge: View {
    var size: CGFloat = 44

    var body: some View {
        Spiral()
            .stroke(Palette.caramel, style: StrokeStyle(lineWidth: size * 0.07, lineCap: .round))
            .padding(size * 0.2)
            .frame(width: size, height: size)
            .background(Palette.bark, in: Circle())
            .accessibilityHidden(true)
    }
}

/// Faint spiral watermark for dark hero cards.
struct SpiralWatermark: View {
    var body: some View {
        Spiral(turns: 3.2)
            .stroke(Palette.caramel.opacity(0.16), lineWidth: 1.5)
            .frame(width: 240, height: 240)
            .accessibilityHidden(true)
    }
}

// MARK: - Buttons

struct PillButtonStyle: ButtonStyle {
    var background: Color = Palette.cinnamon
    var foreground: Color = .white
    var height: CGFloat = 64

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Typography.text(21, .bold))
            .foregroundStyle(foreground)
            .frame(maxWidth: .infinity, minHeight: height)
            .padding(.horizontal, 16)
            .background(background, in: Capsule())
            .shadow(color: background.opacity(0.28), radius: 10, y: 8)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

struct SoftButtonStyle: ButtonStyle {
    var height: CGFloat = 58

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Typography.text(18, .semibold))
            .foregroundStyle(Palette.bark)
            .frame(maxWidth: .infinity, minHeight: height)
            .padding(.horizontal, 12)
            .background(Palette.chai, in: Capsule())
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

/// A choice tile that turns bark-dark when selected.
struct ChoiceButtonStyle: ButtonStyle {
    var isSelected: Bool
    var height: CGFloat = 62

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Typography.text(19, isSelected ? .bold : .semibold))
            .foregroundStyle(isSelected ? Palette.cream : Palette.ink)
            .frame(maxWidth: .infinity, minHeight: height)
            .padding(.horizontal, 12)
            .background(isSelected ? Palette.bark : Palette.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: Palette.ink.opacity(isSelected ? 0.2 : 0.06), radius: isSelected ? 10 : 8, y: isSelected ? 8 : 4)
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

extension View {
    func card(padding: CGFloat = 18, radius: CGFloat = 28, background: Color = Palette.surface) -> some View {
        self
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(background, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .shadow(color: Palette.ink.opacity(0.07), radius: 12, y: 6)
    }

    func eyebrow(_ color: Color = Palette.muted) -> some View {
        self.font(Typography.label()).tracking(1.4).foregroundStyle(color)
    }
}

struct ScreenBackground: View {
    var body: some View {
        Palette.cream.ignoresSafeArea()
    }
}
