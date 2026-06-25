# GitHub Diff Helper

A Manifest V3 Chrome extension that removes friction from reviewing GitHub pull request diffs.

> **Status:** early development. The first feature is **go-to-definition inside PR diffs**.

## The problem

When you review a pull request on GitHub, the diff shows you the *changed lines* — but
not the rest of the codebase. So when a changed line calls some `doSomething()`, there's
no quick way to see **what that function is or where it's defined**. GitHub's native code
navigation works on the file (blob) view, but **not inside PR diffs**.

## MVP: Go to definition in PR diffs

Put the cursor on a symbol in a PR diff, hit a shortcut, and jump to (or preview) where
it's defined.

- **No backend.** Everything runs in your browser.
- **Works with private & org repos** by reusing your existing GitHub login session — no
  token setup, and nothing leaves your browser.

## Tech

- TypeScript + Vite
- Manifest V3
- Resolves definitions client-side by reusing GitHub's own code search (authenticated via
  your existing session)

## Roadmap (later)

Broader PR-diff review improvements: large-diff navigation, auto-collapsing noisy files
(lockfiles / generated code), review-progress tracking, and readability tweaks.

## Privacy

No backend, no analytics, no data leaves your browser. The extension only talks to GitHub,
as you, using your existing session.
