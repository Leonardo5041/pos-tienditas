export const PAYMENT_LABELS: Record<string, string> = {
  cash:     "Efectivo",
  card:     "Tarjeta",
  transfer: "Transferencia",
  credit:   "Fiado",
}

export const PAYMENT_COLORS: Record<string, string> = {
  cash:     "#00e5a0",
  card:     "#74b9ff",
  transfer: "#ff9f43",
  credit:   "#ff6b6b",
}

export function getPaymentLabel(method: string): string {
  return PAYMENT_LABELS[method] ?? method
}

export function getPaymentColor(method: string): string {
  return PAYMENT_COLORS[method] ?? "#666"
}
