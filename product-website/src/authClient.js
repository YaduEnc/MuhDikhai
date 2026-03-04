import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from './firebaseClient'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1'

const STORAGE_KEY = 'muhdikhai_session'

export function getStoredSession() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  const result = await signInWithPopup(auth, provider)
  const user = result.user
  const idToken = await user.getIdToken()

  const deviceInfo = {
    deviceName: navigator.userAgent.substring(0, 100),
    deviceType: 'web',
  }

  const response = await fetch(`${API_BASE_URL}/auth/google-signin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ idToken, deviceInfo }),
  })

  if (!response.ok) {
    let message = 'Sign-in failed'
    try {
      const payload = await response.json()
      if (payload?.error?.message) {
        message = payload.error.message
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(message)
  }

  const payload = await response.json()
  const session = {
    accessToken: payload.data.accessToken,
    refreshToken: payload.data.refreshToken,
    accessExpiresAt: payload.data.accessExpiresAt,
    refreshExpiresAt: payload.data.refreshExpiresAt,
    user: payload.data.user,
    device: payload.data.device,
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  }

  return session
}

