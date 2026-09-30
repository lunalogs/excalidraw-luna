// LunaCanvas — phase-3 hybrid document app (0049-R1).
// Real document flow: open .lunacanvas via the document browser, edit ink
// natively, save the FULL page (scene + ink + preserved resources) back
// through the atomic save entry, save-as via the share sheet, start new
// documents. The old "export 3 strokes" P0 button is gone; errors surface
// in alerts instead of being swallowed.

import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    static let lunacanvas = UTType(filenameExtension: "lunacanvas")!
}

@main
struct LunaCanvasApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    @StateObject private var canvasController = CanvasController()
    @State private var documentURL: URL?
    @State private var imported: ImportedDocument?
    @State private var showingOpen = false
    @State private var pendingShare: ShareItem?
    @State private var alert: AlertItem?

    var body: some View {
        NavigationStack {
            CanvasView(controller: canvasController)
                .navigationTitle(documentTitle)
                .toolbar {
                    ToolbarItemGroup(placement: .primaryAction) {
                        Button("打开") { showingOpen = true }
                        Button("保存") { save() }
                        Menu("更多") {
                            Button("另存为…") { saveAs() }
                            Button("新建") { newDocument() }
                        }
                    }
                }
        }
        .fileImporter(
            isPresented: $showingOpen,
            allowedContentTypes: [.lunacanvas],
        ) { result in
            switch result {
            case .success(let url):
                openDocument(at: url)
            case .failure(let error):
                alert = AlertItem(message: "无法打开文件：\(error.localizedDescription)")
            }
        }
        .sheet(item: $pendingShare) { item in
            ActivityView(item: item)
        }
        .alert(item: $alert) { item in
            Alert(
                title: Text("LunaCanvas"),
                message: Text(item.message),
                dismissButton: .default(Text("好"))
            )
        }
    }

    private var documentTitle: String {
        documentURL?.lastPathComponent ?? "未命名文档"
    }

    private func openDocument(at url: URL) {
        do {
            let document = try DocumentFileStore.openDocument(at: url)
            guard let canvas = canvasController.liveCanvasForUI else {
                // canvas not attached yet: stage via load-on-attach is
                // overkill for v1 — the canvas attaches at first appear,
                // so re-dispatch one runloop tick.
                DispatchQueue.main.async {
                    self.openDocument(at: url)
                }
                return
            }
            canvasController.load(
                from: document.units,
                canvas: canvas,
                documentId: document.documentId,
                revision: document.revision,
            )
            imported = document
            documentURL = url
            alert = AlertItem(message: "已打开 \(document.units.count) 条笔迹")
        } catch {
            alert = AlertItem(message: "打开失败：\(error.localizedDescription)")
        }
    }

    /// Full-page save through the real atomic entry: the ORIGINAL scene
    /// and preserved resources travel with the ink (0045-R2).
    private func save() {
        guard let url = documentURL else {
            saveAs()
            return
        }
        do {
            guard let canvas = canvasController.liveCanvasForUI else { return }
            canvasController.updateUnits(from: canvas)
            try DocumentFileStore.saveDocument(
                units: canvasController.units,
                to: url,
                documentId: canvasController.documentId.uuidString,
                revision: (imported?.revision ?? 0) + 1,
                scene: imported?.sceneData,
                preservedEntries: imported?.preservedEntries ?? [],
            )
            imported = try DocumentFileStore.openDocument(at: url)
        } catch {
            alert = AlertItem(message: "保存失败（原文件未改动）：\(error.localizedDescription)")
        }
    }

    private func saveAs() {
        guard let canvas = canvasController.liveCanvasForUI else { return }
        canvasController.updateUnits(from: canvas)
        let temp = FileManager.default.temporaryDirectory
            .appendingPathComponent("share-\(UUID().uuidString).lunacanvas")
        do {
            try DocumentFileStore.saveDocument(
                units: canvasController.units,
                to: temp,
                documentId: canvasController.documentId.uuidString,
                revision: (imported?.revision ?? 0) + 1,
                scene: imported?.sceneData,
                preservedEntries: imported?.preservedEntries ?? [],
            )
            pendingShare = ShareItem(url: temp)
        } catch {
            alert = AlertItem(message: "导出失败：\(error.localizedDescription)")
        }
    }

    private func newDocument() {
        guard let canvas = canvasController.liveCanvasForUI else { return }
        canvasController.resetForNewDocument(canvas: canvas)
        imported = nil
        documentURL = nil
    }
}

struct AlertItem: Identifiable {
    let id = UUID()
    let message: String
}

struct ShareItem: Identifiable {
    let id = UUID()
    let url: URL
}

struct ActivityView: UIViewControllerRepresentable {
    let item: ShareItem

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [item.url], applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
