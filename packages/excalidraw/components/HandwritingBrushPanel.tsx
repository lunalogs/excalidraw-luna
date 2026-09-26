import { useCallback, useEffect, useRef, useState } from "react";

import { BRUSH_PARAM_RANGES } from "@excalidraw/element/handwriting/brushParams";
import { computeHandwritingOutline } from "@excalidraw/element/handwriting/outline";
import { getDefaultBrushConfig } from "@excalidraw/element/handwriting/brushParams";

import type { HandwritingBrushKind } from "@excalidraw/element/handwriting/types";

import {
  BRUSH_PRESETS_FILE_EXTENSION,
  createPresetLibrary,
  exportPresetsToJSON,
  importPresetsFromJSON,
  MAX_PERSONAL_PRESETS,
  validatePresetName,
  type BrushPreset,
  type BrushPresetInput,
} from "../handwriting/brushPresets";
import { fileOpen, fileSave } from "../data/filesystem";

import { useI18n } from "../i18n";

import { useApp, useExcalidrawAppState, useExcalidrawSetAppState } from "./App";

import "./HandwritingBrushPanel.scss";

const BRUSH_KINDS: readonly HandwritingBrushKind[] = [
  "standard",
  "fountain",
  "highlighter",
];

/**
 * The current brush settings as a plain comparable object. Used to detect
 * "modified" state against the active preset (PRE-01) and to apply presets
 * (PRE-03).
 */
export interface CurrentBrushSettings {
  brushKind: HandwritingBrushKind;
  strokeWidth: number;
  strokeColor: string;
  opacity: number;
  pressureAmount: number;
  pressureSensitivity: number;
  nibFlatness: number;
  nibAngle: number;
  stabilization: number;
}

export const getCurrentBrushSettings = (appState: {
  currentItemBrush: HandwritingBrushKind;
  currentItemStrokeWidth: number;
  currentItemStrokeColor: string;
  currentItemOpacity: number;
  currentItemPressureAmount: number;
  currentItemPressureSensitivity: number;
  currentItemNibFlatness: number;
  currentItemNibAngle: number;
  currentItemStabilization: number;
}): CurrentBrushSettings => ({
  brushKind: appState.currentItemBrush,
  strokeWidth: appState.currentItemStrokeWidth,
  strokeColor: appState.currentItemStrokeColor,
  opacity: appState.currentItemOpacity,
  pressureAmount: appState.currentItemPressureAmount,
  pressureSensitivity: appState.currentItemPressureSensitivity,
  nibFlatness: appState.currentItemNibFlatness,
  nibAngle: appState.currentItemNibAngle,
  stabilization: appState.currentItemStabilization,
});

export const brushSettingsMatchPreset = (
  settings: CurrentBrushSettings,
  preset: BrushPreset,
): boolean =>
  settings.brushKind === preset.brushKind &&
  settings.strokeWidth === preset.strokeWidth &&
  settings.strokeColor === preset.strokeColor &&
  settings.opacity === preset.opacity &&
  settings.pressureAmount === preset.config.pressureAmount &&
  settings.pressureSensitivity === preset.config.pressureSensitivity &&
  settings.nibFlatness === preset.config.nibFlatness &&
  settings.nibAngle === preset.config.nibAngle &&
  settings.stabilization === preset.config.stabilization;

const BUILTIN_OPACITY: Record<HandwritingBrushKind, number> = {
  standard: 100,
  fountain: 100,
  highlighter: 30,
};

const BUILTIN_WIDTH: Record<HandwritingBrushKind, number> = {
  standard: 1,
  fountain: 1,
  highlighter: 6,
};

const BUILTIN_COLOR: Record<HandwritingBrushKind, string> = {
  standard: "#1b1b1f",
  fountain: "#1b1b1f",
  highlighter: "#fab005",
};

// ---------------------------------------------------------------------------
// Test-write area (UI-08): renders with the exact same outline function as
// the canvas / export. Never touches the document, history or files.
// ---------------------------------------------------------------------------

type TestStroke = {
  points: [number, number][];
  pressures: number[];
};

const sampleStroke = (pressure: number): TestStroke => {
  const points: [number, number][] = [];
  const pressures: number[] = [];
  const count = 42;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    points.push([8 + t * 216, 36 + Math.sin(t * Math.PI * 2.5) * 14]);
    pressures.push(Math.min(1, Math.max(0, pressure + Math.sin(t * 6) * 0.06)));
  }
  return { points, pressures };
};

const drawStroke = (
  ctx: CanvasRenderingContext2D,
  stroke: TestStroke,
  settings: CurrentBrushSettings,
  simulatePressure: boolean,
  offsetY = 0,
) => {
  const outline = computeHandwritingOutline({
    points: stroke.points.map(([x, y]) => [x, y + offsetY] as [number, number]),
    pressures: stroke.pressures,
    size: settings.strokeWidth * 4.25,
    simulatePressure,
    config: {
      schemaVersion: 1,
      brushKind: settings.brushKind,
      pressureAmount: settings.pressureAmount,
      pressureSensitivity: settings.pressureSensitivity,
      nibFlatness: settings.nibFlatness,
      nibAngle: settings.nibAngle,
      stabilization: settings.stabilization,
    },
  });
  if (outline.length < 3) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    ctx.lineTo(outline[i][0], outline[i][1]);
  }
  ctx.closePath();
  ctx.fillStyle = settings.strokeColor;
  ctx.globalAlpha = settings.opacity / 100;
  ctx.fill();
  ctx.globalAlpha = 1;
};

const TEST_AREA_WIDTH = 232;
const TEST_AREA_HEIGHT = 72;

const TestWriteArea = ({ settings }: { settings: CurrentBrushSettings }) => {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<TestStroke[]>([]);
  const drawingRef = useRef<TestStroke | null>(null);

  const redraw = useCallback(
    (extra: TestStroke | null) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) {
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Fixed sample strokes: a light-pressure and a heavy-pressure pass over
      // the same path, so changes in amount / sensitivity / nib shape are
      // immediately comparable (UI-08).
      drawStroke(ctx, sampleStroke(0.25), settings, false);
      drawStroke(ctx, sampleStroke(0.9), settings, false, 0);
      for (const stroke of strokes) {
        drawStroke(
          ctx,
          stroke,
          settings,
          stroke.pressures.every((p) => p === 0.5),
        );
      }
      if (extra) {
        drawStroke(
          ctx,
          extra,
          settings,
          extra.pressures.every((p) => p === 0.5),
        );
      }
    },
    [settings, strokes],
  );

  useEffect(() => {
    redraw(null);
  }, [redraw]);

  const localPoint = (event: React.PointerEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = TEST_AREA_WIDTH / (rect.width || TEST_AREA_WIDTH);
    const scaleY = TEST_AREA_HEIGHT / (rect.height || TEST_AREA_HEIGHT);
    return [
      (event.clientX - rect.left) * scaleX,
      (event.clientY - rect.top) * scaleY,
    ];
  };

  return (
    <div className="handwriting-test-area">
      <div className="handwriting-test-area__label">
        <span>{t("handwriting.testWrite")}</span>
        <button
          type="button"
          className="handwriting-test-area__clear"
          onClick={() => setStrokes([])}
        >
          {t("handwriting.testWriteClear")}
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="handwriting-test-area__canvas"
        width={TEST_AREA_WIDTH}
        height={TEST_AREA_HEIGHT}
        aria-label={t("handwriting.testWrite")}
        onPointerDown={(event) => {
          event.stopPropagation();
          event.preventDefault();
          const [x, y] = localPoint(event);
          drawingRef.current = {
            points: [[x, y]],
            pressures: [event.pressure > 0 ? event.pressure : 0.5],
          };
          canvasRef.current?.setPointerCapture?.(event.pointerId);
          redraw(drawingRef.current);
        }}
        onPointerMove={(event) => {
          event.stopPropagation();
          const stroke = drawingRef.current;
          if (!stroke) {
            return;
          }
          const [x, y] = localPoint(event);
          const last = stroke.points[stroke.points.length - 1];
          if (Math.hypot(x - last[0], y - last[1]) < 1.5) {
            return;
          }
          stroke.points.push([x, y]);
          stroke.pressures.push(event.pressure > 0 ? event.pressure : 0.5);
          redraw(stroke);
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          const stroke = drawingRef.current;
          drawingRef.current = null;
          if (stroke && stroke.points.length > 0) {
            setStrokes((prev) => [...prev, stroke]);
          }
        }}
      />
      <p className="handwriting-test-area__hint">
        {t("handwriting.testWriteHint")}
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Eraser mini-panel (UI-04): shown while the eraser tool is active so the
// user can return to the previous stroke with one tap. The main brush panel
// lives in the properties panel and is only visible for the freedraw tool.
// ---------------------------------------------------------------------------

export const HandwritingEraserPanel = () => {
  const app = useApp();
  const { t } = useI18n();

  return (
    <div
      className="handwriting-brush-panel handwriting-eraser-panel"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="handwriting-brush-panel__row">
        <button
          type="button"
          className="handwriting-brush-panel__brush"
          aria-pressed={true}
          title={t("handwriting.eraserHint")}
          onClick={() => app.setActiveTool({ type: "freedraw" })}
        >
          {t("handwriting.backToPen")}
        </button>
      </div>
      <p className="handwriting-brush-panel__hint">
        {t("handwriting.eraserHint")}
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export const HandwritingBrushPanel = () => {
  const app = useApp();
  const state = useExcalidrawAppState();
  const setState = useExcalidrawSetAppState();
  const { t } = useI18n();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [persistWarning, setPersistWarning] = useState(false);
  const [presetMessage, setPresetMessage] = useState("");
  // pending preset switch while the current settings are modified (PRE-03)
  const [pendingSwitch, setPendingSwitch] = useState<BrushPreset | null>(null);
  // inline naming dialog: save-as new preset or rename existing one
  const [naming, setNaming] = useState<{
    mode: "save-as" | "rename";
    presetId?: string;
    name: string;
  } | null>(null);

  // One library instance per panel mount: reads the latest persisted state
  // on open and keeps in-memory state stable while the panel is visible.
  const [library] = useState(() => createPresetLibrary());

  useEffect(() => {
    if (library.getPersistError()) {
      // Surface once per mount (PRE-04: no fake success).
      setPersistWarning(true);
    }
  }, [library]);

  const settings = getCurrentBrushSettings(state);

  const presets: BrushPreset[] = [
    ...library.getBuiltinPresets(),
    ...library.list(),
  ];
  const activePreset = state.currentItemBrushPreset
    ? presets.find((preset) => preset.id === state.currentItemBrushPreset)
    : undefined;
  const isModified = activePreset
    ? !brushSettingsMatchPreset(settings, activePreset)
    : false;

  const applySettings = (next: Partial<CurrentBrushSettings>) => {
    const merged = { ...settings, ...next };
    setState({
      currentItemBrush: merged.brushKind,
      currentItemStrokeWidth: merged.strokeWidth,
      currentItemStrokeColor: merged.strokeColor,
      currentItemOpacity: merged.opacity,
      currentItemPressureAmount: merged.pressureAmount,
      currentItemPressureSensitivity: merged.pressureSensitivity,
      currentItemNibFlatness: merged.nibFlatness,
      currentItemNibAngle: merged.nibAngle,
      currentItemStabilization: merged.stabilization,
    });
  };

  const selectBrushKind = (brushKind: HandwritingBrushKind) => {
    const config = getDefaultBrushConfig(brushKind);
    app.setActiveTool({ type: "freedraw" });
    setState({
      currentItemBrush: brushKind,
      currentItemBrushPreset: `builtin-${brushKind}`,
      currentItemStrokeWidth: BUILTIN_WIDTH[brushKind],
      currentItemStrokeColor: BUILTIN_COLOR[brushKind],
      currentItemOpacity: BUILTIN_OPACITY[brushKind],
      currentItemPressureAmount: config.pressureAmount,
      currentItemPressureSensitivity: config.pressureSensitivity,
      currentItemNibFlatness: config.nibFlatness,
      currentItemNibAngle: config.nibAngle,
      currentItemStabilization: config.stabilization,
      currentItemShapeRecognition: brushKind !== "highlighter",
    });
  };

  const applyPreset = (preset: BrushPreset) => {
    setState({
      currentItemBrushPreset: preset.id,
      currentItemBrush: preset.brushKind,
      currentItemStrokeWidth: preset.strokeWidth,
      currentItemStrokeColor: preset.strokeColor,
      currentItemOpacity: preset.opacity,
      currentItemPressureAmount: preset.config.pressureAmount,
      currentItemPressureSensitivity: preset.config.pressureSensitivity,
      currentItemNibFlatness: preset.config.nibFlatness,
      currentItemNibAngle: preset.config.nibAngle,
      currentItemStabilization: preset.config.stabilization,
    });
  };

  // -------------------------------------------------------------------------
  // Personal preset management (M3 / PRE-01–PRE-06)
  // -------------------------------------------------------------------------

  const settingsToPresetInput = (name: string): BrushPresetInput => ({
    name,
    brushKind: settings.brushKind,
    strokeWidth: settings.strokeWidth,
    strokeColor: settings.strokeColor,
    opacity: settings.opacity,
    config: {
      schemaVersion: 1,
      brushKind: settings.brushKind,
      pressureAmount: settings.pressureAmount,
      pressureSensitivity: settings.pressureSensitivity,
      nibFlatness: settings.nibFlatness,
      nibAngle: settings.nibAngle,
      stabilization: settings.stabilization,
    },
  });

  const personalNames = () => library.list().map((preset) => preset.name);

  const validateNameForUi = (name: string): string | null => {
    const result = validatePresetName(name, personalNames());
    if (result.ok) {
      return null;
    }
    if (result.error.includes("already exists")) {
      return t("handwriting.presetNameDuplicate");
    }
    return t("handwriting.presetNameRequired");
  };

  const confirmNaming = () => {
    if (!naming) {
      return;
    }
    const nameError = validateNameForUi(naming.name);
    if (nameError) {
      setPresetMessage(nameError);
      return;
    }
    if (naming.mode === "save-as") {
      if (library.list().length >= MAX_PERSONAL_PRESETS) {
        setPresetMessage(t("handwriting.presetLimitReached"));
        return;
      }
      const result = library.add(settingsToPresetInput(naming.name.trim()), {
        onNameConflict: "error",
      });
      if (!result.ok) {
        setPresetMessage(t("handwriting.presetNameDuplicate"));
        return;
      }
      setState({ currentItemBrushPreset: result.preset.id });
      setPresetMessage("");
      // a save triggered from a pending switch completes the switch (PRE-03)
      if (pendingSwitch) {
        const target = pendingSwitch;
        setPendingSwitch(null);
        applyPreset(target);
      }
    } else if (naming.presetId) {
      const result = library.rename(naming.presetId, naming.name.trim(), {
        onNameConflict: "error",
      });
      if (!result.ok) {
        setPresetMessage(t("handwriting.presetNameDuplicate"));
        return;
      }
      setPresetMessage("");
    }
    setNaming(null);
  };

  const updateActivePreset = () => {
    if (!activePreset || activePreset.id.startsWith("builtin-")) {
      return;
    }
    const result = library.update(
      activePreset.id,
      settingsToPresetInput(activePreset.name),
    );
    if (!result.ok) {
      setPresetMessage(t("handwriting.presetsNotPersisted"));
      return;
    }
    setPresetMessage("");
    if (pendingSwitch) {
      const target = pendingSwitch;
      setPendingSwitch(null);
      applyPreset(target);
    }
  };

  const deletePreset = (preset: BrushPreset) => {
    if (!library.remove(preset.id)) {
      return;
    }
    if (state.currentItemBrushPreset === preset.id) {
      // PRE-03: fall back to the built-in default of the current brush kind
      const fallback = library.get(`builtin-${settings.brushKind}`);
      if (fallback) {
        applyPreset(fallback);
      }
    }
    setPresetMessage(t("handwriting.presetDeletedFallback"));
  };

  const duplicatePreset = (preset: BrushPreset) => {
    const result = library.duplicate(preset.id);
    setPresetMessage(result.ok ? "" : result.errors.join(" "));
  };

  const exportPresets = async () => {
    try {
      const personal = library.list();
      const file = new File(
        [exportPresetsToJSON(personal)],
        `brush-presets.${BRUSH_PRESETS_FILE_EXTENSION}`,
        { type: "application/json" },
      );
      await fileSave(file, {
        name: "brush-presets",
        extension: "json",
        description: "Excalidraw brush presets",
      });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setPresetMessage(t("handwriting.presetsExportFailed"));
      }
    }
  };

  const importPresets = async () => {
    let file: File;
    try {
      file = await fileOpen({
        extensions: ["json"],
        description: "Excalidraw brush presets",
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      setPresetMessage(t("handwriting.presetsImportFailed"));
      return;
    }
    try {
      const result = importPresetsFromJSON(await file.text(), library.list(), {
        onNameConflict: "suffix",
      });
      if (!result.ok) {
        setPresetMessage(t("handwriting.presetsImportFailed"));
        return;
      }
      let added = 0;
      for (const preset of result.presets) {
        const addResult = library.add(
          {
            name: preset.name,
            brushKind: preset.brushKind,
            strokeWidth: preset.strokeWidth,
            strokeColor: preset.strokeColor,
            opacity: preset.opacity,
            config: preset.config,
          },
          { onNameConflict: "suffix" },
        );
        if (addResult.ok) {
          added++;
        }
      }
      setPresetMessage(t("handwriting.presetsImported", { count: added }));
    } catch (error) {
      setPresetMessage(t("handwriting.presetsImportFailed"));
    }
  };

  const erasing = state.activeTool.type === "eraser";

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void,
    disabled = false,
    disabledHint?: string,
  ) => (
    <label
      className="handwriting-brush-panel__slider"
      title={disabled ? disabledHint : undefined}
    >
      <span className="handwriting-brush-panel__slider-label">{label}</span>
      <output>{value}</output>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );

  const resetDefaults = () => {
    const config = getDefaultBrushConfig(settings.brushKind);
    applySettings({
      strokeWidth: BUILTIN_WIDTH[settings.brushKind],
      strokeColor: BUILTIN_COLOR[settings.brushKind],
      opacity: BUILTIN_OPACITY[settings.brushKind],
      pressureAmount: config.pressureAmount,
      pressureSensitivity: config.pressureSensitivity,
      nibFlatness: config.nibFlatness,
      nibAngle: config.nibAngle,
      stabilization: config.stabilization,
    });
  };

  return (
    <div
      className="handwriting-brush-panel"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className="handwriting-brush-panel__row"
        role="group"
        aria-label={t("handwriting.brush")}
      >
        {BRUSH_KINDS.map((brush) => (
          <button
            type="button"
            key={brush}
            className="handwriting-brush-panel__brush"
            aria-pressed={
              state.activeTool.type === "freedraw" &&
              state.currentItemBrush === brush
            }
            onClick={() => selectBrushKind(brush)}
          >
            {t(`handwriting.${brush}`)}
          </button>
        ))}
        <button
          type="button"
          className="handwriting-brush-panel__brush"
          aria-pressed={erasing}
          title={t("handwriting.eraserHint")}
          onClick={() =>
            app.setActiveTool({ type: erasing ? "freedraw" : "eraser" })
          }
        >
          {erasing ? t("handwriting.backToPen") : t("handwriting.eraser")}
        </button>
      </div>

      <label className="handwriting-brush-panel__preset-row">
        <span className="handwriting-brush-panel__slider-label">
          {t("handwriting.presets")}
        </span>
        <select
          aria-label={t("handwriting.presets")}
          value={activePreset && !isModified ? activePreset.id : "__current__"}
          onChange={(event) => {
            const preset = presets.find((p) => p.id === event.target.value);
            if (!preset) {
              return;
            }
            // PRE-03: ask before losing unsaved modifications
            if (isModified) {
              setPendingSwitch(preset);
            } else {
              applyPreset(preset);
            }
          }}
        >
          {(!activePreset || isModified) && (
            <option value="__current__" disabled>
              {isModified
                ? `${
                    activePreset?.name ?? t("handwriting.presetDefault")
                  } · ${t("handwriting.presetModified")}`
                : t("handwriting.presetDefault")}
            </option>
          )}
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        {isModified && (
          <span className="handwriting-brush-panel__modified">
            {t("handwriting.presetModified")}
          </span>
        )}
      </label>

      {(isModified || !activePreset) && (
        <div className="handwriting-brush-panel__row">
          <button
            type="button"
            className="handwriting-brush-panel__brush"
            onClick={() =>
              setNaming({ mode: "save-as", name: activePreset?.name ?? "" })
            }
          >
            {t("handwriting.savePreset")}
          </button>
          {activePreset && !activePreset.id.startsWith("builtin-") && (
            <button
              type="button"
              className="handwriting-brush-panel__brush"
              onClick={updateActivePreset}
            >
              {t("handwriting.updatePreset")}
            </button>
          )}
        </div>
      )}

      {activePreset && !activePreset.id.startsWith("builtin-") && (
        <div className="handwriting-brush-panel__row">
          <button
            type="button"
            className="handwriting-brush-panel__brush"
            onClick={() =>
              setNaming({
                mode: "rename",
                presetId: activePreset.id,
                name: activePreset.name,
              })
            }
          >
            {t("handwriting.renamePreset")}
          </button>
          <button
            type="button"
            className="handwriting-brush-panel__brush"
            onClick={() => duplicatePreset(activePreset)}
          >
            {t("handwriting.duplicatePreset")}
          </button>
          <button
            type="button"
            className="handwriting-brush-panel__brush"
            onClick={() => deletePreset(activePreset)}
          >
            {t("handwriting.deletePreset")}
          </button>
        </div>
      )}

      <div className="handwriting-brush-panel__row">
        <button
          type="button"
          className="handwriting-brush-panel__brush"
          onClick={importPresets}
        >
          {t("handwriting.importPresets")}
        </button>
        <button
          type="button"
          className="handwriting-brush-panel__brush"
          onClick={exportPresets}
        >
          {t("handwriting.exportPresets")}
        </button>
      </div>

      {naming && (
        <div className="handwriting-brush-panel__naming">
          <input
            type="text"
            aria-label={t("handwriting.presetNamePlaceholder")}
            placeholder={t("handwriting.presetNamePlaceholder")}
            value={naming.name}
            onChange={(event) =>
              setNaming({ ...naming, name: event.target.value })
            }
          />
          <button
            type="button"
            className="handwriting-brush-panel__brush"
            onClick={confirmNaming}
          >
            {t("handwriting.save")}
          </button>
          <button
            type="button"
            className="handwriting-brush-panel__brush"
            onClick={() => setNaming(null)}
          >
            {t("handwriting.cancel")}
          </button>
        </div>
      )}

      {pendingSwitch && (
        <div className="handwriting-brush-panel__unsaved" role="alertdialog">
          <p>{t("handwriting.unsavedChangesDescription")}</p>
          <div className="handwriting-brush-panel__row">
            <button
              type="button"
              className="handwriting-brush-panel__brush"
              onClick={() => {
                if (activePreset && !activePreset.id.startsWith("builtin-")) {
                  updateActivePreset();
                } else {
                  setNaming({
                    mode: "save-as",
                    name: activePreset?.name ?? "",
                  });
                }
              }}
            >
              {t("handwriting.save")}
            </button>
            <button
              type="button"
              className="handwriting-brush-panel__brush"
              onClick={() => {
                const target = pendingSwitch;
                setPendingSwitch(null);
                applyPreset(target);
              }}
            >
              {t("handwriting.discard")}
            </button>
            <button
              type="button"
              className="handwriting-brush-panel__brush"
              onClick={() => setPendingSwitch(null)}
            >
              {t("handwriting.cancel")}
            </button>
          </div>
        </div>
      )}

      {presetMessage && (
        <p role="status" className="handwriting-brush-panel__warning">
          {presetMessage}
        </p>
      )}

      {slider(
        t("handwriting.width"),
        state.currentItemStrokeWidth,
        0.25,
        12,
        0.25,
        (value) => applySettings({ strokeWidth: value }),
      )}
      {slider(
        t("handwriting.opacity"),
        state.currentItemOpacity,
        1,
        100,
        1,
        (value) => applySettings({ opacity: value }),
      )}

      <button
        type="button"
        className="handwriting-brush-panel__advanced-toggle"
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen((open) => !open)}
      >
        {t("handwriting.advanced")} {advancedOpen ? "−" : "+"}
      </button>
      {advancedOpen && (
        <div className="handwriting-brush-panel__advanced">
          {slider(
            t("handwriting.pressureAmount"),
            state.currentItemPressureAmount,
            BRUSH_PARAM_RANGES.pressureAmount.min,
            BRUSH_PARAM_RANGES.pressureAmount.max,
            1,
            (value) => applySettings({ pressureAmount: value }),
          )}
          {slider(
            t("handwriting.pressureSensitivity"),
            state.currentItemPressureSensitivity,
            BRUSH_PARAM_RANGES.pressureSensitivity.min,
            BRUSH_PARAM_RANGES.pressureSensitivity.max,
            1,
            (value) => applySettings({ pressureSensitivity: value }),
          )}
          {slider(
            t("handwriting.nibFlatness"),
            state.currentItemNibFlatness,
            BRUSH_PARAM_RANGES.nibFlatness.min,
            BRUSH_PARAM_RANGES.nibFlatness.max,
            1,
            (value) => applySettings({ nibFlatness: value }),
          )}
          {slider(
            t("handwriting.nibAngle"),
            state.currentItemNibAngle,
            BRUSH_PARAM_RANGES.nibAngle.min,
            BRUSH_PARAM_RANGES.nibAngle.max,
            1,
            (value) => applySettings({ nibAngle: value }),
            state.currentItemNibFlatness === 0,
            t("handwriting.nibAngleDisabledHint"),
          )}
          {slider(
            t("handwriting.stabilization"),
            state.currentItemStabilization,
            BRUSH_PARAM_RANGES.stabilization.min,
            BRUSH_PARAM_RANGES.stabilization.max,
            1,
            (value) => applySettings({ stabilization: value }),
          )}
          <label className="handwriting-brush-panel__pen-mode">
            <input
              type="checkbox"
              checked={state.penMode}
              onChange={(event) => setState({ penMode: event.target.checked })}
            />
            {t("handwriting.penOnly")}
          </label>
          <button
            type="button"
            className="handwriting-brush-panel__reset"
            onClick={resetDefaults}
          >
            {t("handwriting.resetDefaults")}
          </button>
        </div>
      )}

      <TestWriteArea settings={settings} />

      <div className="handwriting-brush-panel__recognition">
        <label>
          <input
            type="checkbox"
            checked={state.currentItemShapeRecognition}
            onChange={(event) =>
              setState({ currentItemShapeRecognition: event.target.checked })
            }
          />
          {t("handwriting.shapeRecognition")}
        </label>
        <p className="handwriting-brush-panel__hint">
          {t("handwriting.shapeRecognitionHint")}
        </p>
        {slider(
          t("handwriting.holdDelay"),
          state.currentItemShapeRecognitionDelay,
          0.5,
          3,
          0.1,
          (value) => setState({ currentItemShapeRecognitionDelay: value }),
          !state.currentItemShapeRecognition,
        )}
      </div>

      {persistWarning && (
        <p role="status" className="handwriting-brush-panel__warning">
          {t("handwriting.presetsNotPersisted")}
        </p>
      )}
    </div>
  );
};
