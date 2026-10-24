import type { FileRow } from '@/db/schema';

import { capsFor, checkInputSizes, JS_CAPS, TOOL_ENGINE, type Caps } from './limits';
import { knownSize } from './toolFailure';
import type { RunnableToolId, ToolDef } from './toolRegistry';

export type FlowState = { step: 'pick' | 'options'; selectedIds: string[] };

const FILE_ID = /^[0-9a-f]{16}$/;

/** Prefilled inputs open the options step when their count fits the tool; otherwise pick. */
export function initialFlow(tool: ToolDef, inputIds: string[]): FlowState {
  const ids = [...new Set(inputIds)];
  if (ids.length >= tool.minInputs && ids.length <= tool.maxInputs) {
    return { step: 'options', selectedIds: ids };
  }
  return { step: 'pick', selectedIds: ids.slice(0, tool.maxInputs) };
}

/** Single-input tools replace the selection; others add up to `maxInputs`. */
export function toggleSelection(state: FlowState, id: string, tool: ToolDef): FlowState {
  const { selectedIds } = state;
  if (selectedIds.includes(id)) {
    return { ...state, selectedIds: selectedIds.filter((s) => s !== id) };
  }
  if (tool.maxInputs === 1) return { ...state, selectedIds: [id] };
  if (selectedIds.length >= tool.maxInputs) return state;
  return { ...state, selectedIds: [...selectedIds, id] };
}

/** The size caps the pick step applies for `tool` (a tool that cannot run yet: the JS caps). */
export function pickCaps(tool: ToolDef): Caps {
  return tool.id in TOOL_ENGINE ? capsFor(tool.id as RunnableToolId) : JS_CAPS;
}

/** The selection fits the tool's count and its size caps; every id needs a row. */
export function canContinue(state: FlowState, tool: ToolDef, rows: FileRow[]): boolean {
  const n = state.selectedIds.length;
  if (n < tool.minInputs || n > tool.maxInputs) return false;
  const sizes: number[] = [];
  for (const id of state.selectedIds) {
    const row = rows.find((r) => r.id === id);
    if (!row) return false;
    sizes.push(knownSize(row.sizeBytes));
  }
  return checkInputSizes(sizes, pickCaps(tool)).ok;
}

/**
 * Keeps only selected ids that still have a row (a file can be deleted or dropped as missing
 * while the flow is open); options with nothing left falls back to pick.
 */
export function pruneFlow(state: FlowState, rows: readonly FileRow[]): FlowState {
  const known = new Set(rows.map((r) => r.id));
  const selectedIds = state.selectedIds.filter((id) => known.has(id));
  if (selectedIds.length === state.selectedIds.length) return state;
  return { step: selectedIds.length > 0 ? state.step : 'pick', selectedIds };
}

/** `inputs` route param: comma-separated file ids; anything else is dropped. */
export function parseInputsParam(param: string | string[] | undefined): string[] {
  if (param === undefined) return [];
  const parts = (Array.isArray(param) ? param : [param]).flatMap((p) => p.split(','));
  return [...new Set(parts.map((p) => p.trim()).filter((p) => FILE_ID.test(p)))];
}
