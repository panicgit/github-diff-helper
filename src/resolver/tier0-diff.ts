import type { DefinitionResult } from '../types';
import { collectDiffCodeElements } from '../dom';

/** JS/TS definition-detection patterns for a symbol, ranked declaration-first. */
export function definitionPatterns(sym: string): RegExp[] {
  const s = escapeRe(sym);
  return [
    new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${s}\\b`),
    new RegExp(`(?:export\\s+)?(?:abstract\\s+)?class\\s+${s}\\b`),
    new RegExp(`(?:export\\s+)?(?:type|interface|enum)\\s+${s}\\b`),
    new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${s}\\s*[=:]`),
    new RegExp(`\\b${s}\\s*[:=]\\s*(?:async\\s*)?\\(`), // arrow / function expr assigned
    new RegExp(`\\b${s}\\s*\\([^)]*\\)\\s*\\{`), // method / function shorthand
  ];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tier 0: scan the PR's already-rendered diff for a local definition of `sym`.
 * Fully local, no network — covers head-branch definitions for free. Returns
 * the matched element so the popover can scroll to it.
 */
export function resolveInDiff(sym: string): DefinitionResult | null {
  const patterns = definitionPatterns(sym);
  for (const { el, path } of collectDiffCodeElements()) {
    const text = el.textContent ?? '';
    if (!text.includes(sym)) continue;
    if (patterns.some((re) => re.test(text))) {
      return {
        source: 'in-diff',
        symbol: sym,
        path,
        snippet: text.trim().slice(0, 200),
        targetEl: el,
      };
    }
  }
  return null;
}
