// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "FixtureGen",
    platforms: [.macOS(.v13)],
    dependencies: [
        .package(url: "https://github.com/weichsel/ZIPFoundation", from: "0.9.20"),
    ],
    targets: [
        .executableTarget(
            name: "fixturegen",
            dependencies: [.product(name: "ZIPFoundation", package: "ZIPFoundation")],
            path: "Sources/fixturegen",
            // main.swift + LunaArchive.swift copied from the app target by
            // scripts/native/gen-fixture.sh before building (SPM rejects
            // sources outside the target directory; the copy is verified
            // by diff in the same script so the writer cannot drift)
            sources: ["main.swift", "LunaArchive.swift"],
        ),
    ],
)
