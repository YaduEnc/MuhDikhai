function hashSeed(input = '') {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function normalizeUsernameInput(value = '') {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 30)
}

export function getDisplayName(user) {
  return user?.name || 'Stranger'
}

export function getDisplayHandle(user) {
  if (!user?.username) return null
  return `@${String(user.username).trim().toLowerCase()}`
}

function normalizeColor(value = '') {
  const normalized = String(value).trim().replace('#', '').toLowerCase()
  return /^[0-9a-f]{6}$/.test(normalized) ? normalized : null
}

function resolveAvatarSeed(input) {
  if (typeof input === 'string' && input.trim()) return input.trim()
  if (!input || typeof input !== 'object') return 'guest'

  return (
    String(input.id || '').trim()
    || String(input.username || '').trim()
    || String(input.email || '').trim()
    || String(input.name || '').trim()
    || 'guest'
  )
}

export function getDicebearAvatarUrl(input, options = {}) {
  const params = new URLSearchParams()
  params.set('seed', options.seed || resolveAvatarSeed(input))
  params.set('size', String(options.size || 256))
  params.set('radius', String(options.radius ?? 50))
  params.set('backgroundType', options.backgroundType || 'gradientLinear')

  const color = normalizeColor(options.backgroundColor)
  if (color) {
    params.set('backgroundColor', color)
  }

  return `https://api.dicebear.com/9.x/avataaars/svg?${params.toString()}`
}

export function getAvatarUrl(user, options = {}) {
  return user?.profilePictureUrl || user?.photoURL || getDicebearAvatarUrl(user, options)
}

export function getAvatarInitial(user) {
  const base = getDisplayName(user)
  return (base[0] || 'S').toUpperCase()
}

export function getAvatarStyle(user) {
  const seedBase = user?.username || user?.name || user?.email || 'stranger'
  const hash = hashSeed(seedBase)
  const hueA = hash % 360
  const hueB = (hueA + 46) % 360
  const hueC = (hueA + 300) % 360

  return {
    background: `linear-gradient(145deg, hsl(${hueA} 72% 50%), hsl(${hueB} 68% 38%), hsl(${hueC} 82% 56%))`,
    color: 'rgba(255,255,255,0.98)',
  }
}
