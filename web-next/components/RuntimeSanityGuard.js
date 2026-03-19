'use client'

import { useEffect } from 'react'

/**
 * Migration guard:
 * when moving the same domain from old SPA/PWA builds to Next.js,
 * stale service workers and caches can execute old runtime code.
 * That commonly causes opaque "core.js" promise errors in production.
 */
export default function RuntimeSanityGuard() {
  useEffect(() => {
    const run = async () => {
      if (typeof window === 'undefined') return
      if (!('serviceWorker' in navigator)) return

      try {
        const registrations = await navigator.serviceWorker.getRegistrations()
        if (registrations.length > 0) {
          await Promise.all(registrations.map((registration) => registration.unregister()))
        }

        if ('caches' in window) {
          const cacheKeys = await caches.keys()
          if (cacheKeys.length > 0) {
            await Promise.all(cacheKeys.map((key) => caches.delete(key)))
          }
        }
      } catch (error) {
        // non-fatal: never block the app render
      }
    }

    run()
  }, [])

  return null
}

