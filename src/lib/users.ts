import { apiFetch } from './api'
import type { User } from '../types/user'

export const usersApi = {
  list: () =>
    apiFetch<User[]>('/api/v1/users'),

  create: (data: { name: string; phone: string; password: string; role: 'cashier' | 'inventory' }) =>
    apiFetch<User>('/api/v1/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { name?: string; phone?: string; role?: string }) =>
    apiFetch<User>(`/api/v1/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ message: string }>(`/api/v1/users/${id}`, { method: 'DELETE' }),
}
