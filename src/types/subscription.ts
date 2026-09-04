export type Plan = 'free' | 'basico' | 'recomendado' | 'oro'

export type PlanConfig = {
  id: string
  name: string
  plan: Plan
  emoji: string
  price: string
  period: string
  period_tag: string
  savings?: string
  highlight: boolean
  features: string[]
}

export const PLANS: PlanConfig[] = [
  {
    id: 'prod_UfS138dDCdwL3W',
    name: 'Básico',
    plan: 'basico',
    emoji: '🏪',
    price: '$149',
    period: 'mes',
    period_tag: 'Mensual',
    highlight: false,
    features: [
      'Ventas con escáner de código de barras',
      'Historial de ventas y reportes',
      'Alertas de stock mínimo',
      'Fiado integrado (crédito a clientes)',
      'Cajeros adicionales',
    ],
  },
  {
    id: 'prod_UfS2NLo8rqZYUb',
    name: 'Recomendado',
    plan: 'recomendado',
    emoji: '📈',
    price: '$399',
    period: 'trimestre',
    period_tag: 'Trimestral',
    savings: 'Ahorra 16%',
    highlight: true,
    features: [
      'Todo lo del Plan Básico',
      'Control de caja y cortes de turno',
      'Registro de gastos por turno',
      'Reporte de rentabilidad por turno',
    ],
  },
  {
    id: 'prod_UfS3eWHWEStviK',
    name: 'Oro',
    plan: 'oro',
    emoji: '💎',
    price: '$1,290',
    period: 'año',
    period_tag: 'Anual',
    savings: 'Ahorra 29%',
    highlight: false,
    features: [
      'Todo lo del Plan Recomendado',
      'Soporte prioritario vía WhatsApp',
      'Acceso anticipado a nuevas funciones',
      'Precio fijo garantizado de por vida',
    ],
  },
]

export type PlanPrice = {
  product_id: string
  plan: Plan
  amount: number
  currency: string
  interval: string
  interval_count: number
}

export type SubscriptionStatus = {
  plan: Plan
  plan_name: string
  product_id: string | null
  expires_at: string | null
  is_active: boolean
  subscription_id: string | null
  effective_plan: string
  is_on_trial: boolean
  trial_days_left: number
  trial_ends_at: string | null
}
