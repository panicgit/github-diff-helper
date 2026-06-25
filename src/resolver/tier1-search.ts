import type { PageContext } from '../types';

const SEARCH_ENDPOINT = 'https://github.com/search';

/** Native GitHub code-search URL for the symbol (also the universal fallback). */
export function searchUrl(ctx: PageContext, sym: string): string {
  const q = `repo:${ctx.owner}/${ctx.repo} symbol:${sym}`;
  return `${SEARCH_ENDPOINT}?q=${encodeURIComponent(q)}&type=code`;
}

export interface SearchProbe {
  loggedIn: boolean;
  count: number;
}

/**
 * Tier 1: ask GitHub code search (via the user's session cookies) whether the
 * symbol is defined elsewhere in the repo. `Accept: application/json` alone
 * flips the response to JSON and authenticates; no impersonation headers.
 *
 * For now we report whether matches exist and surface the native code-search
 * link rather than fabricating permalinks from unverified result fields. Once
 * the `results[]` schema is confirmed by real use (we log results[0] in dev),
 * we will parse it for direct jumps.
 */
export async function probeSearch(ctx: PageContext, sym: string): Promise<SearchProbe | null> {
  try {
    const res = await fetch(searchUrl(ctx, sym), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      payload?: { results?: unknown[]; result_count?: number; logged_in?: boolean };
    };
    const p = data.payload ?? (data as unknown as typeof data.payload);
    if (!p || !Array.isArray(p.results)) return null;

    if (import.meta.env.DEV && p.results[0]) {
      // First real logged-in hit captures the field map for direct-jump work.
      console.debug('[pr-goto-def] search results[0] =', p.results[0]);
    }
    return {
      loggedIn: Boolean(p.logged_in),
      count: Number(p.result_count ?? p.results.length),
    };
  } catch {
    return null;
  }
}
