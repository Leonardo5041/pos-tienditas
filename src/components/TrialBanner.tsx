import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export function TrialBanner() {
  const { store } = useAuthStore()
  const navigate = useNavigate()

  if (!store?.is_on_trial) return null
  if (store.plan !== 'free') return null

  const days = store.trial_days_left

  const isUrgent = days <= 3
  const isWarning = days <= 7 && days > 3

  const bg = isUrgent
    ? 'rgba(255,107,107,0.12)'
    : isWarning
      ? 'rgba(255,159,67,0.12)'
      : 'rgba(0,229,160,0.08)'

  const borderColor = isUrgent
    ? 'rgba(255,107,107,0.3)'
    : isWarning
      ? 'rgba(255,159,67,0.3)'
      : 'rgba(0,229,160,0.2)'

  const color = isUrgent
    ? '#ff6b6b'
    : isWarning
      ? '#ff9f43'
      : '#00e5a0'

  const icon = isUrgent ? '⚠️' : '🎉'

  const message = days === 0
    ? 'Tu prueba vence hoy'
    : days === 1
      ? 'Tu prueba vence mañana'
      : `${days} días de prueba restantes`

  return (
    <div style={{
      position:     'fixed',
      top:          0,
      left:         0,
      right:        0,
      zIndex:       998,
      background:   bg,
      borderBottom: `1px solid ${borderColor}`,
      padding:      '8px 16px',
      display:      'flex',
      alignItems:   'center',
      gap:          '10px',
      fontSize:     '13px',
      fontWeight:   500,
      backdropFilter: 'blur(8px)',
    }}>
      <span>{icon}</span>

      <span style={{ color, flex: 1 }}>
        {message}
      </span>

      <button
        onClick={() => navigate('/subscription')}
        style={{
          padding:      '4px 14px',
          borderRadius: '20px',
          border:       `1px solid ${borderColor}`,
          background:   'transparent',
          color:        color,
          fontSize:     '12px',
          fontWeight:   700,
          cursor:       'pointer',
          whiteSpace:   'nowrap',
          fontFamily:   'DM Sans, sans-serif',
        }}
      >
        {isUrgent ? '¡Suscríbete ahora!' : 'Ver planes'}
      </button>
    </div>
  )
}
