import { getPageContext, DIAG_SELECTORS } from '../src/dom';
import { tokenAtPoint, isResolvableIdentifier } from '../src/token';
import { resolveDefinition } from '../src/resolver';
import { renderPopover, dismissPopover } from '../src/popover';

// MVP content script — see docs/architecture.md sections 3, 5, 8.
export default defineContentScript({
  matches: ['https://github.com/*/*/pull/*/files*'],
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
      const target = e.target as HTMLElement | null;
      if (!target?.closest(DIAG_SELECTORS.files)) return; // only within a diff
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      if (!isResolvableIdentifier(text)) {
        dismissPopover();
        return;
      }
      const anchor =
        sel && sel.rangeCount > 0
          ? sel.getRangeAt(0).getBoundingClientRect()
          : target.getBoundingClientRect();
      void show(text, anchor);
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
      console.debug(
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
