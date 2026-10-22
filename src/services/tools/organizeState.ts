import type { PageEdit, PageRotation } from '@/services/pdf/organize';

export type OrganizePage = { key: string; source: number; rotate: PageRotation };
export type OrganizeState = { pages: OrganizePage[]; nextKey: number };
export type OrganizeAction =
  | { type: 'reorder'; keys: string[] }
  | { type: 'move'; key: string; delta: -1 | 1 }
  | { type: 'rotate'; key: string }
  | { type: 'delete'; key: string }
  | { type: 'duplicate'; key: string };

export function initialOrganize(pageCount: number): OrganizeState {
  return {
    pages: Array.from({ length: pageCount }, (_, i) => ({
      key: `p${i + 1}`,
      source: i + 1,
      rotate: 0 as PageRotation,
    })),
    nextKey: pageCount + 1,
  };
}

export function organizeReducer(state: OrganizeState, action: OrganizeAction): OrganizeState {
  const { pages } = state;
  if (action.type === 'reorder') {
    if (action.keys.length !== pages.length) return state;
    const byKey = new Map(pages.map((p) => [p.key, p]));
    const next = action.keys.flatMap((k) => byKey.get(k) ?? []);
    // Unknown or repeated keys shrink the list below the original size.
    if (new Set(action.keys).size !== pages.length || next.length !== pages.length) return state;
    return { ...state, pages: next };
  }
  const at = pages.findIndex((p) => p.key === action.key);
  if (at < 0) return state;
  const page = pages[at]!;
  switch (action.type) {
    case 'rotate': {
      const rotate = ((page.rotate + 90) % 360) as PageRotation;
      return { ...state, pages: pages.map((p, i) => (i === at ? { ...p, rotate } : p)) };
    }
    case 'delete':
      if (pages.length <= 1) return state;
      return { ...state, pages: pages.filter((_, i) => i !== at) };
    case 'duplicate': {
      const copy = { ...page, key: `p${state.nextKey}` };
      return {
        pages: [...pages.slice(0, at + 1), copy, ...pages.slice(at + 1)],
        nextKey: state.nextKey + 1,
      };
    }
    case 'move': {
      const to = at + action.delta;
      if (to < 0 || to >= pages.length) return state;
      const next = [...pages];
      next[at] = pages[to]!;
      next[to] = page;
      return { ...state, pages: next };
    }
  }
}

export function toPageEdits(state: OrganizeState): PageEdit[] {
  return state.pages.map(({ source, rotate }) => ({ source, rotate }));
}

export function isUnchanged(state: OrganizeState, pageCount: number): boolean {
  return (
    state.pages.length === pageCount &&
    state.pages.every((p, i) => p.source === i + 1 && p.rotate === 0)
  );
}
