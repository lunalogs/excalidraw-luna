// 0049-R1 (host wiring): the excalidraw host opens .lunacanvas through
// loadFromBlob, renders the ink overlay above the graphics canvas, and
// saves back through saveAsJSON — these tests exercise the host seams
// (hostStore + LunacanvasInkOverlay) directly, including real pointer
// interactions: tap-select, drag-move (one history entry), Delete.

import { readFileSync, existsSync } from "fs";

import path from "path";

import { fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  closeLunacanvasDocument,
  getLunacanvasDocument,
  openLunacanvasInEditor,
  saveLunacanvasFromEditor,
} from "../lunacanvas/hostStore";
import { LunacanvasInkOverlay } from "../lunacanvas/LunacanvasInkOverlay";
import { openLunacanvasContainer } from "../lunacanvas/zipContainer";

import type { AppState } from "../types";

const FIXTURE = path.resolve(
  __dirname,
  "../../../docs/handwriting/native/fixtures/p0-roundtrip.lunacanvas",
);

beforeEach(() => {
  closeLunacanvasDocument();
  // jsdom cannot create object URLs; the overlay only renders inks with a
  // preview URL, so stub one for the host-integration tests
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL =
    () => "blob:ink-preview";
});

afterEach(() => {
  closeLunacanvasDocument();
});

const makeAppState = (): AppState =>
  ({
    zoom: { value: 1 },
    offsetLeft: 0,
    offsetTop: 0,
    scrollX: 0,
    scrollY: 0,
  } as unknown as AppState);

describe("hostStore", () => {
  it("open -> edit -> save round-trips through the real container", async () => {
    if (!existsSync(FIXTURE)) {
      return;
    }
    const { scene } = await openLunacanvasInEditor(readFileSync(FIXTURE));
    expect((scene as { type: string }).type).toBe("excalidraw");

    const doc = getLunacanvasDocument();
    expect(doc).not.toBeNull();
    const revisionBefore = doc!.revision;
    const ink = doc!.controller.getObjects()[0];
    doc!.controller.moveSelection(new Set([ink.objectId]), 25, -10);

    const saved = await saveLunacanvasFromEditor({
      ...(scene as Record<string, unknown>),
      elements: [
        { id: "rect-1", type: "rectangle", x: 1, y: 2, width: 30, height: 40 },
      ],
    });
    expect(saved).not.toBeNull();
    const strict = await openLunacanvasContainer(saved!);
    expect(strict.ok).toBe(true);
    expect(doc!.revision).toBe(revisionBefore + 1);
  });

  it("close clears the active document", async () => {
    if (!existsSync(FIXTURE)) {
      return;
    }
    await openLunacanvasInEditor(readFileSync(FIXTURE));
    expect(getLunacanvasDocument()).not.toBeNull();
    closeLunacanvasDocument();
    expect(getLunacanvasDocument()).toBeNull();
  });
});

describe("LunacanvasInkOverlay (host interactions)", () => {
  it("tap selects, drag moves (one history entry), Delete removes", async () => {
    if (!existsSync(FIXTURE)) {
      return;
    }
    await openLunacanvasInEditor(readFileSync(FIXTURE));
    const appState = makeAppState();
    const { getByTestId } = render(
      <LunacanvasInkOverlay
        appState={appState}
        alphaSampler={() => Promise.resolve(true)}
      />,
    );
    const img = getByTestId("lunacanvas-ink-layer").querySelector("img")!;
    const doc = getLunacanvasDocument()!;

    // tap-select (alpha path: jsdom has no canvas -> unknown -> geometry)
    fireEvent(img, new MouseEvent("pointerdown", { bubbles: true }));
    await waitFor(() => {
      expect(img.style.opacity).toBe("0.75");
    });

    // drag-move: pointerdown + window pointermove + pointerup
    fireEvent(
      img,
      new MouseEvent("pointerdown", {
        bubbles: true,
        clientX: 50,
        clientY: 50,
      }),
    );
    fireEvent(
      window,
      new MouseEvent("pointermove", { clientX: 120, clientY: 80 }),
    );
    fireEvent(
      window,
      new MouseEvent("pointerup", { clientX: 120, clientY: 80 }),
    );
    await waitFor(() => {
      const t = doc.controller.getObjects()[0].transform;
      expect(t[4]).toBeCloseTo(70, 0); // 120-50 = 70 scene px at zoom 1
      expect(t[5]).toBeCloseTo(30, 0);
    });
    expect(doc.controller.getHistoryDepth().undo).toBe(1);

    // Delete removes the selected object (one entry)
    fireEvent(window, new KeyboardEvent("keydown", { key: "Delete" }));
    await waitFor(() => {
      expect(doc.controller.getObjects()[0].deleted).toBe(true);
    });
    expect(doc.controller.getHistoryDepth().undo).toBe(2);

    // undo the delete, then the move — the single ordered stack
    doc.controller.undo();
    doc.controller.undo();
    expect(doc.controller.getObjects()[0].deleted).toBe(false);
    expect(doc.controller.getObjects()[0].transform[4]).not.toBeCloseTo(70, 0);
  });

  it("renders nothing without an active document", () => {
    const { queryByTestId } = render(
      <LunacanvasInkOverlay appState={makeAppState()} />,
    );
    expect(queryByTestId("lunacanvas-ink-overlay")).toBeNull();
  });
});
