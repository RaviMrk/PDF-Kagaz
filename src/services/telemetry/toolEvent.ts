import { isImagesRequest, type ToolOutcome, type ToolRequest } from '@/services/tools/runTool';
import type { ToolFailure } from '@/services/tools/toolJobRepo';
import type { RunnableToolId } from '@/services/tools/toolRegistry';

export type PagesBucket = '0' | '1-10' | '11-50' | '51-200' | '200+';

/**
 * The only analytics event. A closed schema of enums and numbers: never a file name, path, URI,
 * typed text or error message.
 */
export type ToolEvent = {
  name: 'tool_finished';
  params: {
    tool: RunnableToolId;
    result: 'success' | 'failed' | 'cancelled';
    failure: ToolFailure | 'none';
    duration_ms: number;
    inputs: number;
    pages_bucket: PagesBucket;
  };
};

function pagesBucket(pages: number): PagesBucket {
  if (pages <= 0) return '0';
  if (pages <= 10) return '1-10';
  if (pages <= 50) return '11-50';
  if (pages <= 200) return '51-200';
  return '200+';
}

/** Pages written by a job: the sum of its outputs' page counts (unknown counts as 0). */
export function pagesOf(outcome: ToolOutcome): number {
  return outcome.outputs.reduce((sum, row) => sum + (row.pageCount ?? 0), 0);
}

export function toolFinishedEvent(
  request: ToolRequest,
  outcome: ToolOutcome,
  durationMs: number,
  pages: number,
): ToolEvent {
  const cancelled = !outcome.ok && outcome.failure === 'cancelled';
  return {
    name: 'tool_finished',
    params: {
      tool: request.toolId,
      result: outcome.ok ? 'success' : cancelled ? 'cancelled' : 'failed',
      failure: outcome.ok || cancelled ? 'none' : outcome.failure,
      duration_ms: Math.max(0, Math.round(durationMs / 100) * 100),
      inputs: isImagesRequest(request) ? request.images.length : request.inputIds.length,
      pages_bucket: pagesBucket(pages),
    },
  };
}
