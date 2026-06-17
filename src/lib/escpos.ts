const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const LINE_WIDTH = 32;

const enc = new TextEncoder();

function pushText(bytes: number[], s: string) {
  bytes.push(...enc.encode(s));
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + ">" : s;
}

function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(2);
}

function rowLR(left: string, right: string, width: number): string {
  const spaces = Math.max(1, width - left.length - right.length);
  return left + " ".repeat(spaces) + right;
}

function separator(): string {
  return "-".repeat(LINE_WIDTH);
}

const PAY_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
};

export type ESCPOSParams = {
  storeName: string;
  cashierName: string;
  sale: {
    id: string;
    total: number;
    payment_method: string;
    created_at: string;
    items: Array<{
      product_name: string;
      quantity: number;
      unit_price: number;
      subtotal?: number;
    }>;
  };
};

export function buildESCPOS(p: ESCPOSParams): Uint8Array {
  const b: number[] = [];

  // Init
  b.push(ESC, 0x40);

  // Store name — center bold
  b.push(ESC, 0x61, 0x01, ESC, 0x45, 0x01);
  pushText(b, truncate(p.storeName, LINE_WIDTH));
  b.push(LF, ESC, 0x45, 0x00);

  // Date + cashier
  const d = new Date(p.sale.created_at);
  const opts = { timeZone: "America/Mexico_City" } as const;
  const dateStr = d.toLocaleDateString("es-MX", { ...opts, day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = d.toLocaleTimeString("es-MX", { ...opts, hour: "2-digit", minute: "2-digit", hour12: false });
  pushText(b, `${dateStr}  ${timeStr}`);
  b.push(LF);
  if (p.cashierName) {
    pushText(b, `Cajero: ${p.cashierName}`);
    b.push(LF);
  }

  pushText(b, separator());
  b.push(LF);

  // Items
  b.push(ESC, 0x61, 0x00);
  for (const item of p.sale.items) {
    const sub = item.subtotal ?? item.unit_price * item.quantity;
    pushText(b, truncate(item.product_name, LINE_WIDTH));
    b.push(LF);
    pushText(b, rowLR(`x${formatQty(item.quantity)} $${item.unit_price.toFixed(2)}`, `$${sub.toFixed(2)}`, LINE_WIDTH));
    b.push(LF);
  }

  pushText(b, separator());
  b.push(LF);

  // Total — large centered
  b.push(ESC, 0x61, 0x01, GS, 0x21, 0x11);
  pushText(b, `$${p.sale.total.toFixed(2)}`);
  b.push(LF, GS, 0x21, 0x00);

  pushText(b, PAY_LABELS[p.sale.payment_method] ?? p.sale.payment_method);
  b.push(LF);

  pushText(b, separator());
  b.push(LF);

  const shortId = p.sale.id.slice(0, 8).toUpperCase();
  pushText(b, `Ref: #${shortId}`);
  b.push(LF, ESC, 0x45, 0x01);
  pushText(b, "Gracias por su compra!");
  b.push(LF, ESC, 0x45, 0x00);

  // Feed + cut
  b.push(LF, LF, LF, GS, 0x56, 0x42, 0x05);

  return new Uint8Array(b);
}
