import { useAtomValue } from "../editor-jotai";
import { useI18n } from "../i18n";

import { useApp } from "./App";

import { handwritingRestoreAtom } from "./HandwritingShapeCommit";

import "./HandwritingRestore.scss";

/**
 * "Restore hand-drawn" affordance (SH-06): shown for ~5 seconds after a
 * hold-to-shape commit while the original stroke can be swapped back.
 */
export const HandwritingRestoreButton = () => {
  const commit = useAtomValue(handwritingRestoreAtom);
  const app = useApp();
  const { t } = useI18n();

  if (!commit) {
    return null;
  }

  return (
    <button
      type="button"
      className="handwriting-restore-button"
      onClick={() => app.restoreHandDrawn()}
    >
      {t("handwriting.restoreHandDrawn")}
    </button>
  );
};
