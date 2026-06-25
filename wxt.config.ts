import { defineConfig } from 'wxt';

// Full design rationale: docs/architecture.md
export default defineConfig({
  manifest: {
    name: 'PR Jump-to-Definition',
    description:
      'Client-side go-to-definition inside GitHub PR diffs. Reuses your GitHub session. No data leaves your browser.',
    // Narrow host scope; the real injection gate is the content script `matches`.
    host_permissions: ['https://github.com/*'],
    permissions: ['storage'],
    commands: {
      'jump-to-def': {
        suggested_key: { default: 'Ctrl+Shift+J', mac: 'Command+Shift+J' },
        description: 'Jump to definition of the symbol under the cursor',
      },
    },
    // Privacy invariant: github.com is the only allowed network destination.
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; connect-src 'self' https://github.com",
    },
  },
});
