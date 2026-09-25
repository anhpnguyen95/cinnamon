import CinnamonCore
import UIKit
import Vision

/// Reads text from a medicine photo on the phone (Apple Vision), then guesses name and strength.
/// Nothing leaves the device.
enum LabelReader {
    static func read(_ image: UIImage) async -> LabelGuess {
        guard let cgImage = image.cgImage else { return LabelGuess() }
        let orientation = CGImagePropertyOrientation(image.imageOrientation)
        let lines: [RecognizedLine] = await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let request = VNRecognizeTextRequest()
                request.recognitionLevel = .accurate
                request.usesLanguageCorrection = false
                let supported = (try? request.supportedRecognitionLanguages()) ?? []
                request.recognitionLanguages = ["vi-VN", "en-US"].filter { supported.contains($0) }

                let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation)
                try? handler.perform([request])
                let lines = (request.results ?? []).compactMap { observation -> RecognizedLine? in
                    guard let text = observation.topCandidates(1).first?.string else { return nil }
                    return RecognizedLine(text: text, height: Double(observation.boundingBox.height))
                }
                continuation.resume(returning: lines)
            }
        }
        return LabelParser.guess(from: lines)
    }
}

extension CGImagePropertyOrientation {
    init(_ orientation: UIImage.Orientation) {
        switch orientation {
        case .up: self = .up
        case .down: self = .down
        case .left: self = .left
        case .right: self = .right
        case .upMirrored: self = .upMirrored
        case .downMirrored: self = .downMirrored
        case .leftMirrored: self = .leftMirrored
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}
