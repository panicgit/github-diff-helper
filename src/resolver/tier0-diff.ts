import type { DefinitionResult } from '../types';

/** JS/TS definition-detection patterns for a symbol, ranked declaration-first. */
export function definitionPatterns(sym: string): RegExp[] {
  const s = escapeRe(sym);
  return [
    new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${s}\\b`),
    new RegExp(`(?:export\\s+)?(?:abstract\\s+)?class\\s+${s}\\b`),
    new RegExp(`(?:export\\s+)?(?:type|interface|enum)\\s+${s}\\b`),
    new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${s}\\s*=`),
  ];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tier 0: scan the PR's already-rendered diff hunks for a local definition of
 * `sym`. Fully local, no network — covers head-branch definitions for free.
 * Stub until the DOM contract is live-validated (steps 4 + 7).
 */
export function resolveInDiff(_sym: string): DefinitionResult | null {
  // TODO(step 7): walk rendered hunks (SELECTORS.codeLine), apply
  // definitionPatterns(_sym), and map the first match to { path, line, side }.
  return null;
}
