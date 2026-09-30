// Cross-end fixture generator (W01/W02): rebuilds the .lunacanvas fixture
// from committed seed bytes (real PKDrawing payload captured from the
// simulator — macOS-compiled PencilKit binaries trap on PKDrawing(strokes:)
// in this environment, see 0032, so we never construct strokes here; the
// archive writer is the SAME LunaArchive.swift the iOS app compiles).

import CoreGraphics
import Foundation

fputs("start\n", stderr)
let root = URL(fileURLWithPath: CommandLine.arguments[1])
let fixtures = root.appendingPathComponent("docs/handwriting/native/fixtures")
let seedURL = fixtures.appendingPathComponent("ink-seed.drawing")
let seedData = try Data(contentsOf: seedURL)

let outDir = fixtures
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

var unit = LunaArchiveUnit(
    objectId: UUID().uuidString,
    data: seedData,
    transform: CGAffineTransform(scaleX: 1.5, y: 1.5), // web-side state
)

let url = outDir.appendingPathComponent("p0-roundtrip.lunacanvas")
_ = try LunaArchive.export(
    units: [unit],
    to: url,
    documentId: UUID().uuidString,
    revision: 1,
)
fputs("fixture written: \(url.path)\n", stderr)
