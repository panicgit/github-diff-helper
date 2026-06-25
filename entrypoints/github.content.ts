import { getPageContext, DIAG_SELECTORS } from '../src/dom';
import { tokenAtPoint } from '../src/token';
import { resolveDefinition } from '../src/resolver';
import { renderPopover, dismissPopover } from '../src/popover';

// MVP content script — see docs/architecture.md sections 3, 5, 8.
export default defineContentScript({
  matches: ['https://github.com/*/*/pull/*/files*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    // The keyboard command arrives with no event target, so we track the last
    // pointer position cheaply and hit-test it on trigger.
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

    async function trigger(x: number, y: number): Promise<void> {
      if (!ctx.isValid) return;
      const page = getPageContext();
      if (!page) return;
      const symbol = tokenAtPoint(x, y);
      if (!symbol) {
        dismissPopover();
        return;
      }
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const anchor = el?.getBoundingClientRect() ?? new DOMRect(x, y, 0, 0);
      const outcome = await resolveDefinition(page, symbol);
      renderPopover({
        symbol,
        results: outcome.results,
        fallbackSearchUrl: outcome.fallbackSearchUrl,
        searchCount: outcome.searchCount,
        loggedIn: outcome.loggedIn,
        anchor,
      });
    }

    // Primary trigger: keyboard command, relayed by the background worker
    // (commands.onCommand does not fire inside content scripts).
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (isJumpMessage(message)) void trigger(lastX, lastY);
    });

    // Secondary trigger: Alt+click on a token (never hijacks normal clicks).
    window.addEventListener('click', (e) => {
      if (e.altKey) void trigger(e.clientX, e.clientY);
    });

    if (import.meta.env.DEV) {
      window.setTimeout(() => {
        const files = document.querySelectorAll(DIAG_SELECTORS.files).length;
        const codeLines = document.querySelectorAll(DIAG_SELECTORS.codeLines).length;
        console.debug(
          `[pr-goto-def] armed on ${location.href} — files:${files} codeLines:${codeLines} headSha:${
            getPageContext()?.headSha || '?'
          }`,
        );
      }, 1500);
    }
  },
});

function isJumpMessage(message: unknown): message is { type: 'jump-to-def' } {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'jump-to-def'
  );
}
