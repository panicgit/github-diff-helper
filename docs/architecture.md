# Architecture — GitHub PR Jump-to-Definition

> Generated via a multi-agent research + adversarial-critique workflow (2026-06-25).
> Selectors and the code-search response field map are **best-guess until live-validated**
> (see section 7). This is the working design of record.

## 0) Design reconciliation (key tradeoffs)

- **WXT vs plain Vite**: Findings say WXT; simplicity critic says plain Vite. I'll pick **WXT** but justify narrowly — its `createShadowRootUi` and Turbo-aware lifecycle directly solve two MVP-required problems (CSS isolation for the popover, SPA re-init), which I'd otherwise hand-roll. This is a case where the framework earns its keep for *this exact* feature (in-page popover), not speculative scaffolding. I'll pin the version and skip popup/options.
- **Resolver priority**: Risk critic wants head-SHA tree+parse FIRST; simplicity critic wants it OUT entirely; findings call blackbird "the only viable path." I'll reconcile via the user's actual constraint: the feature is "jump from a symbol *in the diff*." **Tier 0 = resolve within the PR's own diff (fully local, no network, sees head branch)** — this elegantly covers the head-branch case the risk critic worried about, for free, because the diff text is already in the DOM. **Tier 1 = blackbird code search** for symbols defined outside the changed files. Client-side tree-sitter WASM parsing is **deferred** (it's the big unscoped cost both critics flagged). This is decisive and lean.
- **Precise-nav bridge / kind field**: OUT for MVP (all three agree).
- **Headers**: Accept-only (accuracy critic resolved this live; risk critic wants minimal impersonation).
- **Throttling**: lean — single in-flight + de-dupe + 429 message, not a full queue (user-initiated only).

---

## 1) Architecture overview (data flow: symbol → resolved definition → UI)

```
 [User hovers a token in the PR diff DOM]
            │  shortcut keydown (primary)  /  click (secondary)
            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ CONTENT SCRIPT (runs in github.com page origin)              │
 │                                                              │
 │ 1. Hit-test: token under mouse → { symbol, filePath, line,   │
 │    side(base/head), enclosingDiffRow }                       │
 │ 2. Read page context: owner, repo, prNumber, headSha,        │
 │    baseSha  (from DOM + embedded JSON)                        │
 │                                                              │
 │ 3. RESOLVE (tiered, see §2):                                 │
 │    Tier 0 ── scan THIS PR's own changed-files diff text for  │
 │              a definition of `symbol`  (fully local, 0 net,  │
 │              sees the HEAD branch)                            │
 │       │ miss                                                 │
 │       ▼                                                      │
 │    Tier 1 ── same-origin GET github.com/search?type=code     │
 │              q="repo:o/r symbol:Sym"  (cookie-auth, JSON)    │
 │       │ miss / rate-limited / shape-drift                    │
 │       ▼                                                      │
 │    Fallback ─ "open GitHub code search for Sym" link         │
 │                                                              │
 │ 4. Build DefinitionResult { kind:'in-diff'|'search',         │
 │    repo, path, line, permalinkUrl, snippet, sameFileInPr }   │
 │                                                              │
 │ 5. UI: mount Shadow-DOM popover anchored at token →          │
 │    show snippet + "Jump to definition" button                │
 └─────────────────────────────────────────────────────────────┘
            │ jump action
            ▼
   same file already on screen?  ── yes ─▶ smooth-scroll + flash the diff row
                                 ── no  ─▶ window.open(permalink#Ln, '_blank')
```

**Key design decisions baked into the data flow:**
- **All network calls live in the content script** (page origin), so cookies attach automatically and we never lose first-party context. The background worker only relays the keyboard command (§5).
- **Tier 0 is local and runs first.** This is the decisive answer to the risk/accuracy critics' "default-branch-only is fatal for the PR use case" concern: definitions that are *new or moved on the PR head branch* are, by definition, present in the diff DOM we already have. We resolve them with zero network and zero parser WASM. Tier 1 (blackbird) handles the common case — jumping to a *pre-existing* symbol the PR merely calls — which lives on the default branch and is exactly what code search indexes.
- The undocumented blackbird endpoint is an **accelerator, contained behind a guarded parser with a kill-switch**, never the sole path.

---

## 2) Resolver design (tiered)

### Tier 0 — Definition within the PR's own diff (fully local, no network)

**Why this is Tier 0 and not a deferred fallback:** the diff for every changed file is already rendered (or lazy-rendered) in the DOM. The reviewer's most failure-prone case for Tier 1 — a symbol *defined on the head branch* — is the case Tier 0 handles best, because that code is sitting in the "Files changed" view right now. No GraphQL, no blob fetch, no tree-sitter WASM.

**Mechanism (lean, heuristic, TS/JS-scoped):**
1. Collect all added/context lines across all rendered diff hunks (text content of code cells, with their `data-` line numbers and file path from the file header).
2. Run a small set of **JS/TS definition regexes** against that text for the target `symbol`:
   - `function\s+Sym\b`
   - `(?:export\s+)?(?:async\s+)?function\s+Sym\b`
   - `(?:const|let|var)\s+Sym\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|[A-Za-z_$])` (arrow/function expr)
   - `class\s+Sym\b`
   - `(?:Sym)\s*\([^)]*\)\s*\{` and `(?:get|set)?\s*Sym\s*\([^)]*\)\s*\{` (method/shorthand) — only matched inside a `class`/object context heuristically; if ambiguous, still offer it.
   - `(?:export\s+)?(?:type|interface|enum)\s+Sym\b`
3. First match wins (ranked: `function`/`class`/`type` declarations above method/property). Resolve to `{ path, line, side }`.
4. If the match is in a **currently-visible file**, mark `sameFileInPr=true` so "jump" is an in-page scroll (§5).

**Deferred (explicitly):** real tree-sitter/AST parsing, scope analysis, multi-language grammars, and resolving symbols in *unchanged* files of the head branch via the git-tree+blob API. Those are the "big unscoped cost" both the risk and accuracy critics flagged (WASM size, CSP `wasm-unsafe-eval`, large-blob perf). **Out for MVP.** Tier 0 is deliberately a cheap, high-precision-for-the-common-shape regex pass; it can produce false negatives (we then fall to Tier 1), which is acceptable.

### Tier 1 — GitHub code search (blackbird), session-authenticated, client-side

**Exact chosen request shape (decisive):**

```ts
const q = `repo:${owner}/${repo} symbol:${sym}`;        // language: omitted — see note
const url = `https://github.com/search?q=${encodeURIComponent(q)}&type=code`;

const res = await fetch(url, {
  method: 'GET',
  credentials: 'include',                 // same-origin; sends _gh_sess/user_session
  headers: { 'Accept': 'application/json' } // the ONLY decisive header
});
const data = await res.json();            // { payload: { results, result_count, logged_in, ... }, title }
```

**Header decision (resolved by the accuracy critic, live-reproduced):** `Accept: application/json` **alone** flips the response to JSON *and* authenticates via cookies. We **do not send** `X-Requested-With` or `GitHub-Verified-Fetch`. Rationale spans all three lenses: they are not functionally required (accuracy), they constitute UI-impersonation that raises ToS/anti-abuse and Chrome Web Store "deceptive behavior" exposure (risk), and omitting them is less code (simplicity). If a live authenticated test ever proves them necessary, we add only `X-Requested-With` and document why.

**`language:` qualifier:** omitted in MVP. The symbol is already scoped by `repo:` + `symbol:`, and the user's primary target is TS/JS; adding `language:typescript` would silently drop a definition that lives in a `.js`/`.tsx`/`.mts` file. Keep the query broad; filter/rank results client-side by extension if needed.

**Caveats the critics raised, and how we handle each:**

| Caveat (critic) | Handling in MVP |
|---|---|
| **Default-branch-only index** — head-branch-only symbols return 0 results (all critics). | Tier 0 already covers head-branch definitions. Tier 1 is invoked for symbols *not found in the diff*, which are overwhelmingly pre-existing default-branch symbols. Graceful: 0 results → fallback UI, never a crash. |
| **Populated `results[]` field names UNVERIFIED** (accuracy: medium; risk: medium). | Parser is written **defensively**: optional-chaining every field, schema-guard, treat any unexpected shape as "no result." Real field names are pinned in the live-validation step (§7) *before* the parser is finalized. We probe candidate keys (`path`, `repository`/`repo_name`, `line_number`/`lineNumber`, `commit_sha`/`oid`, `snippet`/`fragment`) and normalize. |
| **`kind` field source unknown** (accuracy/simplicity/risk). | **OUT.** MVP does not read or display symbol kind. `symbol:` already returns definitions only; we navigate, we don't label. No per-blob symbols endpoint call. |
| **Undocumented endpoint can change without notice** (risk). | **Kill-switch + shape-drift self-check**: if `payload` is absent or `results` is not an array on an otherwise-200 response, disable Tier 1 for the session and route straight to the fallback link. Single feature flag in `storage`. |
| **Secondary rate limits / 429** (risk/simplicity). | Lean throttle (not a full queue — see below). |
| **`protected_org_logins` / SSO-gated repos / logged-out** (risk gap). | If `payload.logged_in === false` → show "sign in to GitHub" state. If the target repo appears in `protected_org_logins` or results are empty for a known-present symbol → show fallback link. |
| **Pagination cap (100/5 pages)** (accuracy). | **No pagination in MVP.** A `repo:`+`symbol:` query returns a handful of definitions. Read page 1 only; if multiple results, render a tiny list (§5). |

**Throttling (lean, per simplicity critic, hardened per risk critic's floor):** Tier 1 fires **only on explicit user gesture** (never hover/scroll/mutation). We implement: (a) **single in-flight request** guard, (b) **de-dupe + 60s in-memory cache** keyed by `owner/repo/sym`, (c) on **429/403** show "GitHub rate-limited this lookup, try again shortly" and set a short cooldown. No background queue, no exponential-backoff scheduler — human click cadence cannot trip secondary limits, and a full state machine is speculative for one-request-per-action.

**Fallback if the primary search-endpoint shape is uncertain at runtime:** the **"Open GitHub code search" link** — `https://github.com/search?q=repo:o/r+symbol:Sym&type=code` opened in a new tab. This is the universal degrade target: it works even if the JSON envelope changes, requires no parsing, and hands the user the exact native UI. It is wired as the catch-all for every Tier 1 failure mode (0 results, shape drift, 429, logged-out).

**Precise-nav bridge: OUT for MVP (decisive).** All three lenses agree. The per-blob code-navigation/symbols endpoint, tree-sitter `kind` disambiguation, and reference (call-site) search add a second API surface for zero go-to-definition value. **Future:** when we want "find references" or kind-labeled results, add the blob symbols endpoint. Noted, not built.

---

## 3) DOM contract

> All selectors are **churn-prone**. Every DOM read is wrapped in try/catch and **fails closed** (no affordance) rather than throwing. Selectors are centralized in one `dom.ts` module so a GitHub redesign is a one-file fix. **The exact current selectors MUST be confirmed live (§7)** — the values below are the contract/intent and the most likely current shapes for both the legacy and React-based "Files changed" views.

**Repo / PR identity (from URL — most stable source):**
```
location.pathname = /<owner>/<repo>/pull/<number>/files
→ owner, repo, prNumber via a single regex on pathname.
```

**Head/base SHA + repo — resolution order (first that succeeds wins):**
1. **Embedded JSON** — GitHub ships PR metadata in the page. Probe, in order:
   - `<script type="application/json" data-target="react-app.embeddedData">` (React PR view) → parse, look for `headRefOid` / `baseRefOid` / `pull_request.head.sha`.
   - The "rich diff" / commit anchors and `.js-reviews-container` data attributes (legacy).
2. **DOM data attributes** — `[data-tagsearch-path]` (file path per file), and the per-file header link to the blob carries the head SHA in its `href` (`/<owner>/<repo>/blob/<headSha>/<path>`). Extract `headSha` from any such blob link.
3. **Compare/permalink anchors** — the "View file" / "..." menu per file links to `.../blob/<sha>/<path>`; harvest `sha`.

We need **headSha** primarily (for permalinks to head-branch context and same-file scroll targets). baseSha is captured opportunistically; MVP scroll/jump uses head-side paths.

**Per-file + per-line contract (legacy diff table and React diff):**
- File container: `[data-tagsearch-path]` or `.file[data-path]` / `copilot-diff-entry` (React). Read `path` from the attribute or the file header `.file-info a[title]`.
- Code lines: legacy `td.blob-code .blob-code-inner`; React rows carry `data-line-number` / per-side `data-grid-cell-id`. Line number cells: `td[data-line-number]` (head side identified by the right-hand column / `data-side="RIGHT"` or class `blob-num-addition`/`blob-num-context`).
- We map **(token → enclosing code cell → file path → line number → side)** from these.

**SPA-nav re-init (Turbo/PJAX — flagged by findings + risk critic):** a one-shot `main()` misses soft navigation into `/files`. Handling:
- Use **WXT's content-script lifecycle + `ctx.isValid`**; re-bind on navigation by listening to `turbo:load` / `turbo:render` **and** a `popstate` + lightweight `location.href` watcher (a `MutationObserver`-free polling check on an interval, or observe the diff container's appearance).
- **Idempotent injection:** a module-level `WeakSet`/flag guards against double-mount; we attach delegated listeners to a stable ancestor (the diff app root) once, so newly lazy-loaded files are covered without re-binding per file.

**Lazy-load handling:** GitHub renders large PRs incrementally and collapses big/long files ("Load diff"). Strategy:
- Listeners are **event-delegated** on the diff root, so files that mount later are handled automatically.
- Tier 0's local scan operates over **currently-rendered** hunks only. If a referenced file's diff is collapsed/unloaded, Tier 0 simply misses it and we fall to Tier 1 — acceptable. We do **not** programmatically expand all diffs (avoids DOM thrash and looks like automation).

**Token-detection strategy (the symbol under the mouse):**
- Primary: on the trigger event, take the element under the pointer (`document.elementFromPoint` for the shortcut; `event.target` for click). If GitHub has already wrapped code in per-token spans (it often does, e.g. `.pl-en`, `.pl-c1`, syntax-highlight spans), read `textContent` of that span and validate it as a JS identifier (`/^[A-Za-z_$][A-Za-z0-9_$]*$/`).
- Fallback (**tokenize text nodes if needed**): if the pointer is over a bare text node (no per-token span), use `caretRangeFromPoint`/`document.caretPositionFromPoint` to get the character offset, then run a small identifier-boundary tokenizer over that text node to extract the word at the offset. This handles non-highlighted or merged-token cells.
- Reject keywords (`if/for/return/const/...`) and non-identifiers; if rejected, no popover.

**Shadow DOM popover (CSS/CSP isolation):** the in-place preview is mounted via **WXT `createShadowRootUi` with `cssInjectionMode: 'ui'`** so Primer CSS cannot leak in and our styles cannot leak out. The popover is positioned at the token's bounding rect. **Caveat handled:** any portal'd sub-element (none planned for MVP — the popover is a single self-contained box) stays inside the shadow root; we do not render to `document.body`.

---

## 4) Build tooling decision + minimal manifest/config/scripts + directory layout

**Decision: WXT (pinned), not plain Vite — but scoped to exactly what the MVP needs.**

The simplicity critic argues plain Vite + hand-written manifest. I diverge **specifically because two MVP-required capabilities are exactly what WXT removes hand-rolling for**: (1) `createShadowRootUi` — the popover **requires** CSS isolation from Primer, and this is genuinely fiddly to do correctly by hand (style injection into a shadow root, lifecycle teardown); (2) **Turbo/PJAX-safe content-script lifecycle** (`ctx.isValid`, re-init), which is the #1 breakage class for GitHub content scripts. WXT solves both directly. We **decline** WXT's speculative surface — **no popup, no options page, no auto-import reliance for app logic, no HMR-driven UI pages.** We pin the version (`wxt@0.20.x`, exact) to neutralize the pre-1.0 breaking-change risk both findings and critics raised. Net: WXT earns its place for *this* feature, not for a roadmap.

**`wxt.config.ts` (minimal):**
```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'PR Jump-to-Definition',
    description: 'Client-side go-to-definition inside GitHub PR diffs. Reuses your GitHub session. No data leaves your browser.',
    // Narrow host scope: PR pages only (review-friendly, minimal footprint)
    host_permissions: ['https://github.com/*'],
    permissions: ['storage'],
    commands: {
      'jump-to-def': {
        suggested_key: { default: 'Ctrl+Shift+J', mac: 'Command+Shift+J' },
        description: 'Jump to definition of the symbol under the cursor',
      },
    },
    // CSP hardening (privacy invariant, §6): only github.com is a connect target.
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; connect-src 'self' https://github.com",
    },
  },
});
```
> Note: `content_scripts.matches` (the real injection gate) is declared in the content entrypoint below, not here. Host scope kept to `github.com`. We deliberately avoid `<all_urls>` and avoid `tabs`.

**`entrypoints/github.content.ts` (the whole app surface for MVP):**
```ts
export default defineContentScript({
  matches: ['https://github.com/*/*/pull/*/files*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    // bind delegated listeners on the diff root (idempotent),
    // re-init on turbo:load / location change, gate on ctx.isValid.
    // mount popover via createShadowRootUi on resolve.
  },
});
```

**`entrypoints/background.ts` (thin — command relay only):**
```ts
export default defineBackground(() => {
  // commands.onCommand fires in the worker, NOT the content script.
  browser.commands.onCommand.addListener(async (cmd) => {
    if (cmd !== 'jump-to-def') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) browser.tabs.sendMessage(tab.id, { type: 'jump-to-def' });
  });
});
```
> Listener registered at **top level** so it survives service-worker restarts. No resolver/queue state in the worker — all auth fetches and state stay in the content script (cookie context + survives worker death).

**Directory layout:**
```
.
├─ entrypoints/
│  ├─ github.content.ts        # content script (matches PR /files)
│  └─ background.ts            # command → message relay only
├─ src/
│  ├─ dom.ts                   # ALL selectors + context extraction (one churn-point)
│  ├─ token.ts                 # token-under-pointer detection + text-node tokenizer
│  ├─ resolver/
│  │  ├─ index.ts              # tiered orchestration + cache + in-flight guard
│  │  ├─ tier0-diff.ts         # local diff-scan definition regexes
│  │  └─ tier1-search.ts       # blackbird fetch + defensive parser + kill-switch
│  ├─ popover.ts               # shadow-root popover render + jump action
│  └─ types.ts                 # DefinitionResult, PageContext
├─ public/icon-128.png
├─ wxt.config.ts
├─ tsconfig.json
├─ package.json
└─ .nvmrc
```

**`package.json` scripts (minimal):**
```json
{
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "compile": "tsc --noEmit",
    "postinstall": "wxt prepare"
  }
}
```

---

## 5) Interaction / UX details

**Trigger — shortcut (primary) via `commands`, click (secondary) in-page:**
- **Shortcut** uses MV3 `commands` (`Ctrl+Shift+J` / `Cmd+Shift+J`). Critical mechanic (findings + risk critic): `commands.onCommand` fires in the **background worker**, not the content script. Flow: keypress → `background.ts` → `tabs.sendMessage(tab.id, {type:'jump-to-def'})` → content script reads the **last known mouse position** (we track `mousemove` cheaply, throttled) → `document.elementFromPoint(x,y)` → token detection → resolve. We do **not** use an in-page `keydown` listener for the global shortcut (it would compete with GitHub's own keybindings and not benefit from the user-configurable `commands` UI). A `mousemove` tracker is necessary because by the time the command arrives, there's no event target.
- **Click (secondary):** a delegated `click` listener on the diff root; modifier-gated to avoid hijacking normal clicks/selection — we trigger on a plain click on an identifier token **only when the popover is opened via a small affordance**, OR simplest: trigger on the shortcut, and additionally support a click while the popover-mode is armed. **MVP decision:** shortcut is the primary path; click triggers resolution **only with a modifier** (e.g. `Alt`+click) so we never interfere with text selection, link clicks, or GitHub's line-comment UI. This keeps the secondary trigger unambiguous and low-risk.

**Popover contents (Shadow DOM):**
- Header: `Sym` + a muted source tag — `in this PR` (Tier 0) or `code search` (Tier 1).
- Body: the definition snippet — for Tier 0, the matched diff line(s) (we already have the text); for Tier 1, `payload.results[i]` snippet/fragment if present, else just `path:line`.
- Location line: `path/to/file.ts:Ln`.
- Primary action button: **"Jump to definition"**.
- Multi-result (Tier 1 returns >1): render a **tiny list** (max ~5) of `path:line`, each a jump target. No disambiguation by kind (out).
- Failure states (single line + the universal fallback link): `Not found on default branch — Open GitHub code search ↗`; `Sign in to GitHub to search ↗`; `GitHub rate-limited this lookup — try again`.
- Dismiss: `Esc`, click-outside, or scroll.

**Jump behavior (decisive):**
- **Same file, already in the PR diff on screen** (`sameFileInPr` / Tier 0 hit in a rendered file): **in-page smooth-scroll** to the target diff row + briefly flash/highlight it. No navigation, no new tab — fastest path, stays in review context.
- **Otherwise** (Tier 1 result, or a file not rendered): **open the blob permalink at the line in a new tab** — `https://github.com/<owner>/<repo>/blob/<sha>/<path>#L<line>`, using the SHA from the result's permalink when present (Tier 1) or `headSha` (Tier 0 miss-in-view). New tab preserves the reviewer's place in the PR.

**Deferred UX (say so):** no in-popover full-file blob preview (would need a blob fetch + bigger panel), no "find references", no hover-preview (hover triggers would inflate request volume — explicitly avoided per risk critic). No popup/options UI.

---

## 6) Risk register + PRIVACY statement

| # | Risk (lens) | Severity | Mitigation (in MVP) |
|---|---|---|---|
| R1 | **ToS / anti-abuse**: automating an undocumented session-authenticated endpoint; header-impersonation. | High | Drop `X-Requested-With`/`GitHub-Verified-Fetch` entirely (Accept-only). **Every network call is user-gesture-initiated** (shortcut/modifier-click) — no polling, prefetch, or crawling. Tier 0 (local) handles many cases with **zero** requests. Single in-flight + 60s de-dupe cache + 429 cooldown. Traffic pattern ≈ "a human clicking." |
| R2 | **Privacy / exfiltration** of private repo source. | High | See PRIVACY statement. Enforced by CSP `connect-src 'self' https://github.com`; no analytics/crash SDK; no off-origin writes; private blob/diff text held only transiently in content-script memory. |
| R3 | **Head-branch symbol not in code-search index.** | High | **Tier 0 resolves head-branch definitions locally from the diff DOM** — primary mitigation. Tier 1 covers default-branch (the common callee case). 0-result → fallback link, never a crash. |
| R4 | **Undocumented JSON envelope / `results[]` shape drift.** | Medium | Live-pin field names before finalizing parser (§7); **defensive parser** (optional-chaining, schema-guard, unknown→"no result"); **shape-drift self-check + session kill-switch** routes to fallback link. |
| R5 | **Turbo/PJAX soft-nav** breaks one-shot init. | Medium | Re-bind on `turbo:load` + location watch; `ctx.isValid` gates DOM work; idempotent, delegated listeners. |
| R6 | **Selector churn** (GitHub redesigns). | Medium | All selectors centralized in `dom.ts`; every DOM read try/catch + fail-closed; URL-derived identity preferred over DOM. |
| R7 | **Secondary rate limit / 429** against the user's account. | Medium | User-gesture-only triggers; single in-flight; de-dupe cache; on 429/403 → cooldown + surfaced message, **no auto-retry storm**. |
| R8 | **Chrome Web Store review friction** (broad perms, reads private code). | Medium | Narrow content-script match (`/pull/*/files*`); only `storage` + `github.com` host; honest single-purpose description; no impersonation headers; clear privacy disclosure. |
| R9 | **MV3 service-worker lifecycle** drops state / loses cookie context if fetch moves to worker. | Low | **All auth fetches stay in content script.** Worker only relays the command; listener at top level; no resolver state in worker. |
| R10 | **MV3 CSP / remote code.** | Low | Everything bundled by WXT; no `eval`, no CDN imports, no remote code. (No WASM in MVP — tree-sitter deferred, so no `wasm-unsafe-eval` needed.) |
| R11 | **WXT pre-1.0 breaking changes.** | Low | Pin exact version; review release notes on upgrade. |
| R12 | **SSO/SAML-gated or logged-out** repos. | Low | `payload.logged_in===false` → sign-in prompt; `protected_org_logins`/empty → fallback link. |

**PRIVACY statement (the invariant, to be protected):**
> **No repository data ever leaves the user's browser.** The extension makes only **same-origin requests to github.com**, authenticated solely by the user's **existing session cookies** — exactly as if the user were clicking in the GitHub UI themselves. There is **no backend, no PAT, no OAuth, no analytics, no crash reporting, and no third-party network destination.** Private source code read from the diff DOM or returned by code search is held **transiently in content-script memory** to render the popover and is never transmitted off-origin or persisted to `chrome.storage` (storage holds only the Tier-1 kill-switch flag and a short-lived in-memory cache). This invariant is **enforced at the platform level** by an extension CSP whose `connect-src` permits only `https://github.com`, so a future regression cannot exfiltrate to an arbitrary host. "No data leaves the browser" is a **reviewed invariant**: any PR adding telemetry, sharing, an external index, or a server-side call must be rejected.

---

## 7) LIVE-VALIDATION CHECKLIST (must do in the user's authenticated browser — subagents could not hit authed GitHub)

Run these in DevTools on a **logged-in** session, on a **real private-repo PR**, **before finalizing the parser and selectors.** These gate the MVP.

**A. Tier 1 endpoint + auth + envelope**
1. In the console on a `github.com` tab, run the exact MVP fetch with **`Accept` only** against a known symbol in a private repo you can access:
   ```js
   fetch('https://github.com/search?q='+encodeURIComponent('repo:OWNER/REPO symbol:SOME_FN')+'&type=code',
     {headers:{Accept:'application/json'}, credentials:'include'}).then(r=>r.json()).then(d=>console.log(d.payload))
   ```
   Confirm: `payload.logged_in === true`, `result_count > 0`, content-type was JSON. **(Confirms Accept-only authenticates — accuracy critic's resolved claim, re-verify on a private repo.)**
2. **Capture `payload.results[0]` verbatim** and record exact key names for: **file path**, **repository owner/name**, **matched line number(s)**, **commit/tree SHA used in the permalink**, **snippet/fragment HTML structure**. → These become the parser's field map. **This is the single highest-priority validation item.**
3. Confirm whether a **`kind`** field exists on results (informational only — MVP ignores it; just record for future).
4. Confirm there is a usable **permalink / blob URL** (or enough fields to construct `/<owner>/<repo>/blob/<sha>/<path>#L<line>`).
5. Trip the failure modes once: a symbol **not on the default branch** → expect 0 results (confirms Tier 0 is the right owner of that case). A repo behind **org SSO** → record `protected_org_logins`/behavior.
6. (Optional, low-priority) Note any **429** body/headers if you hammer it — just to confirm our cooldown message wording; do **not** stress-test the account hard.

**B. DOM contract (on the same private PR `/files` page)**
7. Confirm the **content-script match** `https://github.com/*/*/pull/*/files*` is the right pattern for the current URL, and that **Turbo soft-nav** into `/files` (clicking the "Files changed" tab from the PR overview) is observable via `turbo:load`/`turbo:render` or a `location` change.
8. Identify the **current** selectors for: per-file container + `path`, per-line code cell + line-number attribute + head/base side. Record exact attributes/classes (legacy vs React view — check which the user sees).
9. Find where **headSha/baseSha** actually live: inspect `script[type="application/json"]` blocks and per-file blob `href`s; confirm one reliable extraction path.
10. Verify **token detection**: do code tokens sit in per-token spans (read `textContent`) or bare text nodes (need `caretRangeFromPoint` + tokenizer)? Test both a highlighted and a long/collapsed file.

**C. Platform**
11. Confirm `Ctrl+Shift+J` / `Cmd+Shift+J` reaches `commands.onCommand` in the worker with **no conflict** with GitHub/browser bindings, and the message reaches the content script.
12. Confirm `createShadowRootUi` + `cssInjectionMode:'ui'` renders the popover with **no Primer CSS leakage** and positions correctly over a diff token.
13. Pin the installed **WXT version** and skim its release notes.

---

## 8) Step-by-step MVP implementation plan (small, verifiable steps)

> Plan ordering: validate the two gating unknowns (A2, B7-B10) first, then build inside-out (context → token → Tier 0 → popover → jump → Tier 1). Each step has a concrete verify.

1. **Live-validate the two gates.** Do §7 items **A1–A2** and **B7–B10**.
   → *verify:* you have (a) a written field map for `payload.results[0]`, and (b) confirmed selectors for path/line/SHA + that the match pattern fires on `/files` incl. soft-nav. **Do not proceed to the parser without A2.**

2. **Scaffold WXT project, pinned.** `npx wxt@latest init` (vanilla TS), pin exact version, add `wxt.config.ts` from §4, create the directory layout, add `.nvmrc`.
   → *verify:* `pnpm compile` passes; `pnpm dev` loads the unpacked extension in Chrome with no console errors on a `github.com` PR page.

3. **Content-script lifecycle skeleton.** In `github.content.ts`: mount on PR `/files`, re-init on `turbo:load` + location change, gate on `ctx.isValid`, idempotent guard. Log a one-time "armed on <url>".
   → *verify:* navigating PR overview → "Files changed" via the tab logs "armed" exactly once; full reload also logs once; no double-mount.

4. **Page context extraction (`dom.ts`).** Implement `getPageContext()` → `{owner, repo, prNumber, headSha, baseSha?}` using URL + the SHA path confirmed in step 1, all try/catch fail-closed.
   → *verify:* on 3 different private PRs, `console.log(getPageContext())` yields correct owner/repo/PR and a valid `headSha` that resolves to a real `/blob/<sha>/...` URL.

5. **Token detection (`token.ts`).** Track throttled `mousemove` position; implement `tokenAtPoint(x,y)` (span `textContent` path + text-node `caretRangeFromPoint` tokenizer fallback); reject keywords/non-identifiers.
   → *verify:* hovering various identifiers in both a highlighted and a long file and triggering returns the correct symbol string; hovering whitespace/keywords/punctuation returns null.

6. **Command + click wiring.** `background.ts` relays `jump-to-def`; content script handles the message (uses last mouse pos) and `Alt`+click handler. Stub resolve = `console.log(symbol, context)`.
   → *verify:* `Cmd/Ctrl+Shift+J` over a token logs `{symbol, context}`; `Alt`+click over a token logs the same; plain click and text-selection are unaffected.

7. **Tier 0 resolver (`tier0-diff.ts`).** Scan rendered diff hunks; run the JS/TS definition regexes; return `{path, line, side, snippet, sameFileInPr}` or null.
   → *verify:* unit-test the regexes against fixtures (function decl, arrow const, class, method, interface) — all resolve to the right line; in a real PR that *adds* a function, triggering on a call site of that new function resolves Tier 0 with `sameFileInPr` correct.

8. **Shadow-DOM popover (`popover.ts`).** `createShadowRootUi` box anchored at token rect: header (symbol + source tag), snippet, `path:line`, "Jump to definition" button, failure/fallback states, `Esc`/click-outside/scroll dismiss.
   → *verify:* triggering on a Tier-0 hit shows a correctly positioned popover with no Primer style bleed (inspect computed styles inside shadow root); `Esc` dismisses.

9. **Jump action.** Same-file-in-view → smooth-scroll + flash the target diff row; else → `window.open(blobPermalink#Ln,'_blank')`.
   → *verify:* a Tier-0 same-file hit scrolls to and flashes the definition row; a constructed cross-file permalink opens the blob at the correct line in a new tab.

10. **Tier 1 resolver (`tier1-search.ts`).** Accept-only fetch; **defensive parser** using the step-1 field map; normalize to `DefinitionResult`; single in-flight guard + 60s de-dupe cache; `logged_in===false`/0-results/429 → fallback link; shape-drift self-check sets the session kill-switch.
   → *verify:* triggering on a **pre-existing default-branch** symbol (not in the diff) returns a real result and renders/jumps; a fabricated symbol returns the "Open GitHub code search" fallback; simulating a malformed envelope flips the kill-switch and routes to fallback (no throw).

11. **Tiered orchestration (`resolver/index.ts`).** Tier 0 → on miss Tier 1 → on miss/disabled fallback link. Multi-result Tier 1 → tiny list in popover.
   → *verify:* one PR exercises all three outcomes end-to-end (in-diff def, default-branch def, not-found fallback) via the shortcut, each rendering the correct popover and jump/Link behavior.

12. **Hardening pass.** Confirm CSP `connect-src` blocks non-github hosts; confirm no analytics/remote code; confirm worker holds no state and listeners are top-level; manual run through the §7 checklist remaining items (A5-6, B8 churn, C11-13).
   → *verify:* attempting a `fetch` to a non-github host from an extension page is blocked by CSP; killing the service worker (DevTools → terminate) and pressing the shortcut still resolves (content-script-owned); full §7 checklist passes.

13. **Package.** `pnpm build` → load `.output/chrome-mv3` unpacked for a final smoke test; `pnpm zip` for distribution; write the single-purpose store description + privacy disclosure from §6.
    → *verify:* freshly loaded built (non-dev) extension performs all three resolve outcomes on a real private PR; `tsc --noEmit` clean.

---

### Summary of what was DEFERRED (explicit)
- **Precise-nav bridge / per-blob symbols endpoint / `kind` labeling / find-references** — out; revisit when adding "find references."
- **Client-side tree-sitter/AST parsing + git-tree-at-head-SHA + blob fetch** for symbols defined in *unchanged* head-branch files — out (WASM size, CSP, large-blob perf). Tier 0's regex diff-scan covers the head-branch *changed-file* case; Tier 1 covers default-branch.
- **`language:` filtering, pagination, multi-language prefixed-symbol forms (Go/Rust), regex symbol queries** — out; TS/JS broad query only.
- **Enterprise host config, popup, options page, full request queue/exponential-backoff scheduler, hover-trigger, in-popover full-blob preview** — out.
- **Impersonation headers** (`X-Requested-With`, `GitHub-Verified-Fetch`) — deliberately not sent.

Dossier complete. The two hard gates before any parser/selector code: live-capture `payload.results[0]` field names and confirm the current PR `/files` selectors + Turbo re-init (§7 A2, B7–B10).
