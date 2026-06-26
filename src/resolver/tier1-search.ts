import type { PageContext } from '../types';

const SEARCH_ENDPOINT = 'https://github.com/search';
const TTL_MS = 60_000;

/** Native GitHub code-search URL for the symbol (also the universal fallback). */
export function searchUrl(ctx: PageContext, sym: string): string {
  const q = `repo:${ctx.owner}/${ctx.repo} symbol:${sym}`;
  return `${SEARCH_ENDPOINT}?q=${encodeURIComponent(q)}&type=code`;
}

export interface SearchProbe {
  loggedIn: boolean;
  count: number;
}

// De-dupe rapid triggers (double-click makes this cheap to fire) and never run
// two identical requests at once — keeps us well under GitHub's rate limits.
const cache = new Map<string, { value: SearchProbe | null; ts: number }>();
const inflight = new Map<string, Promise<SearchProbe | null>>();

/**
 * Tier 1: ask GitHub code search (via the user's session cookies) whether the
 * symbol is defined elsewhere in the repo. `Accept: application/json` alone
 * flips the response to JSON and authenticates; no impersonation headers.
 *
 * For now we report whether matches exist and surface the native code-search
 * link rather than fabricating permalinks from unverified result fields. We log
 * results[0] so real use captures the field map for the direct-jump upgrade.
 */
export async function probeSearch(ctx: PageContext, sym: string): Promise<SearchProbe | null> {
  const key = `${ctx.owner}/${ctx.repo}#${sym}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.value;

  const pending = inflight.get(key);
  if (pending) return pending;

  const req = doProbe(ctx, sym)
    .then((value) => {
      cache.set(key, { value, ts: Date.now() });
      return value;
    })
    .catch(() => null)
    .finally(() => inflight.delete(key));

  inflight.set(key, req);
  return req;
}

async function doProbe(ctx: PageContext, sym: string): Promise<SearchProbe | null> {
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

  return {
    loggedIn: Boolean(p.logged_in),
    count: Number(p.result_count ?? p.results.length),
  };
}
