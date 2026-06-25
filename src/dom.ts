import type { PageContext } from './types';

const PR_FILES_RE = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/files/;
const SHA40_RE = /\/(?:blob|commits?)\/([0-9a-f]{40})(?:\/|$)/;

// New React "Files changed" view (confirmed live 2026-06):
//   file table : table[aria-label^="Diff for:"]   (aria-label = "Diff for: <path>")
//   code cell  : td.diff-text-cell[data-line-number][data-diff-side]  (text in .diff-text-inner)
// Legacy view kept as a fallback.
const REACT_FILE_TABLE = 'table[aria-label^="Diff for:"]';
const REACT_CODE_CELL = 'td.diff-text-cell';
const LEGACY_FILE = '[data-tagsearch-path], .file[data-path], .file';
const LEGACY_CODE = '.blob-code-inner, [data-code-text]';

export const DIAG_SELECTORS = {
  files: `${REACT_FILE_TABLE}, ${LEGACY_FILE}`,
  codeLines: `${REACT_CODE_CELL}, ${LEGACY_CODE}`,
};

/** Repo/PR identity from the URL (most stable), plus a best-effort head SHA. */
export function getPageContext(): PageContext | null {
  try {
    const m = PR_FILES_RE.exec(location.pathname);
    if (!m) return null;
    const [, owner, repo, prNumber] = m;
    return { owner, repo, prNumber: Number(prNumber), headSha: findHeadSha() ?? '' };
  } catch {
    return null;
  }
}

function findHeadSha(): string | null {
  for (const a of document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/blob/"], a[href*="/commits/"]',
  )) {
    const sha = SHA40_RE.exec(a.getAttribute('href') ?? '')?.[1];
    if (sha) return sha;
  }
  for (const s of document.querySelectorAll('script[type="application/json"]')) {
    const sha = /"(?:headRefOid|head_sha|after_commit_oid|oid)"\s*:\s*"([0-9a-f]{40})"/.exec(
      s.textContent ?? '',
    )?.[1];
    if (sha) return sha;
  }
  return null;
}

export interface DiffCodeElement {
  el: HTMLElement;
  path: string;
  line?: number;
  side?: 'left' | 'right';
}

/** Gather code cells across rendered diff files, with path/line/side metadata. */
export function collectDiffCodeElements(): DiffCodeElement[] {
  const out: DiffCodeElement[] = [];

  // React view: one <table aria-label="Diff for: <path>"> per file.
  for (const table of document.querySelectorAll<HTMLElement>(REACT_FILE_TABLE)) {
    const path = (table.getAttribute('aria-label') ?? '').replace(/^Diff for:\s*/, '').trim();
    for (const cell of table.querySelectorAll<HTMLElement>(REACT_CODE_CELL)) {
      const lineAttr = cell.getAttribute('data-line-number');
      const sideAttr = cell.getAttribute('data-diff-side');
      out.push({
        el: cell,
        path,
        line: lineAttr ? Number(lineAttr) : undefined,
        side: sideAttr === 'left' ? 'left' : sideAttr === 'right' ? 'right' : undefined,
      });
    }
  }
  if (out.length) return out;

  // Legacy view.
  for (const container of document.querySelectorAll<HTMLElement>(LEGACY_FILE)) {
    const path = filePathOf(container) ?? '';
    for (const el of container.querySelectorAll<HTMLElement>(LEGACY_CODE)) {
      out.push({ el, path });
    }
  }
  if (out.length) return out;

  // Last resort: any code cell page-wide (path unknown).
  for (const el of document.querySelectorAll<HTMLElement>(`${REACT_CODE_CELL}, ${LEGACY_CODE}`)) {
    out.push({ el, path: '' });
  }
  return out;
}

function filePathOf(container: HTMLElement): string | null {
  const attr =
    container.getAttribute('data-tagsearch-path') ?? container.getAttribute('data-path');
  if (attr) return attr;
  const link = container.querySelector<HTMLElement>(
    '.file-info a[title], [data-testid="file-name"], .file-header [title]',
  );
  const title = link?.getAttribute('title') ?? link?.textContent?.trim();
  return title || null;
}
