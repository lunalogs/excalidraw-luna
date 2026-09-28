import { useAtomValue } from "../editor-jotai";
import { useI18n } from "../i18n";

import { useApp } from "./App";

import { handwritingRestoreAtom } from "./HandwritingShapeCommit";

import "./HandwritingRestore.scss";

/**
 * "Restore hand-drawn" affordance (SH-06): shown for ~5 seconds after a
 * hold-to-shape commit while the original stroke can be swapped back. Only
 * renders for the editor instance that owns the commit (R6: the atom store
 * is shared, so multi-editor pages must not show each other's button).
 */
export const HandwritingRestoreButton = ({ appId }: { appId: string }) => {
  const commits = useAtomValue(handwritingRestoreAtom);
  const app = useApp();
  const { t } = useI18n();
  const commit = commits[appId];

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
