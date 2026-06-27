export type RegisterTicketParams = {
  storeName: string;
  cashierName: string;
  openedAt: string;
  closedAt: string;
  result: {
    initial_amount: number;
    cash_sales: number;
    turno_expenses: number;
    expected_amount: number;
    declared_amount: number;
    difference: number;
  };
};

export function buildRegisterTicket(p: RegisterTicketParams): Uint8Array {
  const b: number[] = [];

  b.push(ESC, 0x40);

  b.push(ESC, 0x61, 0x01, ESC, 0x45, 0x01);
  pushText(b, truncate(p.storeName, LINE_WIDTH));
  b.push(LF, ESC, 0x45, 0x00);

  b.push(ESC, 0x61, 0x01);
  pushText(b, "CORTE DE CAJA");
  b.push(LF);

  b.push(ESC, 0x61, 0x00);
  if (p.cashierName) {
    pushText(b, `Cajero: ${p.cashierName}`);
    b.push(LF);
  }

  const fmtDT = (s: string) => {
    const d = new Date(s);
    const opts = { timeZone: "America/Mexico_City" } as const;
    const date = d.toLocaleDateString("es-MX", { ...opts, day: "2-digit", month: "2-digit", year: "numeric" });
    const time = d.toLocaleTimeString("es-MX", { ...opts, hour: "2-digit", minute: "2-digit", hour12: false });
    return `${date} ${time}`;
  };

  pushText(b, `Apertura: ${fmtDT(p.openedAt)}`);
  b.push(LF);
  pushText(b, `Cierre:   ${fmtDT(p.closedAt)}`);
  b.push(LF);

  pushText(b, separator());
  b.push(LF);

  const row = (label: string, val: string) => {
    pushText(b, rowLR(label, val, LINE_WIDTH));
    b.push(LF);
  };

  row("Fondo inicial", `$${p.result.initial_amount.toFixed(2)}`);
  row("Ventas efectivo", `+$${p.result.cash_sales.toFixed(2)}`);
  if (p.result.turno_expenses > 0) {
    row("Gastos turno", `-$${p.result.turno_expenses.toFixed(2)}`);
  }

  pushText(b, separator());
  b.push(LF);

  row("Total esperado", `$${p.result.expected_amount.toFixed(2)}`);
  row("Declarado", `$${p.result.declared_amount.toFixed(2)}`);

  pushText(b, separator());
  b.push(LF);

  b.push(ESC, 0x45, 0x01);
  const diffSign = p.result.difference >= 0 ? "+" : "";
  row("Diferencia", `${diffSign}$${p.result.difference.toFixed(2)}`);
  b.push(ESC, 0x45, 0x00);

  b.push(ESC, 0x61, 0x01);
  const resultLabel =
    p.result.difference === 0 ? "CAJA CUADRADA" :
    p.result.difference > 0   ? "SOBRANTE EN CAJA" :
                                 "FALTANTE EN CAJA";
  pushText(b, resultLabel);
  b.push(LF, LF, LF, GS, 0x56, 0x42, 0x05);

  return new Uint8Array(b);
}

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

export function buildLabelESCPOS(params: {
  storeName: string;
  productName: string;
  unit: string;
  barcode: string;
  copies: number;
}): Uint8Array {
  const { storeName, productName, unit, barcode, copies } = params;
  const _ESC = 0x1b;
  const _GS = 0x1d;
  const lines: number[] = [];
  const _enc = new TextEncoder();
  const push = (b: number[] | Uint8Array) => lines.push(...Array.from(b));
  const text = (s: string) => push(_enc.encode(s));

  for (let c = 0; c < copies; c++) {
    push([_ESC, 0x40]);
    push([_ESC, 0x61, 0x01]);

    push([_ESC, 0x45, 0x01]);
    text(storeName.slice(0, 24) + "\n");
    push([_ESC, 0x45, 0x00]);

    push([_ESC, 0x45, 0x01]);
    text(productName.slice(0, 48) + "\n");
    push([_ESC, 0x45, 0x00]);

    text(`[${unit}]\n`);

    push([_GS, 0x68, 0x50]);
    push([_GS, 0x77, 0x02]);
    push([_GS, 0x48, 0x02]);
    push([_GS, 0x6b, 67, 13]);
    text(barcode);

    text("\n\n");
    push([_GS, 0x56, 0x01]);
  }
  return new Uint8Array(lines);
}
