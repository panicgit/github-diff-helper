export interface PageContext {
  owner: string;
  repo: string;
  prNumber: number;
  /** Best-effort PR head SHA (empty string if not found). */
  headSha: string;
}

export interface DefinitionResult {
  source: 'in-diff' | 'search';
  symbol: string;
  path: string;
  line?: number;
  /** For cross-file/search jumps. */
  permalinkUrl?: string;
  snippet: string;
  /** In-diff only: the matched element to scroll to. */
  targetEl?: HTMLElement;
}
