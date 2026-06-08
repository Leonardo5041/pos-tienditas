export type User = {
  id: string
  name: string
  phone: string
  role: 'owner' | 'cashier' | 'inventory'
  active: boolean
  created_at: string
}

export type StoreProfile = {
  id: string
  name: string
  slug: string
  plan: 'free' | 'pro' | 'plus'
  phone: string | null
}
