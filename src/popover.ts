import type { DefinitionResult } from './types';

export interface PopoverModel {
  symbol: string;
  results: DefinitionResult[];
  fallbackSearchUrl: string;
  searchCount: number | null;
  loggedIn: boolean;
  /** Bounding rect of the triggering token, in viewport coords. */
  anchor: DOMRect;
}

let host: HTMLDivElement | null = null;
let cleanup: (() => void) | null = null;

export function dismissPopover(): void {
  cleanup?.();
  cleanup = null;
  host?.remove();
  host = null;
}

export function renderPopover(model: PopoverModel): void {
  dismissPopover();

  host = document.createElement('div');
  host.style.cssText =
    `position:absolute;z-index:2147483647;` +
    `top:${window.scrollY + model.anchor.bottom + 6}px;` +
    `left:${window.scrollX + model.anchor.left}px;`;

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.append(style, buildCard(model));
  document.body.appendChild(host);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismissPopover();
  };
  const onScroll = () => dismissPopover();
  const onDocClick = (e: MouseEvent) => {
    if (host && !e.composedPath().includes(host)) dismissPopover();
  };
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
  // Defer click-outside so the triggering Alt+click does not instantly close it.
  const clickTimer = window.setTimeout(
    () => document.addEventListener('click', onDocClick, true),
    0,
  );
  cleanup = () => {
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', onScroll, true);
    document.removeEventListener('click', onDocClick, true);
    window.clearTimeout(clickTimer);
  };
}

function buildCard(model: PopoverModel): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';

  const header = document.createElement('div');
  header.className = 'hdr';
  const name = document.createElement('span');
  name.className = 'sym';
  name.textContent = model.symbol;
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = model.results.length ? 'in this PR' : 'code search';
  header.append(name, badge);
  card.append(header);

  if (model.results.length) {
    for (const r of model.results) card.append(resultRow(r));
  } else {
    card.append(fallbackRow(model));
  }
  return card;
}

function resultRow(r: DefinitionResult): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row';

  const loc = document.createElement('div');
  loc.className = 'loc';
  loc.textContent = r.line ? `${r.path}:${r.line}` : r.path;

  const snip = document.createElement('code');
  snip.className = 'snip';
  snip.textContent = r.snippet;

  const btn = document.createElement('button');
  btn.className = 'jump';
  btn.textContent = 'Jump to definition';
  btn.addEventListener('click', () => jump(r));

  row.append(loc, snip, btn);
  return row;
}

function fallbackRow(model: PopoverModel): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row';

  const msg = document.createElement('div');
  msg.className = 'loc';
  if (!model.loggedIn) {
    msg.textContent = 'Sign in to GitHub to search for the definition.';
  } else if (model.searchCount && model.searchCount > 0) {
    msg.textContent = `Not in this PR — ${model.searchCount} match(es) in the repo.`;
  } else {
    msg.textContent = 'No definition found in this PR.';
  }

  const link = document.createElement('a');
  link.className = 'jump';
  link.href = model.fallbackSearchUrl;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Open GitHub code search ↗';

  row.append(msg, link);
  return row;
}

function jump(r: DefinitionResult): void {
  if (r.targetEl) {
    scrollIntoViewThenFlash(r.targetEl);
  } else if (r.permalinkUrl) {
    window.open(r.permalinkUrl, '_blank', 'noopener');
  }
  dismissPopover();
}

// Smooth-scroll to the target, then flash only once the scroll has settled —
// otherwise the highlight can fade out before the line reaches the viewport.
// There's no reliable "scroll finished" signal for smooth scrollIntoView
// (`scrollend` is Chrome 114+ and fires on whichever scroller moved), so we
// watch the target's viewport position frame-by-frame instead. This also
// handles GitHub's nested scrollers and the already-on-screen case (no scroll
// → position is stable immediately).
function scrollIntoViewThenFlash(el: HTMLElement): void {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  let lastTop = NaN;
  let stableFrames = 0;
  let startTs = 0;
  const settle = (ts: number) => {
    if (!startTs) startTs = ts;
    const top = el.getBoundingClientRect().top;
    stableFrames = Math.abs(top - lastTop) < 0.5 ? stableFrames + 1 : 0;
    lastTop = top;
    // ~3 still frames = scrolling stopped; 2s cap guards against endless motion.
    if (stableFrames >= 3 || ts - startTs > 2000) {
      flash(el);
      return;
    }
    requestAnimationFrame(settle);
  };
  requestAnimationFrame(settle);
}

function flash(el: HTMLElement): void {
  const origBg = el.style.backgroundColor;
  const origTransition = el.style.transition;
  el.style.transition = 'background-color .2s';
  el.style.backgroundColor = 'rgba(255, 212, 0, .55)';
  window.setTimeout(() => {
    el.style.backgroundColor = origBg;
    window.setTimeout(() => {
      el.style.transition = origTransition;
    }, 250);
  }, 1400);
}

const CSS = `
.card{all:initial;display:block;width:340px;max-width:90vw;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
  font-size:12px;color:#1f2328;background:#fff;border:1px solid #d0d7de;border-radius:8px;
  box-shadow:0 8px 24px rgba(140,149,159,.2);overflow:hidden;}
.hdr{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#f6f8fa;border-bottom:1px solid #d0d7de;}
.sym{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600;}
.badge{margin-left:auto;font-size:10px;color:#656d76;background:#eaeef2;border-radius:10px;padding:1px 8px;}
.row{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-top:1px solid #f0f0f0;}
.row:first-of-type{border-top:none;}
.loc{color:#656d76;font-size:11px;}
.snip{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word;
  background:#f6f8fa;border-radius:6px;padding:6px 8px;color:#1f2328;}
.jump{align-self:flex-start;font:inherit;font-size:12px;cursor:pointer;border:1px solid #d0d7de;
  background:#1f883d;color:#fff;border-radius:6px;padding:4px 12px;text-decoration:none;}
a.jump{background:#0969da;}
.jump:hover{filter:brightness(1.05);}
`;
