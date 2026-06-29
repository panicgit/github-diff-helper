import type { DefinitionResult, PageContext } from '../types';
import { resolveInDiff } from './tier0-diff';
import { probeSearch, symbolSearchUrl } from './tier1-search';

export interface ResolveOutcome {
  symbol: string;
  results: DefinitionResult[];
  /** Universal degrade target: native GitHub code search for the symbol. */
  fallbackSearchUrl: string;
  /** Tier 1 match count in repo code search, or null if Tier 0 already hit / search unavailable. */
  searchCount: number | null;
  loggedIn: boolean;
}

/** Tiered resolution: local diff scan -> session code search -> fallback link. */
export async function resolveDefinition(
  ctx: PageContext,
  symbol: string,
): Promise<ResolveOutcome> {
  // Tier 0 — local, no network.
  const local = resolveInDiff(symbol);
  if (local) {
    return {
      symbol,
      results: [local],
      fallbackSearchUrl: symbolSearchUrl(ctx, symbol),
      searchCount: null,
      loggedIn: true,
    };
  }

  // Tier 1 — session-authenticated code search (hybrid symbol: → term probe).
  // The link we surface is whichever query actually matched (`probe.url`).
  const probe = await probeSearch(ctx, symbol);
  return {
    symbol,
    results: [],
    fallbackSearchUrl: probe ? probe.url : symbolSearchUrl(ctx, symbol),
    searchCount: probe ? probe.count : null,
    loggedIn: probe ? probe.loggedIn : true,
  };
}
