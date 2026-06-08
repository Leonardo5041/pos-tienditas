import { apiFetch } from './api'
import type { User, StoreProfile } from '../types/user'

export const settingsApi = {
  getProfile: () =>
    apiFetch<{ user: User; store: StoreProfile }>('/api/v1/settings/profile'),

  updateProfile: (data: { name?: string; phone?: string }) =>
    apiFetch<User>('/api/v1/settings/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updateStore: (data: { name?: string; phone?: string }) =>
    apiFetch<StoreProfile>('/api/v1/settings/store', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updatePassword: (data: { current_password: string; new_password: string }) =>
    apiFetch<{ message: string }>('/api/v1/settings/password', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
}
