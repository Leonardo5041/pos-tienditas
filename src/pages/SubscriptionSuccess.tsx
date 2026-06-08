import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { stripeApi } from '@/lib/stripe'
import { PLANS } from '@/types/subscription'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function SubscriptionSuccess() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const qc = useQueryClient()
  const verified = useRef(false)

  useEffect(() => {
    if (!sessionId || verified.current) return
    verified.current = true
    stripeApi.verifySession(sessionId).then(() => {
      qc.invalidateQueries({ queryKey: ['stripe', 'status'] })
      qc.invalidateQueries({ queryKey: ['settings', 'profile'] })
    }).catch(() => {
      // webhook may have already updated — status query handles it
    })
  }, [sessionId, qc])

  const { data: status } = useQuery({
    queryKey: ['stripe', 'status'],
    queryFn: stripeApi.getStatus,
    refetchInterval: (query) => (query.state.data?.is_active ? false : 2000),
    refetchIntervalInBackground: false,
  })

  const planConfig = PLANS.find((p) => p.plan === status?.plan)

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ background: '#0f0f0f' }}
    >
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 text-5xl font-bold"
        style={{
          background: 'rgba(0,229,160,0.1)',
          border: '2px solid rgba(0,229,160,0.3)',
          color: '#00e5a0',
        }}
      >
        ✓
      </div>

      <h1 className="text-2xl font-bold text-[#f0f0f0] mb-2">¡Suscripción activada!</h1>
      <p className="text-sm text-[#666] mb-8 max-w-[280px]">
        Tu plan ya está activo. Empieza a usar todas las funciones.
      </p>

      {status && planConfig && (
        <div
          className="px-6 py-5 rounded-[16px] mb-8 w-full max-w-[320px]"
          style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <p className="text-lg font-bold text-[#f0f0f0]">
            {planConfig.emoji} Plan {status.plan_name}
          </p>
          {status.expires_at && (
            <p className="text-sm text-[#666] mt-1">
              Válido hasta {formatDate(status.expires_at)}
            </p>
          )}
        </div>
      )}

      <button
        onClick={() => navigate('/dashboard', { replace: true })}
        className="w-full max-w-[320px] h-12 rounded-[12px] font-bold text-base"
        style={{ background: '#00e5a0', color: '#000' }}
      >
        Ir al dashboard
      </button>
    </div>
  )
}
