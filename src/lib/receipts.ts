import { apiFetch } from "./api";
import type { ProcessedReceipt, ReceiptSummary, ConfirmReceiptInput, ConfirmReceiptResult } from "@/types/receipt";

export const receiptsApi = {
  process: (image_base64: string, mime_type: string, receipt_id?: string) =>
    apiFetch<ProcessedReceipt>("/api/v1/receipts/process", {
      method: "POST",
      body: JSON.stringify({ image_base64, mime_type, ...(receipt_id ? { receipt_id } : {}) }),
    }),

  confirm: (data: ConfirmReceiptInput) =>
    apiFetch<ConfirmReceiptResult>("/api/v1/receipts/confirm", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  list: () =>
    apiFetch<ReceiptSummary[]>("/api/v1/receipts"),
};
