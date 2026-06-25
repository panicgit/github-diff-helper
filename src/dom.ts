import type { PageContext } from './types';

/**
 * All GitHub PR "Files changed" selectors live here — the single churn point.
 * VERIFY against a live authenticated PR (docs/architecture.md section 7B);
 * these are best-guess shapes for the legacy + React diff views.
 */
export const SELECTORS = {
  fileContainer: '[data-tagsearch-path], copilot-diff-entry, .file',
  filePathAttr: 'data-tagsearch-path',
  codeLine: '.blob-code-inner, [data-code-text]',
  lineNumberAttr: 'data-line-number',
} as const;

const PR_FILES_RE = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/files/;
const BLOB_SHA_RE = /\/blob\/([0-9a-f]{7,40})\//;

/** Repo/PR identity comes from the URL (most stable source). */
export function getPageContext(): PageContext | null {
  try {
    const m = PR_FILES_RE.exec(location.pathname);
    if (!m) return null;
    const [, owner, repo, prNumber] = m;
    const headSha = findHeadSha();
    if (!headSha) return null;
    return { owner, repo, prNumber: Number(prNumber), headSha };
  } catch {
    return null;
  }
}

/** Resolve the PR head SHA. VERIFY the extraction path live (section 7B9). */
function findHeadSha(): string | null {
  try {
    const blobLink = document.querySelector<HTMLAnchorElement>('a[href*="/blob/"]');
    const href = blobLink?.getAttribute('href') ?? '';
    return BLOB_SHA_RE.exec(href)?.[1] ?? null;
  } catch {
    return null;
  }
}
