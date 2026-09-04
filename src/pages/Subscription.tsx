import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { stripeApi } from '@/lib/stripe'
import { PLANS } from '@/types/subscription'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function Subscription() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)

  const { data: status } = useQuery({
    queryKey: ['stripe', 'status'],
    queryFn: stripeApi.getStatus,
    enabled: !!user,
  })

  const { data: planPrices } = useQuery({
    queryKey: ['stripe', 'plans'],
    queryFn: stripeApi.getPlans,
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  })

  const formatPlanPrice = (productId: string, fallback: string): string => {
    const found = planPrices?.find(p => p.product_id === productId)
    if (!found) return fallback
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: found.currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(found.amount / 100)
  }

  const handleSelectPlan = async (productId: string) => {
    setLoadingPlan(productId)
    try {
      const { checkout_url } = await stripeApi.createCheckout(productId)
      window.location.href = checkout_url
    } catch (err: unknown) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Error desconocido'))
      setLoadingPlan(null)
    }
  }

  const handlePortal = async () => {
    setPortalLoading(true)
    try {
      const { portal_url } = await stripeApi.getPortalUrl()
      window.location.href = portal_url
    } catch (err: unknown) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Error desconocido'))
      setPortalLoading(false)
    }
  }

  const currentPlan = status?.plan ?? 'free'
  const hasActivePlan = status?.is_active === true
  const isOnTrial = status?.is_on_trial === true && currentPlan === 'free'
  const trialExpired = status?.is_on_trial === false && currentPlan === 'free' && !hasActivePlan

  const planEmoji: Record<string, string> = {
    basico: '🏪',
    recomendado: '📈',
    oro: '💎',
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          ←
        </button>
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-[#f0f0f0]">Elige tu plan</h1>
          <p className="text-sm text-[#666] mt-1">Cancela cuando quieras. Sin contratos.</p>
          {hasActivePlan && status && (
            <div
              className="inline-flex items-center px-4 py-2 rounded-full text-sm mt-3"
              style={{
                background: 'rgba(0,229,160,0.1)',
                border: '1px solid rgba(0,229,160,0.2)',
                color: '#00e5a0',
              }}
            >
              {planEmoji[currentPlan] ?? ''} Plan {status.plan_name} activo
              {status.expires_at && ` · vence ${formatDate(status.expires_at)}`}
            </div>
          )}
        </div>
        <div className="w-9" />
      </div>

      {/* Trial active banner */}
      {isOnTrial && status && (
        <div
          className="mx-4 mb-2 rounded-[14px] px-5 py-4 flex items-center gap-4"
          style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.15)' }}
        >
          <span className="text-2xl flex-shrink-0">🎉</span>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: '#00e5a0' }}>
              Estás en tu período de prueba gratuita
            </p>
            <p className="text-xs mt-1" style={{ color: '#666' }}>
              Te quedan {status.trial_days_left} días de acceso completo. Elige un plan para continuar sin interrupciones.
            </p>
            <div className="mt-3 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  background: '#00e5a0',
                  width: `${Math.round((14 - status.trial_days_left) / 14 * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Trial expired banner */}
      {trialExpired && (
        <div
          className="mx-4 mb-2 rounded-[14px] px-5 py-4"
          style={{ background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)' }}
        >
          <p className="text-sm font-semibold" style={{ color: '#ff6b6b' }}>
            Tu período de prueba ha vencido
          </p>
          <p className="text-xs mt-1" style={{ color: '#666' }}>
            Elige un plan para seguir usando Mi Tiendita POS
          </p>
        </div>
      )}

      {/* Plan cards */}
      <div className="px-4 py-4 flex flex-col gap-4 md:grid md:grid-cols-3 md:gap-4 md:max-w-[960px] md:mx-auto">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.plan
          const isLoading = loadingPlan === plan.id

          return (
            <div
              key={plan.id}
              className="relative rounded-[20px] p-6"
              style={
                plan.highlight
                  ? {
                      background:
                        'radial-gradient(ellipse at 0% 0%, rgba(0,229,160,0.13) 0%, #0d1a12 55%, #0a130e 100%)',
                      border: '1.5px solid rgba(0,229,160,0.45)',
                      boxShadow:
                        '0 0 0 1px rgba(0,229,160,0.1), 0 0 32px rgba(0,229,160,0.12), inset 0 0 24px rgba(0,229,160,0.04)',
                    }
                  : {
                      background: '#1a1a1a',
                      border: '1.5px solid rgba(255,255,255,0.08)',
                    }
              }
            >
              {plan.highlight && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold whitespace-nowrap"
                  style={{ background: '#00e5a0', color: '#000' }}
                >
                  Más popular
                </div>
              )}

              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">{plan.emoji}</span>
                <span className="text-lg font-bold text-[#f0f0f0]">{plan.name}</span>
              </div>

              {plan.savings && (
                <div
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold mb-3"
                  style={{
                    background: 'rgba(255,217,61,0.1)',
                    border: '1px solid rgba(255,217,61,0.2)',
                    color: '#ffd93d',
                  }}
                >
                  {plan.savings}
                </div>
              )}

              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-[#f0f0f0]" style={{ fontFamily: 'DM Mono, monospace' }}>
                  {formatPlanPrice(plan.id, plan.price)}
                </span>
                <span className="text-sm text-[#666]">/{plan.period}</span>
              </div>
              <p className="text-xs text-[#555] mt-1 mb-5">{plan.period_tag}</p>

              <div className="h-px mb-5" style={{ background: 'rgba(255,255,255,0.06)' }} />

              <div className="flex flex-col gap-3 mb-6">
                {plan.features.map((f) => (
                  <div key={f} className="flex items-start gap-3">
                    <Check size={14} color="#00e5a0" className="flex-shrink-0 mt-0.5" />
                    <span
                      className="text-sm"
                      style={{
                        color: f.startsWith('Todo lo del') ? '#f0f0f0' : '#999',
                        fontWeight: f.startsWith('Todo lo del') ? 500 : 400,
                      }}
                    >
                      {f}
                    </span>
                  </div>
                ))}
              </div>

              <button
                disabled={isCurrent || isLoading || !!loadingPlan}
                onClick={() => !isCurrent && handleSelectPlan(plan.id)}
                className="w-full h-12 rounded-[12px] font-bold text-base flex items-center justify-center gap-2 transition-opacity"
                style={
                  isCurrent
                    ? {
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#555',
                      }
                    : plan.highlight
                    ? { background: '#00e5a0', color: '#000' }
                    : {
                        background: '#242424',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#f0f0f0',
                      }
                }
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Redirigiendo...
                  </>
                ) : isCurrent ? (
                  'Plan actual'
                ) : (
                  `Elegir ${plan.name} →`
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Manage subscription */}
      {hasActivePlan && (
        <div
          className="mx-4 mt-2 mb-8 rounded-[16px] p-5"
          style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <p className="text-sm font-semibold text-[#f0f0f0] mb-2">Gestionar suscripción</p>
          <p className="text-xs text-[#666] mb-4">
            Cambia tu método de pago, descarga facturas o cancela tu plan desde el portal de Stripe.
          </p>
          <button
            disabled={portalLoading}
            onClick={handlePortal}
            className="w-full h-11 rounded-[12px] text-sm font-medium flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#999',
            }}
          >
            {portalLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Abriendo portal...
              </>
            ) : (
              'Abrir portal de Stripe →'
            )}
          </button>
        </div>
      )}
    </div>
  )
}
