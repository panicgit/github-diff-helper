import type { PageContext } from './types';

const PR_FILES_RE = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/files/;
const SHA40_RE = /\/(?:blob|commits?)\/([0-9a-f]{40})(?:\/|$)/;

/**
 * Diff-file containers across the legacy + React "Files changed" views. The
 * union keeps us resilient to GitHub view churn; this is the single churn point
 * (docs/architecture.md section 3) and is refined by real use.
 */
const FILE_CONTAINERS = [
  '[data-tagsearch-path]',
  'copilot-diff-entry',
  '[data-testid="file-diff"]',
  '.file[data-path]',
  '.js-file',
  '.file',
];

/** Elements that carry a line of code text within a file. */
const CODE_LINES = [
  '.blob-code-inner',
  '[data-code-text]',
  '[data-grid-cell-id$="-code"]',
  '.react-code-text',
  '.react-file-line',
  '.diff-text-cell',
  '.diff-text',
  'td.blob-code',
];

export const DIAG_SELECTORS = {
  files: FILE_CONTAINERS.join(','),
  codeLines: CODE_LINES.join(','),
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
  // 1) Any blob/commit link carrying a 40-char SHA.
  for (const a of document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/blob/"], a[href*="/commits/"]',
  )) {
    const sha = SHA40_RE.exec(a.getAttribute('href') ?? '')?.[1];
    if (sha) return sha;
  }
  // 2) SHA-like fields in embedded JSON payloads.
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
}

/**
 * Gather code-bearing elements across all rendered diff files (best-effort).
 * If file containers don't match the current view, fall back to scanning code
 * lines page-wide (path unknown) so Tier 0 can still find a definition.
 */
export function collectDiffCodeElements(): DiffCodeElement[] {
  const out: DiffCodeElement[] = [];
  const codeSel = CODE_LINES.join(',');

  for (const container of document.querySelectorAll<HTMLElement>(FILE_CONTAINERS.join(','))) {
    const path = filePathOf(container) ?? '';
    for (const el of container.querySelectorAll<HTMLElement>(codeSel)) {
      out.push({ el, path });
    }
  }

  if (out.length === 0) {
    for (const el of document.querySelectorAll<HTMLElement>(codeSel)) {
      out.push({ el, path: '' });
    }
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
