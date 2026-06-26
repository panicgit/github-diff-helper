// Demo module for GitHub Diff Helper screenshots.
//
// While reviewing this diff, double-click a function name below (or press
// Ctrl/Cmd+Shift+Y, or Alt-click) to jump to where it is defined:
//   - calculateOrderTotal / formatCurrency / OrderSummary  ->  defined in ./payments.ts (in this PR)
//   - getPageContext / renderPopover                       ->  defined elsewhere in the repo (code-search fallback)

import {
  calculateOrderTotal,
  formatCurrency,
  OrderSummary,
  type LineItem,
} from './payments';

const cart: LineItem[] = [
  { name: 'Coffee', unitPrice: 4.5, quantity: 2 },
  { name: 'Bagel', unitPrice: 3.25, quantity: 1 },
  { name: 'Sandwich', unitPrice: 7.0, quantity: 1 },
];

const total = calculateOrderTotal(cart);
const label = formatCurrency(total);
const summary = new OrderSummary(cart);

console.log('Order total:', label);
console.log(summary.describe());
