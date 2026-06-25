import type { DefinitionResult, PageContext } from '../types';
import { resolveInDiff } from './tier0-diff';
import { resolveBySearch, searchUrl } from './tier1-search';

export interface ResolveOutcome {
  symbol: string;
  results: DefinitionResult[];
  /** Universal degrade target: native GitHub code search for the symbol. */
  fallbackSearchUrl: string;
}

/** Tiered resolution: local diff scan -> session code search -> fallback link. */
export async function resolveDefinition(
  ctx: PageContext,
  symbol: string,
): Promise<ResolveOutcome> {
  const fallbackSearchUrl = searchUrl(ctx, symbol);

  // Tier 0 — local, no network.
  const local = resolveInDiff(symbol);
  if (local) return { symbol, results: [local], fallbackSearchUrl };

  // Tier 1 — session-authenticated code search.
  const found = await resolveBySearch(ctx, symbol);
  return { symbol, results: found ?? [], fallbackSearchUrl };
}
