export type HourSale = {
  hour: number;
  amount: number;
};

export type TopProduct = {
  product_name: string;
  units_sold: number;
  revenue: number;
};

export type PaymentMethodStat = {
  method: string;
  count: number;
  amount: number;
};

export type LowStockAlert = {
  id: string;
  name: string;
  stock: number;
  low_stock_threshold: number;
};

export type DailyReport = {
  total_sales: number;
  transaction_count: number;
  avg_ticket: number;
  gross_profit: number;
  yesterday_total: number;
  yesterday_count: number;
  sales_by_hour: HourSale[];
  top_products: TopProduct[];
  payment_methods: PaymentMethodStat[];
  low_stock_alerts: LowStockAlert[];
};

export type WeeklyReport = DailyReport & {
  last_week_total: number;
  last_week_count: number;
};

export type MonthlyReport = DailyReport & {
  last_period_total: number;
  last_period_count: number;
};
