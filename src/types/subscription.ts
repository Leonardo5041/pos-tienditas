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
      'Ventas de alta velocidad con escáner',
      'Ventas a granel con decimales',
      'Inventario básico',
      'Reportes diarios de caja',
      'Modo offline garantizado',
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
      'Alertas de stock mínimo',
      'Venta en negativo para horas pico',
      'Reportes avanzados de ganancias',
      'Multi-cajero para empleados',
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
      'Fiado integrado (gestión de créditos)',
      'Bloqueo de seguridad por turno de cajero',
      'Usuarios ilimitados',
      'Soporte prioritario',
    ],
  },
]

export type SubscriptionStatus = {
  plan: Plan
  plan_name: string
  product_id: string | null
  expires_at: string | null
  is_active: boolean
  subscription_id: string | null
}
