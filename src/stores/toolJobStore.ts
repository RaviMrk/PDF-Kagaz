import { create } from 'zustand';

import { getDb } from '@/db/client';
import type { ToolJobRow } from '@/db/schema';
import type { IndexDb } from '@/services/index/fileIndexRepo';
import { reviewPrompt } from '@/services/review/reviewPrompt';
import { pdfNative, type ImageFilter } from '@/services/native/pdfNative';
import { getSignature } from '@/services/signatures/signatureRepo';
import { isImageLayout } from '@/services/pdf/imageLayout';
import type { PageEdit } from '@/services/pdf/organize';
import type { Translate } from '@/services/tools/outputNames';
import { jobNotice, type JobNoticeHooks } from '@/services/tools/jobNotice';
import {
  isImagesRequest,
  runTool,
  sessionIdOf,
  type CompressLevel,
  type ExportDpi,
  type ImageFormat,
  type ImagesRequest,
  type PageNumberOptions,
  type SignaturePlacement,
  type SplitOptions,
  type StampPosition,
  type WatermarkOptions,
  type ToolOutcome,
  type ToolPhase,
  type ToolRequest,
  type ToolRunDeps,
} from '@/services/tools/runTool';
import { IMAGE_QUALITIES } from '@/services/tools/limits';
import { expoToolFs, signaturesDirUri } from '@/services/tools/toolFs';
import { telemetry } from '@/services/telemetry/telemetry';
import { pagesOf, toolFinishedEvent } from '@/services/telemetry/toolEvent';
import {
  createJob,
  finishJob,
  getJob,
  recordJobOutput,
  type JobResult,
  type ToolFailure,
} from '@/services/tools/toolJobRepo';
import type { RunnableToolId } from '@/services/tools/toolRegistry';
import { useFiles } from '@/stores/filesStore';

export type ActiveJob = {
  jobId: string;
  toolId: RunnableToolId;
  phase: ToolPhase;
  fraction: number;
};
export type FinishedJob = {
  jobId: string;
  toolId: RunnableToolId;
  inputIds: string[];
  outcome: ToolOutcome;
  seen: boolean;
  /**
   * The request this process ran (retry reuses it: an image job's typed name is never stored).
   * Absent for a job recovered from a previous process.
   */
  request?: ToolRequest;
  /** Interrupted by a process death and loaded from its row: outcomeOf re-reads the row. */
  recovered?: true;
  /** `request` held passwords and was dropped on dismiss: a retry needs them typed again. */
  passwordsDropped?: true;
};
/**
 * `gone`: an image job from another process; its image session no longer exists. `needsInput`: a
 * password tool's row (its password is never stored): the user starts the tool again.
 */
export type StartResult =
  { ok: true; jobId: string } | { ok: false; reason: 'busy' | 'db' | 'gone' | 'needsInput' };
export type JobView =
  | { kind: 'running'; job: ActiveJob }
  | { kind: 'done'; toolId: RunnableToolId; outcome: ToolOutcome }
  | { kind: 'missing' };

export type ToolJobsState = {
  active: ActiveJob | null;
  last: FinishedJob | null;
  /** `t` is the caller's useTranslation().t (output names); one job at a time. */
  start(request: ToolRequest, t: Translate): StartResult;
  cancel(): void;
  retry(jobId: string, t: Translate): StartResult;
  outcomeOf(jobId: string): JobView;
  markSeen(jobId: string): void;
  /**
   * Startup only: surfaces a job a process death interrupted (Home card, result screen). Never
   * replaces a job of this process. Errors are ignored.
   */
  recoverInterrupted(jobId: string): void;
  /**
   * The user left the result of `jobId` (Done / Close) without retrying: a failed or cancelled
   * image job's kept session is deleted, and a later retry reports `gone`. The request's passwords
   * (`passwords`, Protect's `newPassword`) leave memory; a later retry reports `needsInput`.
   */
  dismiss(jobId: string): void;
  /**
   * The result of `jobId` closed without Done / Close (system back): the request's passwords leave
   * memory (a later retry reports `needsInput`); the job, and an image job's session, are kept.
   */
  forgetPasswords(jobId: string): void;
  /** Name of the input a failure points at (this process's last job only); null when unknown. */
  inputNameOf(jobId: string, inputIndex: number | null): string | null;
};

export type ToolJobStoreDeps = {
  getDb: () => IndexDb;
  run: typeof runTool;
  /** Everything but recordOutput, which the store writes to the job row itself. */
  runDeps: (t: Translate) => Omit<ToolRunDeps, 'recordOutput'>;
  now: () => number;
  random: () => number;
  /** Deletes an image session (after its job succeeded); errors are ignored. */
  cleanSession: (sessionId: string) => Promise<void>;
  /** Told about every job this process finishes (telemetry); errors are ignored. */
  onJobFinished?: (request: ToolRequest, outcome: ToolOutcome, durationMs: number) => void;
  /** Background notice (foreground service + notifications); each call's errors are ignored. */
  notice?: JobNoticeHooks;
};

const PROGRESS_INTERVAL_MS = 100;

const FAILURES: readonly ToolFailure[] = [
  'notFound',
  'unavailable',
  'permission',
  'encrypted',
  'invalid',
  'tooLarge',
  'totalTooLarge',
  'tooManyPages',
  'badPages',
  'io',
  'cancelled',
  'interrupted',
  'imagesGone',
  'imageInvalid',
  'wrongPassword',
  'restricted',
  'signatureGone',
  'notProtected',
  'outOfMemory',
  'unknown',
];

/**
 * Options stored with a job: no ids or names (an image job's typed name is not stored) and never a
 * password (`passwords`, Protect's `newPassword`).
 */
export function optionsOf(request: ToolRequest): Record<string, unknown> {
  if (isImagesRequest(request)) {
    const { sessionId, images, filter, layout, quality } = request;
    return { sessionId, images, filter, layout, quality };
  }
  switch (request.toolId) {
    case 'split':
      return { split: request.split };
    case 'organize':
      return { pages: request.pages };
    case 'compress':
      return { level: request.level };
    case 'pdf-to-images':
      return { format: request.format, dpi: request.dpi, pages: request.pages };
    case 'watermark':
      return { watermark: request.watermark };
    case 'page-numbers':
      return { numbers: request.numbers };
    case 'sign':
      return { placements: request.placements };
    default:
      return {};
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function splitFrom(v: unknown): SplitOptions | null {
  if (!isRecord(v)) return null;
  if ((v.mode === 'ranges' || v.mode === 'extract') && typeof v.ranges === 'string') {
    return { mode: v.mode, ranges: v.ranges };
  }
  if (v.mode === 'everyN' && Number.isInteger(v.n) && (v.n as number) >= 1) {
    return { mode: 'everyN', n: v.n as number };
  }
  return null;
}

function pagesFrom(v: unknown): PageEdit[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const pages: PageEdit[] = [];
  for (const p of v) {
    if (!isRecord(p) || !Number.isInteger(p.source) || (p.source as number) < 1) return null;
    if (p.rotate !== 0 && p.rotate !== 90 && p.rotate !== 180 && p.rotate !== 270) return null;
    pages.push({ source: p.source as number, rotate: p.rotate });
  }
  return pages;
}

const SESSION_ID = /^img-[a-z0-9-]{1,60}$/;

const oneOf = <T>(values: readonly T[], v: unknown): T | undefined => values.find((x) => x === v);
const isPage = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1;
const isFraction = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** null (all pages) or a non-empty list of 1-based pages; undefined when malformed. */
function pageListFrom(v: unknown): number[] | null | undefined {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length === 0 || !v.every(isPage)) return undefined;
  return [...(v as number[])];
}

const LEVELS: readonly CompressLevel[] = ['low', 'medium', 'high'];
const FORMATS: readonly ImageFormat[] = ['jpg', 'png'];
const DPIS: readonly ExportDpi[] = [72, 150, 300];
const POSITIONS: readonly StampPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];
const NUMBER_POSITIONS: readonly PageNumberOptions['position'][] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];
const ANGLES: readonly WatermarkOptions['angle'][] = [0, 45, 90, -45];
const STAMP_SIZES: readonly WatermarkOptions['size'][] = ['small', 'medium', 'large'];
const COLORS = ['grey', 'red', 'blue'] as const;
const FONT_SIZES: readonly PageNumberOptions['fontSize'][] = [10, 12, 14, 18];
const MAX_PLACEMENTS = 50;

function watermarkFrom(v: unknown): WatermarkOptions | null {
  if (!isRecord(v) || !isRecord(v.source)) return null;
  const src = v.source;
  let source: WatermarkOptions['source'];
  if (src.kind === 'text') {
    const color = oneOf(COLORS, src.color);
    if (typeof src.text !== 'string' || src.text.trim() === '' || !color) return null;
    source = { kind: 'text', text: src.text, color };
  } else if (src.kind === 'image') {
    if (typeof src.sessionId !== 'string' || !SESSION_ID.test(src.sessionId)) return null;
    if (!Number.isInteger(src.index) || (src.index as number) < 0) return null;
    source = { kind: 'image', sessionId: src.sessionId, index: src.index as number };
  } else {
    return null;
  }
  const angle = oneOf(ANGLES, v.angle);
  const size = oneOf(STAMP_SIZES, v.size);
  const position = oneOf(POSITIONS, v.position);
  const pages = pageListFrom(v.pages);
  if (!isFraction(v.opacity) || v.opacity === 0) return null;
  if (angle === undefined || !size || !position || pages === undefined) return null;
  return { source, opacity: v.opacity, angle, size, position, pages };
}

function numbersFrom(v: unknown): PageNumberOptions | null {
  if (!isRecord(v)) return null;
  const position = oneOf(NUMBER_POSITIONS, v.position);
  const format = oneOf(['n', 'pageOfTotal'] as const, v.format);
  const fontSize = oneOf(FONT_SIZES, v.fontSize);
  const pages = pageListFrom(v.pages);
  if (!position || !format || !fontSize || pages === undefined) return null;
  if (!Number.isInteger(v.start) || (v.start as number) < 1 || (v.start as number) > 9999) {
    return null;
  }
  return { position, format, start: v.start as number, fontSize, pages };
}

function placementsFrom(v: unknown): SignaturePlacement[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_PLACEMENTS) return null;
  const placements: SignaturePlacement[] = [];
  for (const p of v) {
    if (!isRecord(p) || !isPage(p.signatureId) || !isPage(p.page)) return null;
    if (!isFraction(p.cx) || !isFraction(p.cy) || !isFraction(p.width) || p.width === 0) {
      return null;
    }
    placements.push({
      signatureId: p.signatureId,
      page: p.page,
      cx: p.cx,
      cy: p.cy,
      width: p.width,
    });
  }
  return placements;
}
const FILTERS: readonly ImageFilter[] = ['colour', 'greyscale', 'bw'];

function imagesFrom(row: ToolJobRow): ImagesRequest | null {
  if (row.toolId !== 'images-to-pdf' && row.toolId !== 'scan') return null;
  const { sessionId, images, filter, layout, quality } = row.options;
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return null;
  if (!Array.isArray(images) || images.length === 0) return null;
  if (!images.every((i) => Number.isInteger(i) && (i as number) >= 0)) return null;
  const f = FILTERS.find((x) => x === filter);
  if (f === undefined || !isImageLayout(layout)) return null;
  return {
    toolId: row.toolId,
    inputIds: [],
    sessionId,
    images: [...(images as number[])],
    filter: f,
    layout: { pageSize: layout.pageSize, orientation: layout.orientation, margin: layout.margin },
    name: null,
    quality: IMAGE_QUALITIES.find((q) => q === quality) ?? 'standard',
  };
}

/** The request a stored job ran with; null for a row that cannot be run again. */
export function requestFromJob(row: ToolJobRow): ToolRequest | null {
  if (row.toolId === 'images-to-pdf' || row.toolId === 'scan') return imagesFrom(row);
  const ids = row.inputIds;
  if (row.toolId === 'merge')
    return ids.length >= 2 ? { toolId: 'merge', inputIds: [...ids] } : null;
  const [only] = ids;
  if (ids.length !== 1 || only === undefined) return null;
  if (row.toolId === 'split') {
    const split = splitFrom(row.options.split);
    return split ? { toolId: 'split', inputIds: [only], split } : null;
  }
  if (row.toolId === 'organize') {
    const pages = pagesFrom(row.options.pages);
    return pages ? { toolId: 'organize', inputIds: [only], pages } : null;
  }
  const o = row.options;
  switch (row.toolId) {
    case 'compress': {
      const level = oneOf(LEVELS, o.level);
      return level ? { toolId: 'compress', inputIds: [only], level } : null;
    }
    case 'pdf-to-images': {
      const format = oneOf(FORMATS, o.format);
      const dpi = oneOf(DPIS, o.dpi);
      const pages = pageListFrom(o.pages);
      if (!format || !dpi || pages === undefined) return null;
      return { toolId: 'pdf-to-images', inputIds: [only], format, dpi, pages };
    }
    case 'watermark': {
      const watermark = watermarkFrom(o.watermark);
      return watermark ? { toolId: 'watermark', inputIds: [only], watermark } : null;
    }
    case 'page-numbers': {
      const numbers = numbersFrom(o.numbers);
      return numbers ? { toolId: 'page-numbers', inputIds: [only], numbers } : null;
    }
    case 'sign': {
      const placements = placementsFrom(o.placements);
      return placements ? { toolId: 'sign', inputIds: [only], placements } : null;
    }
    default:
      // Protect and unlock need a typed password: never rebuilt.
      return null;
  }
}

/** Failures only a typed password can fix: "Try again" asks for it instead of running. */
const PASSWORD_FAILURES: readonly ToolFailure[] = ['encrypted', 'wrongPassword', 'restricted'];

/** Tools whose stored rows cannot run again without a password the user types. */
const NEEDS_PASSWORD: ReadonlySet<string> = new Set(['protect', 'unlock']);

/** Job ids are also workspace directory names: `[a-z0-9-]` only. */
export function newJobId(now: number, random: () => number): string {
  const n = Math.min(36 ** 6 - 1, Math.max(0, Math.floor(random() * 36 ** 6)));
  return `${Math.max(0, Math.floor(now)).toString(36)}-${n.toString(36).padStart(6, '0')}`;
}

const RUNNABLE: readonly RunnableToolId[] = [
  'merge',
  'split',
  'organize',
  'images-to-pdf',
  'scan',
  'compress',
  'protect',
  'unlock',
  'pdf-to-images',
  'watermark',
  'page-numbers',
  'sign',
];

function runnable(toolId: string): RunnableToolId | null {
  return RUNNABLE.find((id) => id === toolId) ?? null;
}

function resultOf(request: ToolRequest, outcome: ToolOutcome, now: number): JobResult {
  const outputIds = outcome.outputs.map((r) => r.id);
  if (outcome.ok) {
    // PDF to images saves gallery images, not indexed PDFs: the first image stands for them.
    const outputUri =
      request.toolId === 'pdf-to-images'
        ? (outcome.extras?.images?.uris[0] ?? null)
        : (outcome.outputs[0]?.uri ?? null);
    return { status: 'succeeded', outputIds, outputUri, now };
  }
  if (outcome.failure === 'cancelled') return { status: 'cancelled', outputIds, now };
  return { status: 'failed', error: outcome.failure, outputIds, now };
}

/** Whether `request` holds a password (`passwords`, Protect's `newPassword`). */
function holdsPassword(request: ToolRequest): boolean {
  if (isImagesRequest(request)) return false;
  return request.passwords !== undefined || request.toolId === 'protect';
}

/**
 * The image session `last` keeps for "Try again" (a failed or cancelled job that reads one: images,
 * scan, an image watermark), else null.
 */
function keptSession(last: FinishedJob | null): string | null {
  const request = last?.request;
  if (!last || last.outcome.ok || !request) return null;
  return sessionIdOf(request);
}

export function createToolJobStore(deps: ToolJobStoreDeps) {
  return create<ToolJobsState>()((set, get) => {
    let controller: AbortController | null = null;
    /** The request of the running job (its session must never be deleted under it). */
    let running: ToolRequest | null = null;

    function cleanSession(sessionId: string) {
      try {
        deps.cleanSession(sessionId).catch(() => {});
      } catch {
        // Left for cleanupToolLeftovers at the next start.
      }
    }

    /** Calls a notice hook; a notice never affects a job. */
    function tellNotice(call: (notice: JobNoticeHooks) => void) {
      if (!deps.notice) return;
      try {
        call(deps.notice);
      } catch {
        // Ignored.
      }
    }

    function finish(
      jobId: string,
      request: ToolRequest,
      outcome: ToolOutcome,
      startedAt: number,
      t: Translate,
    ) {
      try {
        finishJob(deps.getDb(), jobId, resultOf(request, outcome, deps.now()));
      } catch {
        // The row stays running and is marked interrupted at the next start.
      }
      // Only a confirmed missing input drops its row; other failures keep it.
      if (!outcome.ok && outcome.failure === 'notFound' && outcome.inputIndex !== null) {
        const id = request.inputIds[outcome.inputIndex];
        if (id !== undefined) useFiles.getState().dropMissing(id);
      }
      // The session is kept after a failure or cancel, so "Try again" can use it in this process.
      const session = sessionIdOf(request);
      if (outcome.ok && session !== null) cleanSession(session);
      // The job this one replaces as `last` can no longer be retried: its kept session goes.
      const previous = keptSession(get().last);
      if (previous !== null && previous !== session) cleanSession(previous);
      controller = null;
      running = null;
      set({
        active: null,
        last: {
          jobId,
          toolId: request.toolId,
          inputIds: [...request.inputIds],
          outcome,
          seen: false,
          request,
        },
      });
      tellNotice((n) => n.finished(jobId, request.toolId, outcome, t));
      try {
        deps.onJobFinished?.(request, outcome, deps.now() - startedAt);
      } catch {
        // Telemetry never affects a job.
      }
    }

    function start(request: ToolRequest, t: Translate): StartResult {
      if (get().active) return { ok: false, reason: 'busy' };
      const startedAt = deps.now();
      const jobId = newJobId(startedAt, deps.random);
      try {
        createJob(deps.getDb(), {
          id: jobId,
          toolId: request.toolId,
          inputIds: request.inputIds,
          options: optionsOf(request),
          now: deps.now(),
        });
      } catch {
        return { ok: false, reason: 'db' };
      }
      const ac = new AbortController();
      controller = ac;
      running = request;
      set({ active: { jobId, toolId: request.toolId, phase: 'preparing', fraction: 0 } });
      // While the app is in the foreground (the user just started the job): a foreground service
      // may not be started from the background.
      tellNotice((n) => n.started(jobId, request.toolId, t));

      let appliedAt = Number.NEGATIVE_INFINITY;
      const onProgress = (phase: ToolPhase, fraction: number) => {
        const active = get().active;
        if (active?.jobId !== jobId) return;
        const now = deps.now();
        if (phase === active.phase && now - appliedAt < PROGRESS_INTERVAL_MS) return;
        appliedAt = now;
        set({ active: { ...active, phase, fraction } });
        tellNotice((n) => n.progress(jobId, fraction));
      };

      // Started synchronously: picked documents carry a transient grant, so staging must not wait.
      void (async () => {
        let outcome: ToolOutcome;
        try {
          const runDeps: ToolRunDeps = {
            ...deps.runDeps(t),
            recordOutput: (id, info) => recordJobOutput(deps.getDb(), id, info),
          };
          outcome = await deps.run(jobId, request, runDeps, {
            signal: ac.signal,
            onProgress,
          });
        } catch {
          outcome = { ok: false, failure: 'unknown', inputIndex: null, outputs: [] };
        }
        finish(jobId, request, outcome, startedAt, t);
      })();
      return { ok: true, jobId };
    }

    return {
      active: null,
      last: null,
      start,

      cancel() {
        controller?.abort();
      },

      retry(jobId, t) {
        if (get().active) return { ok: false, reason: 'busy' };
        const { last } = get();
        // A password was missing, wrong or not the owner's: the same request cannot succeed.
        if (
          last?.jobId === jobId &&
          !last.outcome.ok &&
          PASSWORD_FAILURES.includes(last.outcome.failure)
        ) {
          return { ok: false, reason: 'needsInput' };
        }
        if (last?.jobId === jobId && last.passwordsDropped) {
          return { ok: false, reason: 'needsInput' };
        }
        if (last?.jobId === jobId && last.request) return start(last.request, t);
        let request: ToolRequest | null = null;
        let row: ToolJobRow | undefined;
        try {
          row = getJob(deps.getDb(), jobId);
          request = row ? requestFromJob(row) : null;
        } catch {
          request = null;
        }
        if (row && NEEDS_PASSWORD.has(row.toolId)) return { ok: false, reason: 'needsInput' };
        if (PASSWORD_FAILURES.some((f) => f === row?.error)) {
          return { ok: false, reason: 'needsInput' };
        }
        if (!request) return { ok: false, reason: 'db' };
        // Not run by this process: its image session was deleted at this process's start.
        if (sessionIdOf(request) !== null) return { ok: false, reason: 'gone' };
        return start(request, t);
      },

      outcomeOf(jobId) {
        const { active, last } = get();
        if (active?.jobId === jobId) return { kind: 'running', job: active };
        if (last?.jobId === jobId && !last.recovered)
          return { kind: 'done', toolId: last.toolId, outcome: last.outcome };
        let row: ToolJobRow | undefined;
        try {
          row = getJob(deps.getDb(), jobId);
        } catch {
          return { kind: 'missing' };
        }
        const toolId = row ? runnable(row.toolId) : null;
        if (!row || !toolId) return { kind: 'missing' };
        const outputs = useFiles.getState().getRows(row.outputIds);
        if (row.status === 'succeeded') {
          // The saved images are not kept with the row: the result shows no list for them.
          if (toolId === 'pdf-to-images') {
            const images = { count: 0, folder: '', uris: [], reducedPages: 0 };
            return { kind: 'done', toolId, outcome: { ok: true, outputs: [], extras: { images } } };
          }
          return { kind: 'done', toolId, outcome: { ok: true, outputs } };
        }
        // Not running in this process: a queued/running row was interrupted by a process death.
        const failure: ToolFailure =
          row.status === 'cancelled'
            ? 'cancelled'
            : row.status === 'failed'
              ? (FAILURES.find((f) => f === row.error) ?? 'unknown')
              : 'interrupted';
        return { kind: 'done', toolId, outcome: { ok: false, failure, inputIndex: null, outputs } };
      },

      dismiss(jobId) {
        const { last } = get();
        if (last?.jobId !== jobId || !last.request) return;
        const session = keptSession(last);
        // A retry of this job running on the same session keeps it.
        if (session !== null && !(running && sessionIdOf(running) === session)) {
          cleanSession(session);
          // Without its request, a retry reads the row and reports the images `gone`.
          const { request: _dropped, ...rest } = last;
          set({ last: rest });
          return;
        }
        get().forgetPasswords(jobId);
      },

      forgetPasswords(jobId) {
        const { last } = get();
        if (last?.jobId !== jobId || !last.request || !holdsPassword(last.request)) return;
        const { request: _secret, ...rest } = last;
        set({ last: { ...rest, passwordsDropped: true } });
      },

      inputNameOf(jobId, inputIndex) {
        const { last } = get();
        if (inputIndex === null || last?.jobId !== jobId) return null;
        // Image jobs have no indexed inputs (pages are session sources).
        if (last.toolId === 'images-to-pdf' || last.toolId === 'scan') return null;
        const id = last.inputIds[inputIndex];
        return id === undefined ? null : (useFiles.getState().getRow(id)?.name ?? null);
      },

      recoverInterrupted(jobId) {
        if (get().active || get().last) return;
        let row: ToolJobRow | undefined;
        try {
          row = getJob(deps.getDb(), jobId);
        } catch {
          return;
        }
        const toolId = row ? runnable(row.toolId) : null;
        if (!row || !toolId) return;
        set({
          last: {
            jobId,
            toolId,
            inputIds: [...row.inputIds],
            outcome: {
              ok: false,
              failure: 'interrupted',
              inputIndex: null,
              outputs: useFiles.getState().getRows(row.outputIds),
            },
            seen: false,
            recovered: true,
          },
        });
      },

      markSeen(jobId) {
        const { last } = get();
        if (last?.jobId === jobId && !last.seen) set({ last: { ...last, seen: true } });
      },
    };
  });
}

/** The app's job-finished hook: the review counter must never keep telemetry from running. */
export function handleJobFinished(request: ToolRequest, outcome: ToolOutcome, ms: number): void {
  try {
    reviewPrompt.recordOutcome(outcome);
  } catch {
    // The review counter never affects a job or its telemetry.
  }
  telemetry.log(toolFinishedEvent(request, outcome, ms, pagesOf(outcome)));
}

export const useToolJobs = createToolJobStore({
  getDb,
  run: runTool,
  runDeps: (t) => ({
    native: pdfNative,
    fs: expoToolFs,
    getRows: (ids) => useFiles.getState().getRows(ids),
    registerOutputs: (infos) => useFiles.getState().registerOutputs(infos),
    getSignaturePng: (id) => getSignature(getDb(), id)?.pngPath ?? null,
    signaturesDir: signaturesDirUri(),
    t,
    now: Date.now,
  }),
  now: Date.now,
  random: Math.random,
  cleanSession: (sessionId) => pdfNative.cleanToolWorkspace(sessionId),
  onJobFinished: handleJobFinished,
  notice: jobNotice,
});
