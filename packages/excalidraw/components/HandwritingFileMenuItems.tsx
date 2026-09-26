import { useRef, useState } from "react";

import { MIME_TYPES } from "@excalidraw/common";

import {
  actionLoadScene,
  prepareDataForJSONExport,
} from "../actions/actionExport";
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

/**
 * Editable-file workflow for handwriting documents (SPEC UI-05).
 *
 * Extracted from the former bottom-left HandwritingPanel so the actions can
 * live in the main menu and stay reachable regardless of the active tool.
 * Reuses the existing file picker, replace confirmation, embedded-image
 * preparation and share/download fallbacks — no second serialization format.
 */
export const useHandwritingFileActions = () => {
  const app = useApp();
  const state = useExcalidrawAppState();
  const setState = useExcalidrawSetAppState();
  const actions = useExcalidrawActionManager();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const exportController = useRef<AbortController | null>(null);
  // NOTE: no abort-on-unmount here — menu items unmount right after the menu
  // closes, which would cancel the in-flight export. The controller is
  // aborted in `finally` once the export settles.

  const showToast = (message: string) => {
    setState({ toast: { message } });
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
    actions.executeAction(actionLoadScene);
  };

  const exportFile = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
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
        showToast(t("handwriting.missingImages"));
        return;
      }
      const prepared = new File(
        [serializeAsJSON(data.elements, data.appState, data.files, "local")],
        `${app.getName()}.excalidraw`,
        { type: MIME_TYPES.excalidraw },
      );
      if (navigator.canShare?.({ files: [prepared] })) {
        try {
          await navigator.share({ files: [prepared] });
          showToast(t("handwriting.shared"));
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          showToast(t("handwriting.fileError"));
        }
      } else {
        try {
          await fileSave(prepared, {
            name: prepared.name.replace(/\.excalidraw$/, ""),
            extension: "excalidraw",
            description: "Excalidraw",
          });
          showToast(t("handwriting.downloaded"));
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          showToast(t("handwriting.fileError"));
        }
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        showToast(t("handwriting.fileError"));
      }
    } finally {
      if (!job.abortController.signal.aborted) {
        setBusy(false);
      }
      job.abortController.abort();
    }
  };

  return { openFile, exportFile, busy };
};
