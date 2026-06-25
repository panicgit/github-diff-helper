const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const IDENT_CHAR_RE = /[A-Za-z0-9_$]/;

// Keywords that are never a jump target.
const JS_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'return', 'throw', 'try', 'catch', 'finally', 'const', 'let', 'var',
  'function', 'class', 'new', 'delete', 'typeof', 'instanceof', 'void',
  'in', 'of', 'this', 'super', 'yield', 'await', 'async', 'import', 'export',
  'from', 'as', 'default', 'extends', 'implements', 'interface', 'type',
  'enum', 'public', 'private', 'protected', 'static', 'readonly', 'keyof',
  'is', 'null', 'true', 'false', 'undefined',
]);

export function isResolvableIdentifier(word: string): boolean {
  return IDENTIFIER_RE.test(word) && !JS_KEYWORDS.has(word);
}

/**
 * Symbol token under a viewport point, or null.
 * Primary path reads a per-token syntax span; fallback tokenizes a bare text
 * node. VERIFY which path the current GitHub diff uses (section 7B10).
 */
export function tokenAtPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  if (el) {
    const text = el.textContent?.trim() ?? '';
    if (isResolvableIdentifier(text)) return text;
  }
  return wordAtPoint(x, y);
}

function wordAtPoint(x: number, y: number): string | null {
  // caretRangeFromPoint is non-standard but present in Chromium.
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const range = doc.caretRangeFromPoint?.(x, y);
  if (!range) return null;

  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;

  const text = node.textContent ?? '';
  const offset = range.startOffset;
  let start = offset;
  let end = offset;
  while (start > 0 && IDENT_CHAR_RE.test(text[start - 1])) start--;
  while (end < text.length && IDENT_CHAR_RE.test(text[end])) end++;

  const word = text.slice(start, end);
  return isResolvableIdentifier(word) ? word : null;
}
