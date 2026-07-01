export type RegisterStatus = 'open' | 'closed';

export type CashRegister = {
  id:              string;
  cashier_id:      string;
  cashier_name:    string;
  opened_by:       string;
  initial_amount:  number;
  declared_amount: number | null;
  expected_amount: number | null;
  difference:      number | null;
  status:          RegisterStatus;
  notes:           string | null;
  opened_at:       string;
  closed_at:       string | null;
  cash_sales:              number;
  turno_expenses:          number;
  cash_credit_payments:    number;
  credit_sales_generated:  number;
};
