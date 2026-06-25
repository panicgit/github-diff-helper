import { getPageContext, DIAG_SELECTORS } from '../src/dom';
import { tokenAtPoint, extractIdentifier } from '../src/token';
import { resolveDefinition } from '../src/resolver';
import { renderPopover, dismissPopover } from '../src/popover';

// MVP content script — see docs/architecture.md sections 3, 5, 8.
// Matches the whole PR (not just /files) so listeners survive SPA navigation
// into the "Files changed" tab; show() gates on getPageContext() == /files.
export default defineContentScript({
  matches: ['https://github.com/*/*/pull/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    // The keyboard command arrives with no event target, so track the pointer.
    let lastX = 0;
    let lastY = 0;
    window.addEventListener(
      'mousemove',
      (e) => {
        lastX = e.clientX;
        lastY = e.clientY;
      },
      { passive: true },
    );

    async function show(symbol: string, anchor: DOMRect): Promise<void> {
      try {
        if (!ctx.isValid) return;
        const page = getPageContext();
        console.log('[pr-goto-def] show', symbol, 'page=', page); // TODO(task 9): remove
        if (!page) return; // only acts on a PR /files page
        const outcome = await resolveDefinition(page, symbol);
        console.log('[pr-goto-def] outcome', outcome); // TODO(task 9): remove
        if (!ctx.isValid) return;
        renderPopover({
          symbol,
          results: outcome.results,
          fallbackSearchUrl: outcome.fallbackSearchUrl,
          searchCount: outcome.searchCount,
          loggedIn: outcome.loggedIn,
          anchor,
        });
        console.log('[pr-goto-def] popover rendered @', Math.round(anchor.left), Math.round(anchor.bottom)); // TODO(task 9): remove
      } catch (err) {
        console.log('[pr-goto-def] show ERROR', err); // TODO(task 9): remove
      }
    }

    function showAtPoint(x: number, y: number): void {
      const symbol = tokenAtPoint(x, y);
      if (!symbol) {
        dismissPopover();
        return;
      }
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const anchor = el?.getBoundingClientRect() ?? new DOMRect(x, y, 0, 0);
      void show(symbol, anchor);
    }

    // Primary trigger: double-click a code identifier (the word it selects).
    // No DOM gate beyond "valid identifier" — show() already limits to /files.
    window.addEventListener('dblclick', (e) => {
      const sel = window.getSelection();
      const raw = sel?.toString().trim() ?? '';
      console.log('[pr-goto-def] selection=', JSON.stringify(raw)); // TODO(task 9): remove
      const symbol = extractIdentifier(raw);
      if (!symbol) return;
      const target = e.target as HTMLElement | null;
      const anchor =
        sel && sel.rangeCount > 0
          ? sel.getRangeAt(0).getBoundingClientRect()
          : target?.getBoundingClientRect() ?? new DOMRect(e.clientX, e.clientY, 0, 0);
      void show(symbol, anchor);
    });

    // Keyboard command, relayed by the background worker.
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (isJumpMessage(message)) showAtPoint(lastX, lastY);
    });

    // Alt+click on a token (never hijacks normal clicks).
    window.addEventListener('click', (e) => {
      if (e.altKey) showAtPoint(e.clientX, e.clientY);
    });

    // Lightweight self-diagnostic. TODO(task 9): gate behind a debug setting before publishing.
    window.setTimeout(() => {
      const files = document.querySelectorAll(DIAG_SELECTORS.files).length;
      const codeLines = document.querySelectorAll(DIAG_SELECTORS.codeLines).length;
      console.log(
        `[pr-goto-def] armed on ${location.href} — files:${files} codeLines:${codeLines} headSha:${
          getPageContext()?.headSha || '?'
        }`,
      );
    }, 1500);
  },
});

function isJumpMessage(message: unknown): message is { type: 'jump-to-def' } {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'jump-to-def'
  );
}
