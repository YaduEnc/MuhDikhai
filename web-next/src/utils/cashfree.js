const CASHFREE_SDK_URL = 'https://sdk.cashfree.com/js/v3/cashfree.js'

let sdkLoadPromise = null

function resolveMode() {
  const envMode = (process.env.NEXT_PUBLIC_CASHFREE_MODE || 'sandbox').toLowerCase()
  return envMode === 'production' ? 'production' : 'sandbox'
}

function loadCashfreeSdk() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Cashfree checkout is only available in the browser.'))
  }

  if (window.Cashfree) return Promise.resolve(window.Cashfree)
  if (sdkLoadPromise) return sdkLoadPromise

  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = CASHFREE_SDK_URL
    script.async = true
    script.onload = () => {
      if (window.Cashfree) {
        resolve(window.Cashfree)
        return
      }
      reject(new Error('Cashfree SDK loaded but Cashfree object is unavailable.'))
    }
    script.onerror = () => reject(new Error('Failed to load Cashfree checkout SDK.'))
    document.head.appendChild(script)
  })

  return sdkLoadPromise
}

export async function openCashfreeCheckout({ paymentSessionId, returnUrl }) {
  if (!paymentSessionId) {
    throw new Error('paymentSessionId is required')
  }

  const CashfreeFactory = await loadCashfreeSdk()
  const cashfree = CashfreeFactory({ mode: resolveMode() })

  const result = await cashfree.checkout({
    paymentSessionId,
    redirectTarget: '_modal',
    ...(returnUrl ? { returnUrl } : {}),
  })

  if (result?.error?.message) {
    throw new Error(result.error.message)
  }

  return result
}
