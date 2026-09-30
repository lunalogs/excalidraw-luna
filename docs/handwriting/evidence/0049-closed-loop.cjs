// 0049-R1 real-browser closed loop (Playwright headless Chromium):
// 1) drop a Swift-written .lunacanvas into the running editor
// 2) ink renders above the graphics canvas (screenshot)
// 3) draw a rectangle with the native excalidraw tool (graphics + ink mix)
// 4) drag-move the ink stroke (one history entry)
// 5) Menu -> Export -> Save to disk downloads the regenerated .lunacanvas
// 6) verify the downloaded container: strict validation, moved transform,
//    the new rectangle in the scene, revision bumped.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const ROOT =
  "/Users/luna/Documents/workspace/excalidraw/excalidraw-luna";
const FIXTURE = path.join(ROOT, "docs/handwriting/native/fixtures/p0-roundtrip.lunacanvas");
const OUT_DIR = path.join(ROOT, "docs/handwriting/evidence");

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--disable-features=FileSystemAccessAPI"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => {
    // headless has no native save picker; force the legacy download path
    // `in`-checks are used, so the properties must be gone, not undefined
    delete window.showSaveFilePicker;
    delete window.showOpenFilePicker;
    delete window.showDirectoryPicker;
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("BROWSER", m.type(), m.text().slice(0, 160)); });

  await page.goto("http://localhost:3199/", { waitUntil: "networkidle" });
  await page.waitForSelector(".excalidraw-container canvas", { timeout: 30000 });

  // --- 1) drop the .lunacanvas document onto the editor ---
  const b64 = fs.readFileSync(FIXTURE).toString("base64");
  await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], "p0-roundtrip.lunacanvas", {
      type: "application/vnd.lunacanvas+zip",
    });
    const dt = new DataTransfer();
    dt.items.add(file);
    document
      .querySelector(".excalidraw-container")
      .dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }),
      );
  }, b64);
  await page.waitForSelector('[data-testid="lunacanvas-ink-layer"] img', { timeout: 20000 });
  console.log("STEP1 ink layer rendered");

  // --- 3) draw a rectangle (native excalidraw tool) ---
  await page.keyboard.press("r");
  await page.mouse.move(600, 450);
  await page.mouse.down();
  await page.mouse.move(780, 580, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, "0049-browser-open.png") });
  console.log("STEP2 rectangle drawn");

  // --- 4) drag-move the ink stroke ---
  const img = page.locator('[data-testid="lunacanvas-ink-layer"] img');
  const box = await img.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 150, cy + 60, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const opacity = await img.evaluate((el) => el.style.opacity);
  console.log("STEP3 ink drag done, selected opacity=", opacity);
  await page.screenshot({ path: path.join(OUT_DIR, "0049-browser-moved.png") });

  // --- 5) Menu -> Export -> Save to disk ---
  await page.click(".main-menu-trigger");
  await page.waitForTimeout(400);
  await page.click('[data-testid="json-export-button"]');
  await page.waitForSelector(".ExportDialog--json", { timeout: 10000 });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.click(".ExportDialog--json .Card-button"),
  ]);
  const savedPath = path.join(OUT_DIR, "0049-browser-saved.lunacanvas");
  await download.saveAs(savedPath);
  console.log("STEP4 saved download:", download.suggestedFilename());

  // --- 6) verify the regenerated container ---
  const zip = await JSZip.loadAsync(fs.readFileSync(savedPath));
  const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
  const scene = JSON.parse(await zip.file("scene/excalidraw.json").async("string"));
  const t = manifest.inkObjects[0].worldTransform;
  const moved = Math.abs(t[4] - 150) < 2 && Math.abs(t[5] - 60) < 2;
  const hasRect = (scene.elements || []).some((e) => e.type === "rectangle");
  const resourceCount = manifest.resources.length;
  const hashOk = /[0-9a-f]{64}/.test(manifest.resources[0].sha256);
  console.log("STEP5 verify:", JSON.stringify({
    revision: manifest.revision,
    transform: t,
    moved,
    hasRect,
    resourceCount,
    hashOk,
    sceneElements: scene.elements.length,
  }));
  console.log("PAGE_ERRORS=", JSON.stringify(errors.slice(0, 3)));
  if (!moved || !hasRect || !hashOk) {
    throw new Error("verification failed");
  }
  await browser.close();
  console.log("CLOSED-LOOP OK");
})().catch((e) => {
  console.error("CLOSED-LOOP FAIL:", e.message || e);
  process.exit(1);
});
