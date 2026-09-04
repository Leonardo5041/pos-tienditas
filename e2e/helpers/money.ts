/** "$1,234.56" → 1234.56 */
export function parseMoneyText(text: string): number {
  return parseFloat(text.replace(/[$,\s]/g, ''));
}
