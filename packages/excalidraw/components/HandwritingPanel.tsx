import { useEffect, useRef, useState } from "react";

import { MIME_TYPES } from "@excalidraw/common";

import { actionLoadScene } from "../actions/actionExport";
import { prepareDataForJSONExport } from "../actions/actionExport";
import { fileSave } from "../data/filesystem";
import { serializeAsJSON } from "../data/json";
import { useI18n } from "../i18n";

import {
  useApp,
  useExcalidrawActionManager,
  useExcalidrawAppState,
  useExcalidrawSetAppState,
} from "./App";
import { openConfirmModal } from "./OverwriteConfirm/OverwriteConfirmState";

import "./HandwritingPanel.scss";

export const HandwritingPanel = () => {
  const app = useApp();
  const state = useExcalidrawAppState();
  const setState = useExcalidrawSetAppState();
  const actions = useExcalidrawActionManager();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const exportController = useRef<AbortController | null>(null);
  useEffect(() => () => exportController.current?.abort(), []);
  const erasing = state.activeTool.type === "eraser";

  const reportError = (error: unknown) => {
    if (error instanceof Error && error.name === "AbortError") {
      return;
    }
    setMessage(t("handwriting.fileError"));
  };

  const prepareExport = async () => {
    setBusy(true);
    setMessage("");
    setPrepared(null);
    const job = prepareDataForJSONExport(
      app.scene.getNonDeletedElements(),
      state,
      app.files,
      app,
    );
    exportController.current = job.abortController;
    try {
      const data = await job.data;
      if (job.abortController.signal.aborted) {
        return;
      }
      if (
        data.elements.some(
          (element) =>
            element.type === "image" &&
            (!element.fileId || !data.files[element.fileId]?.dataURL),
        )
      ) {
        setMessage(t("handwriting.missingImages"));
        return;
      }
      setPrepared(
        new File(
          [serializeAsJSON(data.elements, data.appState, data.files, "local")],
          `${app.getName()}.excalidraw`,
          { type: MIME_TYPES.excalidraw },
        ),
      );
    } catch (error) {
      reportError(error);
    } finally {
      if (!job.abortController.signal.aborted) {
        setBusy(false);
        setState({ toast: null });
      }
      job.abortController.abort();
    }
  };

  const openFile = async () => {
    if (
      app.scene.getNonDeletedElements().length &&
      !(await openConfirmModal({
        title: t("overwriteConfirm.modal.loadFromFile.title"),
        actionLabel: t("overwriteConfirm.modal.loadFromFile.button"),
        color: "warning",
        description: t("handwriting.replaceWarning"),
      }))
    ) {
      return;
    }
    setPrepared(null);
    actions.executeAction(actionLoadScene);
  };

  const canShare = prepared && !!navigator.canShare?.({ files: [prepared] });

  return (
    <div className="handwriting-panel">
      <button
        type="button"
        className="handwriting-panel__toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {t("handwriting.title")} {open ? "−" : "+"}
      </button>
      {open && (
        <div className="handwriting-panel__body">
          <div
            className="handwriting-panel__row"
            role="group"
            aria-label={t("handwriting.brush")}
          >
            {(["standard", "fountain", "highlighter"] as const).map((brush) => (
              <button
                type="button"
                key={brush}
                aria-pressed={
                  state.activeTool.type === "freedraw" &&
                  state.currentItemBrush === brush
                }
                onClick={() => {
                  setState({
                    currentItemBrush: brush,
                    currentItemStrokeWidth: brush === "highlighter" ? 6 : 1,
                    currentItemStrokeColor:
                      brush === "highlighter" ? "#fab005" : "#1b1b1f",
                  });
                  app.setActiveTool({ type: "freedraw" });
                }}
              >
                {t(`handwriting.${brush}`)}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={erasing}
              title={t("handwriting.eraserHint")}
              onClick={() =>
                app.setActiveTool({ type: erasing ? "freedraw" : "eraser" })
              }
            >
              {erasing ? t("handwriting.backToPen") : t("handwriting.eraser")}
            </button>
          </div>
          <div className="handwriting-panel__row">
            <label className="handwriting-panel__width">
              {t("handwriting.width")}{" "}
              <output>{state.currentItemStrokeWidth}</output>
              <input
                type="range"
                aria-label={t("handwriting.width")}
                min="0.25"
                max="12"
                step="0.25"
                value={state.currentItemStrokeWidth}
                onChange={(event) =>
                  setState({
                    currentItemStrokeWidth: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              {t("handwriting.color")}
              <input
                type="color"
                aria-label={t("handwriting.color")}
                value={
                  /^#[\da-f]{6}$/i.test(state.currentItemStrokeColor)
                    ? state.currentItemStrokeColor
                    : "#1b1b1f"
                }
                onChange={(event) =>
                  setState({ currentItemStrokeColor: event.target.value })
                }
              />
            </label>
          </div>
          <label className="handwriting-panel__pen-mode">
            <input
              type="checkbox"
              checked={state.penMode}
              onChange={(event) => setState({ penMode: event.target.checked })}
            />
            {t("handwriting.penOnly")}
          </label>
          <p>{t("handwriting.gestures")}</p>
          <p>{t("handwriting.pencilTap")}</p>
          <div className="handwriting-panel__row">
            {actions.isActionEnabled(actionLoadScene) && (
              <button type="button" disabled={busy} onClick={openFile}>
                {t("handwriting.open")}
              </button>
            )}
            <button type="button" disabled={busy} onClick={prepareExport}>
              {busy ? t("handwriting.preparing") : t("handwriting.export")}
            </button>
          </div>
          {prepared && (
            <div className="handwriting-panel__export">
              <p>{t("handwriting.snapshot")}</p>
              <div className="handwriting-panel__row">
                {canShare && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await navigator.share({ files: [prepared] });
                        setMessage(t("handwriting.shared"));
                      } catch (error) {
                        reportError(error);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {t("handwriting.saveToFiles")}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await fileSave(prepared, {
                        name: prepared.name.replace(/\.excalidraw$/, ""),
                        extension: "excalidraw",
                        description: "Excalidraw",
                      });
                      setMessage(t("handwriting.downloaded"));
                    } catch (error) {
                      reportError(error);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t("handwriting.download")}
                </button>
              </div>
            </div>
          )}
          <p>{t("handwriting.storageHint")}</p>
          <div role="status" aria-live="polite">
            {message}
          </div>
        </div>
      )}
    </div>
  );
};
