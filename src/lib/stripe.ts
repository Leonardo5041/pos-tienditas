import { apiFetch } from './api'
import type { SubscriptionStatus } from '../types/subscription'

export const stripeApi = {
  createCheckout: (product_id: string) =>
    apiFetch<{ checkout_url: string }>('/api/v1/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ product_id }),
    }),

  getStatus: () =>
    apiFetch<SubscriptionStatus>('/api/v1/stripe/status'),

  getPortalUrl: () =>
    apiFetch<{ portal_url: string }>('/api/v1/stripe/portal'),

  verifySession: (session_id: string) =>
    apiFetch<{ activated: boolean; plan?: string }>('/api/v1/stripe/verify-session', {
      method: 'POST',
      body: JSON.stringify({ session_id }),
    }),
}
