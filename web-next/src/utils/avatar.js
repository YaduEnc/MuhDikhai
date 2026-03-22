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

export function getAvatarUrl(user) {
  return user?.profilePictureUrl || user?.photoURL || null
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

function escapeXml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function createDefaultAvatarDataUrl({ name, username, color = '#7c3aed' }) {
  const initial = ((name || username || 'S').trim()[0] || 'S').toUpperCase()
  const safeInitial = escapeXml(initial)
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '#7c3aed'

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${safeColor}" />
      <stop offset="100%" stop-color="#0b1220" />
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="url(#bg)" rx="48" />
  <circle cx="74" cy="68" r="52" fill="rgba(255,255,255,0.16)" />
  <text x="128" y="148" text-anchor="middle" fill="#ffffff" font-family="Sora, Arial, sans-serif" font-size="112" font-weight="700">${safeInitial}</text>
</svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
