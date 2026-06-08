export type CreditAccount = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  balance: number;
  last_payment: string | null;
  created_at: string;
  days_since_payment: number;
};

export type CreditTransaction = {
  id: string;
  amount: number;
  note: string | null;
  created_at: string;
};
