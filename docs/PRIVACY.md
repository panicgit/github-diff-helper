# Privacy Policy — GitHub Diff Helper

**Effective date:** 2026-06-26

GitHub Diff Helper ("the extension") is a browser extension that adds
go-to-definition to GitHub pull request diffs. This policy explains exactly what
it does and does not do with your data.

## Summary

**The extension does not collect, store, sell, or transmit any of your data to
us or to any third party.** There is no backend server and no analytics.

## What the extension accesses

- **Page content on github.com.** When you trigger the feature (double-click an
  identifier, use the keyboard shortcut, or Alt-click), the extension reads the
  code text in the pull request diff on the page to find where the symbol is
  defined. This happens entirely in your browser.
- **GitHub code search, as you.** If the definition is not in the pull request,
  the extension makes a same-origin request to `github.com`'s code search using
  **your existing GitHub login session (cookies)** — exactly as if you searched
  on GitHub yourself. This is the only network request the extension makes, and
  it goes only to `github.com`.

## What the extension does NOT do

- It does **not** send your code, your queries, or any other data to the
  developer or any third-party server.
- It has **no backend**, **no analytics**, **no advertising**, and **no
  tracking**.
- It does **not** require, request, or store a GitHub token.
- It does **not** retain the code it reads; data is held only transiently in
  memory to render the on-page popover and is discarded immediately.

## Permissions

- **`host_permissions: https://github.com/*`** — required to run on GitHub
  pages and to query GitHub code search using your session.
- **`storage`** — reserved for future user settings; no personal data is stored.

A content security policy restricts the extension's network access to
`github.com` only, so it cannot send data to any other destination.

## Data sharing

None. No data is shared with anyone.

## Changes

If this policy changes, the updated version will be published in this
repository with a new effective date.

## Contact

Questions: open an issue at
<https://github.com/panicgit/github-diff-helper/issues>.
