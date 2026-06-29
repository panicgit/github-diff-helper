import type { PageContext } from '../types';

const SEARCH_ENDPOINT = 'https://github.com/search';
const TTL_MS = 60_000;

/** Precise: GitHub code search restricted to symbol *definitions* of `sym`. */
export function symbolSearchUrl(ctx: PageContext, sym: string): string {
  const q = `repo:${ctx.owner}/${ctx.repo} symbol:${sym}`;
  return `${SEARCH_ENDPOINT}?q=${encodeURIComponent(q)}&type=code`;
}

/** Broad: plain term search — every textual occurrence in the repo. */
export function termSearchUrl(ctx: PageContext, sym: string): string {
  const q = `repo:${ctx.owner}/${ctx.repo} ${sym}`;
  return `${SEARCH_ENDPOINT}?q=${encodeURIComponent(q)}&type=code`;
}

export interface SearchProbe {
  loggedIn: boolean;
  count: number;
  /** The search URL that produced `count` — open this one. */
  url: string;
}

// De-dupe rapid triggers (double-click makes this cheap to fire) and never run
// two identical requests at once — keeps us well under GitHub's rate limits.
const cache = new Map<string, { value: SearchProbe | null; ts: number }>();
const inflight = new Map<string, Promise<SearchProbe | null>>();

/**
 * Tier 1: ask GitHub code search (via the user's session cookies) where the
 * symbol lives. `Accept: application/json` alone flips the response to JSON and
 * authenticates; no impersonation headers.
 *
 * Hybrid query: try the precise `symbol:` definition search first; if it returns
 * nothing (indexing gaps — some Kotlin extension/interface members, generated
 * code), fall back to a broad term search so the user still lands on something.
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
  const symUrl = symbolSearchUrl(ctx, sym);
  const symHit = await fetchCount(symUrl);
  if (!symHit) return null; // network/parse failure — let caller offer the link blindly

  // Precise definition search found matches → use it.
  if (symHit.count > 0) {
    return { loggedIn: symHit.loggedIn, count: symHit.count, url: symUrl };
  }

  // Empty: fall back to the broad term search the user actually wants to see.
  const termUrl = termSearchUrl(ctx, sym);
  const termHit = await fetchCount(termUrl);
  return {
    loggedIn: termHit ? termHit.loggedIn : symHit.loggedIn,
    count: termHit ? termHit.count : 0,
    url: termUrl,
  };
}

async function fetchCount(url: string): Promise<{ loggedIn: boolean; count: number } | null> {
  const res = await fetch(url, {
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
