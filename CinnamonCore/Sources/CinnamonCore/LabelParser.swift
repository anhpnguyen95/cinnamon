import Foundation

/// A line of text read from a medicine box, with its height relative to the photo
/// (taller text is usually the brand name).
public struct RecognizedLine: Equatable, Sendable {
    public var text: String
    public var height: Double

    public init(text: String, height: Double) {
        self.text = text
        self.height = height
    }
}

public struct LabelGuess: Equatable, Sendable {
    public var name: String?
    public var strength: String?

    public init(name: String? = nil, strength: String? = nil) {
        self.name = name
        self.strength = strength
    }
}

/// Picks a likely medicine name and strength from on-device text recognition.
/// Que always confirms or corrects the guess.
public enum LabelParser {
    static let strengthPattern = try! NSRegularExpression(
        pattern: #"(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|g|ml|iu|ui)\b"#,
        options: [.caseInsensitive]
    )

    /// Words printed on most packs that are never the medicine's name.
    static let noise: Set<String> = [
        "viên", "viên nén", "viên nang", "hộp", "vỉ", "thuốc", "tablets", "tablet", "capsules",
        "rx", "gmp", "who", "sđk", "sdk", "lô", "hsd", "nsx", "exp", "lot", "mfg"
    ]

    public static func strength(in text: String) -> String? {
        let range = NSRange(text.startIndex..., in: text)
        guard let match = strengthPattern.firstMatch(in: text, range: range),
              let amount = Range(match.range(at: 1), in: text),
              let unit = Range(match.range(at: 2), in: text) else { return nil }
        return "\(text[amount].replacingOccurrences(of: ",", with: ".")) \(text[unit].lowercased())"
    }

    public static func guess(from lines: [RecognizedLine]) -> LabelGuess {
        let foundStrength = lines.lazy.compactMap { Self.strength(in: $0.text) }.first

        let candidates = lines.compactMap { line -> (String, Double)? in
            var text = line.text
            let range = NSRange(text.startIndex..., in: text)
            text = strengthPattern.stringByReplacingMatches(in: text, range: range, withTemplate: "")
            text = text.trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
            let letters = text.unicodeScalars.filter { CharacterSet.letters.contains($0) }.count
            guard letters >= 3, letters * 2 >= text.count else { return nil }
            guard !noise.contains(text.lowercased()) else { return nil }
            return (text, line.height)
        }

        let name = candidates.max { $0.1 < $1.1 }?.0
        return LabelGuess(name: name, strength: foundStrength)
    }
}
