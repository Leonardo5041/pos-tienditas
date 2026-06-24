import { apiFetch } from "./api";
import type { Expense, ExpenseCategory, ExpenseSummary } from "../types/expense";

export const expensesApi = {
  create: (data: { category: ExpenseCategory; description?: string; amount: number; payment_method?: string }) =>
    apiFetch<Expense>("/api/v1/expenses", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  list: (params?: { from?: string; to?: string; category?: string }) => {
    const qs = params
      ? new URLSearchParams(
          Object.fromEntries(
            Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
          )
        ).toString()
      : "";
    return apiFetch<{ expenses: Expense[]; total_amount: number }>(
      `/api/v1/expenses${qs ? "?" + qs : ""}`
    );
  },

  remove: (id: string) =>
    apiFetch<{ message: string }>(`/api/v1/expenses/${id}`, { method: "DELETE" }),

  summary: (params?: { from?: string; to?: string }) => {
    const qs = params
      ? new URLSearchParams(
          Object.fromEntries(
            Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
          )
        ).toString()
      : "";
    return apiFetch<ExpenseSummary>(`/api/v1/expenses/summary${qs ? "?" + qs : ""}`);
  },
};
