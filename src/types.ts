export interface PageContext {
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  baseSha?: string;
}

export type DefinitionSource = 'in-diff' | 'search';

export interface DefinitionResult {
  source: DefinitionSource;
  symbol: string;
  path: string;
  line: number;
  /** Permalink to the definition's blob at the resolved line. */
  permalinkUrl: string;
  /** Short snippet of the definition line(s). */
  snippet: string;
  /** True when the definition is in a file currently rendered in the PR diff. */
  sameFileInPr: boolean;
}
