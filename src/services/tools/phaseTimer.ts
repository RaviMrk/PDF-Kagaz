export type ToolPhaseName = 'stage' | 'prepare' | 'read' | 'embed' | 'save' | 'publish';

const PHASES: readonly ToolPhaseName[] = ['stage', 'prepare', 'read', 'embed', 'save', 'publish'];

export type PhaseTimer = {
  /** Runs `fn` and adds its time to `phase` (also when it rejects). */
  time<T>(phase: ToolPhaseName, fn: () => Promise<T>): Promise<T>;
  totals(): Record<ToolPhaseName, number>;
};

/**
 * Wall-clock time per tool phase. A phase timed while another one runs (a read inside pdf-lib
 * work) counts for itself only and is left out of the outer phase. Timed work runs one at a time.
 */
export function createPhaseTimer(now: () => number): PhaseTimer {
  const totals = Object.fromEntries(PHASES.map((p) => [p, 0])) as Record<ToolPhaseName, number>;
  // Time spent in phases nested inside each running phase, innermost last.
  const nested: number[] = [];
  return {
    async time(phase, fn) {
      const start = now();
      nested.push(0);
      try {
        return await fn();
      } finally {
        const elapsed = now() - start;
        const inner = nested.pop() ?? 0;
        totals[phase] += elapsed - inner;
        if (nested.length > 0) nested[nested.length - 1]! += elapsed;
      }
    },
    totals: () => ({ ...totals }),
  };
}

/** One log line: counts and milliseconds only, never names or paths. */
export function formatPhases(toolId: string, totals: Record<ToolPhaseName, number>): string {
  const parts = PHASES.map((p) => `${p}=${Math.round(totals[p])}ms`);
  return `[tool-phases] ${toolId} ${parts.join(' ')}`;
}
