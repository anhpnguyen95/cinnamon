// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "CinnamonCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "CinnamonCore", targets: ["CinnamonCore"])
    ],
    targets: [
        .target(name: "CinnamonCore"),
        .testTarget(name: "CinnamonCoreTests", dependencies: ["CinnamonCore"])
    ]
)
