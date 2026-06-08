import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function SubscriptionCancel() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate('/subscription', { replace: true })
  }, [navigate])
  return null
}
