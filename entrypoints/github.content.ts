import { getPageContext } from '../src/dom';
import { tokenAtPoint, extractIdentifier } from '../src/token';
import { resolveDefinition } from '../src/resolver';
import { renderPopover, dismissPopover } from '../src/popover';

// Content script — see docs/architecture.md. Matches the whole PR (not just
// /files) so listeners survive SPA navigation; show() acts only on PR pages.
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
        if (!page) return;
        const outcome = await resolveDefinition(page, symbol);
        if (!ctx.isValid) return;
        renderPopover({
          symbol,
          results: outcome.results,
          fallbackSearchUrl: outcome.fallbackSearchUrl,
          searchCount: outcome.searchCount,
          loggedIn: outcome.loggedIn,
          anchor,
        });
      } catch {
        // Resolution is best-effort; never disrupt the page.
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
    window.addEventListener('dblclick', (e) => {
      const sel = window.getSelection();
      const symbol = extractIdentifier(sel?.toString() ?? '');
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

    // Secondary trigger: Alt+click on a token (never hijacks normal clicks).
    window.addEventListener('click', (e) => {
      if (e.altKey) showAtPoint(e.clientX, e.clientY);
    });
  },
});

function isJumpMessage(message: unknown): message is { type: 'jump-to-def' } {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'jump-to-def'
  );
}
