// @ts-nocheck
/*
 * GitHub Diff Helper — live validation probe.
 *
 * Captures the two gates from docs/architecture.md section 7, which need an
 * authenticated browser (a subagent cannot reach private GitHub):
 *   A) the code-search JSON envelope + results[0] field names
 *   B) the current PR /files DOM selectors + head-SHA extraction
 *
 * HOW TO USE
 *   1. Open a real PR you can access, on the "Files changed" tab:
 *        https://github.com/<owner>/<repo>/pull/<n>/files
 *   2. DevTools -> Console.
 *   3. Set SYMBOL to a function/class name visible in the diff — ideally one
 *      DEFINED elsewhere in the repo (not added by this PR), so Gate A returns a hit.
 *   4. Paste this whole file, run, and copy the console output back.
 *
 * Read-only and same-origin (your session). Nothing is sent anywhere.
 */
const SYMBOL = 'REPLACE_ME'; // <-- set me

(async () => {
  const m = location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/files/);
  if (!m) {
    console.warn('Open a PR "Files changed" page first.');
    return;
  }
  const [, owner, repo, pr] = m;
  console.log('%c== context ==', 'font-weight:bold', { owner, repo, pr, SYMBOL });

  // ---- Gate A: code-search envelope + field map ----
  if (SYMBOL && SYMBOL !== 'REPLACE_ME') {
    try {
      const q = `repo:${owner}/${repo} symbol:${SYMBOL}`;
      const url = `https://github.com/search?q=${encodeURIComponent(q)}&type=code`;
      const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
      console.log('%c== Gate A: search ==', 'font-weight:bold', {
        status: res.status,
        contentType: res.headers.get('content-type'),
      });
      const data = await res.json();
      const p = data.payload ?? data;
      console.log('logged_in:', p.logged_in, ' result_count:', p.result_count);
      const r0 = (p.results || [])[0];
      console.log('results[0] keys:', r0 ? Object.keys(r0) : '(no results — try a symbol that exists)');
      console.log('results[0]:', r0);
      window.__ghdh_search = data; // inspect later in the console
    } catch (e) {
      console.error('Gate A failed:', e);
    }
  } else {
    console.warn('Gate A skipped — set SYMBOL first.');
  }

  // ---- Gate B: DOM contract ----
  const count = (sel) => {
    try {
      return document.querySelectorAll(sel).length;
    } catch {
      return 'ERR';
    }
  };
  console.log('%c== Gate B: selector hit counts ==', 'font-weight:bold');
  console.table({
    '[data-tagsearch-path]': count('[data-tagsearch-path]'),
    'copilot-diff-entry': count('copilot-diff-entry'),
    '.file': count('.file'),
    '.blob-code-inner': count('.blob-code-inner'),
    '[data-code-text]': count('[data-code-text]'),
    '[data-line-number]': count('[data-line-number]'),
    '[data-grid-cell-id]': count('[data-grid-cell-id]'),
    'a[href*="/blob/"]': count('a[href*="/blob/"]'),
    'script[type="application/json"]': count('script[type="application/json"]'),
  });

  // head SHA candidate from a per-file blob link
  const blob = document.querySelector('a[href*="/blob/"]');
  const href = blob && blob.getAttribute('href');
  const blobSha = href && href.match(/\/blob\/([0-9a-f]{7,40})\//);
  console.log('blob-link head SHA candidate:', blobSha && blobSha[1], ' from', href);

  // SHA-like fields embedded in JSON script tags
  for (const s of document.querySelectorAll('script[type="application/json"]')) {
    const t = s.textContent || '';
    const hits = t.match(/"(headRefOid|baseRefOid|sha|oid)"\s*:\s*"[0-9a-f]{7,40}"/g);
    if (hits) {
      console.log('embedded SHA fields in', s.getAttribute('data-target') || '(script)', ':', hits.slice(0, 8));
    }
  }

  // sample one code-line element so we can see token markup
  const line = document.querySelector('.blob-code-inner, [data-code-text], [data-grid-cell-id]');
  console.log('sample code-line element:', line);
  console.log('%cDone — copy the output above back.', 'font-weight:bold');
})();
