# GitHub Diff Helper

A Manifest V3 Chrome extension that removes friction from reviewing GitHub pull request diffs.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/ljknkaafpkhdfjcmaajgacfkgmnnehkl?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/github-diff-helper-go-to/ljknkaafpkhdfjcmaajgacfkgmnnehkl)
[![Users](https://img.shields.io/chrome-web-store/users/ljknkaafpkhdfjcmaajgacfkgmnnehkl)](https://chromewebstore.google.com/detail/github-diff-helper-go-to/ljknkaafpkhdfjcmaajgacfkgmnnehkl)
[![Rating](https://img.shields.io/chrome-web-store/rating/ljknkaafpkhdfjcmaajgacfkgmnnehkl)](https://chromewebstore.google.com/detail/github-diff-helper-go-to/ljknkaafpkhdfjcmaajgacfkgmnnehkl)

**▶ [Install from the Chrome Web Store](https://chromewebstore.google.com/detail/github-diff-helper-go-to/ljknkaafpkhdfjcmaajgacfkgmnnehkl)**

> **Status:** published — v0.1.0 on the Chrome Web Store. First feature: **go-to-definition inside PR diffs**.

## The problem

When you review a pull request on GitHub, the diff shows you the *changed lines* — but
not the rest of the codebase. So when a changed line calls some `doSomething()`, there's
no quick way to see **what that function is or where it's defined**. GitHub's native code
navigation works on the file (blob) view, but **not inside PR diffs**.

## What it does (MVP)

On a PR's diff, target a function/identifier and jump to where it's defined:

- **Double-click** the identifier (primary), or
- press **`Ctrl+Shift+Y`** / **`Cmd+Shift+Y`** with the mouse over it, or
- **`Alt`+click** it.

A small popover appears with a **Jump to definition** action:

- **Defined in this PR** → scrolls to the definition line and flashes it (no navigation).
- **Defined elsewhere in the repo** → falls back to your repo's **GitHub code search**
  (uses your existing login session, so private/org repos work).

No backend, no token setup — nothing leaves your browser.

## Build from source (development)

> Most users should just [install from the Chrome Web Store](https://chromewebstore.google.com/detail/github-diff-helper-go-to/ljknkaafpkhdfjcmaajgacfkgmnnehkl). The steps below are for contributors building locally.

### Prerequisites

- **Node 20+** (the repo pins a version in [`.nvmrc`](./.nvmrc)) and **npm**
- Google Chrome

### 1. Install dependencies

```bash
npm install
```

### 2a. Quick dev run (auto-opens a browser with the extension loaded)

```bash
npm run dev
```

WXT launches a Chrome instance with the extension installed and live-reloads on changes.
Note: this is a fresh browser profile (logged out), so the code-search fallback needs you
to sign in to GitHub in that window.

### 2b. Build and load into *your* Chrome (recommended for the code-search feature)

```bash
npm run build      # outputs to .output/chrome-mv3/
```

Then load it once:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the **`.output/chrome-mv3`** folder

Because this is *your* logged-in Chrome, the code-search fallback works against private
repos too.

> **After changing code:** run `npm run build` again, then click the **↻ (reload)** icon
> on the extension's card in `chrome://extensions`. No zip and no re-upload — “Load
> unpacked” reads the folder directly. (A zip is only needed to publish to the Web Store:
> `npm run zip`.)

### Keyboard shortcut

`Ctrl/Cmd+Shift+Y` is the default. View or change it at `chrome://extensions/shortcuts`.

### Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev build + auto-reloading browser |
| `npm run build` | Production build to `.output/chrome-mv3/` |
| `npm run zip` | Package a `.zip` for the Web Store |
| `npm run compile` | Type-check only (`tsc --noEmit`) |

## How it works

100% client-side. The content script runs on github.com PR pages and resolves a symbol in
two tiers:

- **Tier 0 — local diff scan.** Scans the rendered diff for a definition of the symbol
  (Kotlin / Java / JS·TS / Python / Go / …). Instant, no network, and it sees the PR's
  head branch.
- **Tier 1 — code search.** If it's not in the PR, it queries GitHub code search for the
  repo using your **session cookies** (`Accept: application/json`, same-origin) and offers
  the native code-search result.

See [`docs/architecture.md`](./docs/architecture.md) for the full design.

## Project layout

```
entrypoints/
  github.content.ts   # content script: triggers → resolve → popover
  background.ts        # relays the keyboard command to the active tab
src/
  dom.ts               # all GitHub diff selectors + page context (the churn point)
  token.ts             # identifier detection / extraction
  resolver/            # tier0 (diff scan), tier1 (code search), orchestration
  popover.ts           # Shadow-DOM popover + jump action
wxt.config.ts          # manifest (permissions, command, CSP)
```

## Privacy

No backend, no analytics, no data leaves your browser. The extension only talks to GitHub,
as you, using your existing session. Its content security policy restricts network access
to `github.com` only.

## Roadmap (later)

- Jump straight to a definition in another file (parse code-search results inline)
- Broader PR-diff review improvements: large-diff navigation, auto-collapsing noisy files
  (lockfiles / generated code), review-progress tracking, and readability tweaks
