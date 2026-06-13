export type ExpenseCategory = 'mercancia' | 'servicios' | 'mantenimiento' | 'personal' | 'otros';

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  mercancia:     '🛒 Mercancía',
  servicios:     '💡 Servicios',
  mantenimiento: '🔧 Mantenimiento',
  personal:      '👤 Personal',
  otros:         '📦 Otros',
};

export type Expense = {
  id:          string;
  category:    ExpenseCategory;
  description: string | null;
  amount:      number;
  created_at:  string;
};

export type ExpenseSummary = {
  total_expenses: number;
  total_sales:    number;
  profit:         number;
  by_category:    { category: string; amount: number }[];
};
