import type { DefinitionResult, PageContext } from '../types';

const SEARCH_ENDPOINT = 'https://github.com/search';

/** Native GitHub code-search URL for the symbol (also the universal fallback). */
export function searchUrl(ctx: PageContext, sym: string): string {
  const q = `repo:${ctx.owner}/${ctx.repo} symbol:${sym}`;
  return `${SEARCH_ENDPOINT}?q=${encodeURIComponent(q)}&type=code`;
}

/**
 * Tier 1: blackbird code search via the user's session cookies. `Accept:
 * application/json` alone flips the response to JSON and authenticates; no
 * impersonation headers are sent. Stub until the `payload.results[0]` field
 * map is live-captured (section 7A2, step 10).
 */
export async function resolveBySearch(
  ctx: PageContext,
  sym: string,
): Promise<DefinitionResult[] | null> {
  try {
    const res = await fetch(searchUrl(ctx, sym), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    // TODO(step 10): defensively parse data.payload.results using the live
    // field map; normalize to DefinitionResult[]; shape-drift -> kill-switch.
    void data;
    return null;
  } catch {
    return null;
  }
}
