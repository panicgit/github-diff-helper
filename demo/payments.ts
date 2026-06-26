// Demo module for GitHub Diff Helper screenshots.
// Defines a few functions/classes that are called from ./checkout.ts.

export interface LineItem {
  name: string;
  unitPrice: number;
  quantity: number;
}

export function lineSubtotal(item: LineItem): number {
  return item.unitPrice * item.quantity;
}

export function calculateOrderTotal(items: LineItem[]): number {
  return items.reduce((sum, item) => sum + lineSubtotal(item), 0);
}

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export class OrderSummary {
  constructor(private readonly items: LineItem[]) {}

  total(): number {
    return calculateOrderTotal(this.items);
  }

  describe(): string {
    return `Total: ${formatCurrency(this.total())}`;
  }
}
