# Chrome Web Store listing — copy & answers

Everything you need to paste into the Web Store Developer Dashboard. Build the
upload with `npm run zip` (produces `.output/*.zip`).

---

## Item name (must match manifest `name`)

```
GitHub Diff Helper: Go to Definition
```

## Summary (≤132 chars)

```
Jump to a function's definition right inside GitHub pull request diffs. Double-click a symbol. No backend, no token.
```

## Category

`Developer Tools`

## Language

English (add Korean later if desired)

---

## Detailed description

```
Reviewing a pull request on GitHub, you constantly hit a function or class you
don't recognize — but the diff only shows the changed lines, not where things
are defined. GitHub's code navigation works on file views, but not inside PR
diffs.

GitHub Diff Helper fixes that. While reviewing a PR diff:

• Double-click an identifier (or press Ctrl/Cmd+Shift+Y, or Alt-click it).
• A small popover shows where it's defined, with a "Jump to definition" action.
• If it's defined in the PR, it scrolls to and highlights the definition line.
• If it's defined elsewhere in the repo, it falls back to GitHub code search —
  using your existing login, so private and organization repos work too.

100% client-side:
• No backend server.
• No GitHub token or extra login — it reuses your existing GitHub session.
• No analytics, no tracking, and nothing leaves your browser. Network access is
  locked to github.com by the extension's content security policy.

Supports definition detection across Kotlin, Java, JavaScript/TypeScript,
Python, Go, and more.
```

## Single purpose (required)

```
Help developers navigate code while reviewing GitHub pull requests by jumping
from a symbol in a diff to where it is defined.
```

---

## Permission justifications (required)

**`host_permissions` — `https://github.com/*`**
```
The extension runs only on GitHub pull request pages, where it reads the diff to
locate a symbol's definition, and queries GitHub's own code search (using the
user's existing session) when the definition isn't in the diff. github.com is
the only site it touches.
```

**`storage`**
```
Reserved for user preferences (e.g. enabling/disabling features). No personal
data or browsing history is stored.
```

**Remote code:** None. All code is bundled in the package; nothing is loaded
from a remote server.

---

## Privacy practices

- **Does it collect user data?** No.
- **Data usage certifications:** does not sell data; does not use/transfer data
  for purposes unrelated to the single purpose; does not use/transfer data to
  determine creditworthiness or for lending.
- **Privacy policy URL:**
  `https://github.com/panicgit/github-diff-helper/blob/main/docs/PRIVACY.md`
  (or enable GitHub Pages for a cleaner URL)

---

## Screenshots (required: at least 1, 1280×800 or 640×400)

Suggested shots (take on a real PR's "Files changed"):
1. The popover open over a symbol showing **"Jump to definition"** (the core
   value — like the working demo).
2. A jump result: the definition line scrolled into view and highlighted.
3. The code-search fallback popover for a symbol defined elsewhere.

Tip: zoom the browser to ~125% and crop to 1280×800 for crisp store images.

---

## Visibility

Pick at upload time:
- **Public** — listed and searchable.
- **Unlisted** — installable only via direct link (good for personal/team use).
- **Private** — restricted to specified testers / a Google group.

---

## Pre-submit checklist

- [ ] `npm run build` is clean and `npm run zip` produced the upload
- [ ] No debug `console.log` in the shipped bundle
- [ ] Icons present (16/32/48/128)
- [ ] Version bumped in `package.json`
- [ ] Privacy policy URL reachable
- [ ] Screenshots prepared
