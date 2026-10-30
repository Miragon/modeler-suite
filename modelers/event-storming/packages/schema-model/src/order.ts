// Not localeCompare: its order follows the runtime's locale and ICU data, so two machines would
// put the same board in different orders.
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
