/**
 * Document-level command coordinator (0047-R5, SPEC N17).
 *
 * ONE ordered history stack for the whole hybrid document — ink commands,
 * graphics commands and (in the native shell) web-originated transactions
 * are all entries in a single sequence. Undo walks the sequence in reverse
 * chronological order regardless of which subsystem produced the entry:
 * ink move → graphics rect → undo MUST undo the rect first. Two
 * independent per-subsystem stacks cannot express that; this can.
 *
 * Every user action is exactly one entry. Entries are pairs of closures
 * owned by their subsystem — the coordinator only orders them.
 */

export type HistoryEntryKind = "ink" | "graphics";

export interface DocumentHistoryEntry {
  kind: HistoryEntryKind;
  label: string;
  undo: () => void;
  redo: () => void;
}

export interface HistoryDepth {
  undo: number;
  redo: number;
}

export class DocumentHistory {
  private undoStack: DocumentHistoryEntry[] = [];
  private redoStack: DocumentHistoryEntry[] = [];

  /** a new entry invalidates the redo branch (standard history semantics) */
  push(entry: DocumentHistoryEntry): void {
    this.undoStack.push(entry);
    this.redoStack = [];
  }

  depth(): HistoryDepth {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
  }

  peekUndo(): DocumentHistoryEntry | null {
    return this.undoStack.length > 0
      ? this.undoStack[this.undoStack.length - 1]
      : null;
  }

  /** Returns the undone entry (for UI labels/kind), or null when empty. */
  undo(): DocumentHistoryEntry | null {
    const entry = this.undoStack.pop();
    if (!entry) {
      return null;
    }
    entry.undo();
    this.redoStack.push(entry);
    return entry;
  }

  /** Returns the redone entry, or null when empty. */
  redo(): DocumentHistoryEntry | null {
    const entry = this.redoStack.pop();
    if (!entry) {
      return null;
    }
    entry.redo();
    this.undoStack.push(entry);
    return entry;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
