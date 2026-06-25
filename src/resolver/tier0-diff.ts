import type { DefinitionResult } from '../types';
import { collectDiffCodeElements } from '../dom';

/** Multi-language definition-detection patterns for a symbol (Kotlin/JS/TS/
 *  Java/Python/Go/...), ranked declaration-first. */
export function definitionPatterns(sym: string): RegExp[] {
  const s = escapeRe(sym);
  return [
    // function / method declarations
    new RegExp(`\\bfun\\s+${s}\\b`), // Kotlin
    new RegExp(`\\bdef\\s+${s}\\b`), // Python / Ruby / Scala
    new RegExp(`\\bfunc\\s+${s}\\b`), // Go / Swift
    new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${s}\\b`), // JS / TS
    // class / type declarations (incl. Kotlin/Java modifiers)
    new RegExp(
      `\\b(?:data\\s+|sealed\\s+|abstract\\s+|open\\s+|final\\s+|inner\\s+|enum\\s+|annotation\\s+|value\\s+|public\\s+|private\\s+|internal\\s+)*class\\s+${s}\\b`,
    ),
    new RegExp(`\\b(?:interface|object|enum|trait|struct|protocol|type)\\s+${s}\\b`),
    // value / property declarations
    new RegExp(`\\b(?:val|var|const|let)\\s+${s}\\b`), // Kotlin / JS / TS
    new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${s}\\s*[=:]`),
    // assigned arrow / function expression (JS / TS)
    new RegExp(`\\b${s}\\s*[:=]\\s*(?:async\\s*)?\\(`),
    // method / function shorthand: name( ... ) {  or  name( ... ) :
    new RegExp(`\\b${s}\\s*\\([^)]*\\)\\s*[:{]`),
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
  for (const { el, path, line } of collectDiffCodeElements()) {
    const text = el.textContent ?? '';
    if (!text.includes(sym)) continue;
    if (patterns.some((re) => re.test(text))) {
      return {
        source: 'in-diff',
        symbol: sym,
        path,
        line,
        snippet: text.trim().slice(0, 200),
        targetEl: el,
      };
    }
  }
  return null;
}
