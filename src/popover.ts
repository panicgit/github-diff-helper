import type { DefinitionResult } from './types';

export interface PopoverModel {
  symbol: string;
  results: DefinitionResult[];
  fallbackSearchUrl: string;
  /** Bounding rect of the triggering token, for anchoring. */
  anchor: DOMRect;
}

/**
 * Render the definition popover in an isolated Shadow DOM.
 * Stub until step 8 (mount via WXT createShadowRootUi, wire "Jump to definition").
 */
export function renderPopover(_model: PopoverModel): void {
  // TODO(step 8): createShadowRootUi anchored at _model.anchor; show snippet +
  // path:line + jump button; Esc / click-outside / scroll to dismiss.
}
