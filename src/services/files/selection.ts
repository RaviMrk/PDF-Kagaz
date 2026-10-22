import type { FileRow } from '@/db/schema';
import { checkInputSizes } from '@/services/tools/limits';
import { knownSize } from '@/services/tools/toolFailure';
import { toolById } from '@/services/tools/toolRegistry';

export type SelectionActions = { merge: boolean; split: boolean; organize: boolean };

/** Adds the id at the end (tap order matters for merge) or removes it when present. */
export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** Drops ids without a visible row; returns the same array when nothing changed. */
export function pruneSelection(ids: readonly string[], visible: readonly FileRow[]): string[] {
  const known = new Set(visible.map((r) => r.id));
  const kept = ids.filter((id) => known.has(id));
  return kept.length === ids.length ? (ids as string[]) : kept;
}

function fits(toolId: string, rows: readonly FileRow[]): boolean {
  const tool = toolById(toolId);
  if (!tool || rows.length < tool.minInputs || rows.length > tool.maxInputs) return false;
  return checkInputSizes(rows.map((r) => knownSize(r.sizeBytes))).ok;
}

/** Which tools the current selection can launch; mirrors the tool flow's own limits. */
export function selectionActions(rows: readonly FileRow[]): SelectionActions {
  return {
    merge: fits('merge', rows),
    split: fits('split', rows),
    organize: fits('organize', rows),
  };
}
