import { apiFetch } from "./api";
import type { DailyReport, WeeklyReport, MonthlyReport } from "../types/report";

export const reportsApi = {
  daily:   () => apiFetch<DailyReport>("/api/v1/reports/daily"),
  weekly:  () => apiFetch<WeeklyReport>("/api/v1/reports/weekly"),
  monthly: () => apiFetch<MonthlyReport>("/api/v1/reports/monthly"),
};
