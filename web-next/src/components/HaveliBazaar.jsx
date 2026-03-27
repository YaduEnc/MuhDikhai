import { useState, useEffect, useCallback, useRef } from 'react'
import { calculateAuraLevel } from '../utils/aura'
import { getAvatarUrl, getAvatarInitial, getAvatarStyle } from '../utils/avatar'
import './HaveliBazaar.css'

const HAVELI_THEMES = [
  { id: 'midnight_terrace', name: 'Midnight Terrace', color: '#0f0c29', accent: '#8b5cf6', emoji: '🌙' },
  { id: 'monsoon_night', name: 'Monsoon Night', color: '#0a192f', accent: '#38bdf8', emoji: '🌧️' },
  { id: 'cyber_dhaba', name: 'Cyber Dhaba', color: '#1a0a2e', accent: '#f472b6', emoji: '🍵' },
  { id: 'ancient_library', name: 'Ancient Library', color: '#1c1410', accent: '#d97706', emoji: '📜' },
  { id: 'neon_bazaar', name: 'Neon Bazaar', color: '#0d0d0d', accent: '#22c55e', emoji: '💚' },
  { id: 'sunset_courtyard', name: 'Sunset Courtyard', color: '#1a0f0a', accent: '#fb923c', emoji: '🌅' },
  { id: 'ocean_deck', name: 'Ocean Deck', color: '#0a1628', accent: '#06b6d4', emoji: '🌊' },
  { id: 'royal_durbar', name: 'Royal Durbar', color: '#1a0a1e', accent: '#e879f9', emoji: '👑' },
]

function getTheme(id) {
  return HAVELI_THEMES.find(t => t.id === id) || HAVELI_THEMES[0]
}

function CreateHaveliModal({ onClose, onCreate, loading }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [themeId, setThemeId] = useState('midnight_terrace')
  const [privacyType, setPrivacyType] = useState('public')
  const [error, setError] = useState('')
  const nameRef = useRef(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const handleCreate = async () => {
    if (!name.trim() || name.trim().length < 2) {
      setError('Name must be at least 2 characters')
      return
    }
    setError('')
    try {
      await onCreate({ name: name.trim(), description: description.trim(), themeId, privacyType })
    } catch (err) {
      setError(err?.message || 'Failed to create Haveli')
    }
  }

  const selectedTheme = getTheme(themeId)

  return (
    <div className="haveli-modal-overlay" onClick={onClose}>
      <div className="haveli-modal" onClick={e => e.stopPropagation()}>
        <div className="haveli-modal-header">
          <h2>Create a Haveli</h2>
          <button className="haveli-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="haveli-modal-body">
          <div className="haveli-field">
            <label>Name</label>
            <input
              ref={nameRef}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Midnight Coders"
              maxLength={60}
            />
            <span className="haveli-field-meta">{name.length}/60</span>
          </div>

          <div className="haveli-field">
            <label>Description <span className="haveli-optional">(optional)</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What's this Haveli about?"
              maxLength={300}
              rows={2}
            />
            <span className="haveli-field-meta">{description.length}/300</span>
          </div>

          <div className="haveli-field">
            <label>Theme</label>
            <div className="haveli-theme-grid">
              {HAVELI_THEMES.map(theme => (
                <button
                  key={theme.id}
                  className={`haveli-theme-option ${themeId === theme.id ? 'active' : ''}`}
                  style={{ '--theme-color': theme.color, '--theme-accent': theme.accent }}
                  onClick={() => setThemeId(theme.id)}
                  title={theme.name}
                >
                  <span className="haveli-theme-emoji">{theme.emoji}</span>
                  <span className="haveli-theme-name">{theme.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="haveli-field">
            <label>Privacy</label>
            <div className="haveli-privacy-options">
              <button
                className={`haveli-privacy-btn ${privacyType === 'public' ? 'active' : ''}`}
                onClick={() => setPrivacyType('public')}
              >
                <span className="haveli-privacy-icon">🌐</span>
                <div>
                  <span className="haveli-privacy-title">Public</span>
                  <span className="haveli-privacy-desc">Anyone can find and join</span>
                </div>
              </button>
              <button
                className={`haveli-privacy-btn ${privacyType === 'invite' ? 'active' : ''}`}
                onClick={() => setPrivacyType('invite')}
              >
                <span className="haveli-privacy-icon">🔑</span>
                <div>
                  <span className="haveli-privacy-title">Invite Only</span>
                  <span className="haveli-privacy-desc">Join via invite code</span>
                </div>
              </button>
            </div>
          </div>

          {/* Live Preview */}
          <div className="haveli-preview" style={{ '--theme-color': selectedTheme.color, '--theme-accent': selectedTheme.accent }}>
            <div className="haveli-preview-content">
              <span className="haveli-preview-emoji">{selectedTheme.emoji}</span>
              <div>
                <span className="haveli-preview-name">{name || 'Your Haveli'}</span>
                <span className="haveli-preview-desc">{description || 'A new space for conversation'}</span>
              </div>
            </div>
          </div>

          {error && <div className="haveli-error">{error}</div>}
        </div>

        <div className="haveli-modal-footer">
          <button className="haveli-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="haveli-btn-primary" onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading ? 'Creating...' : 'Create Haveli'}
          </button>
        </div>
      </div>
    </div>
  )
}

function JoinByCodeModal({ onClose, onJoin, loading }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const handleJoin = async () => {
    if (!code.trim()) { setError('Enter an invite code'); return }
    setError('')
    try {
      await onJoin(code.trim())
    } catch (err) {
      setError(err?.message || 'Invalid invite code')
    }
  }

  return (
    <div className="haveli-modal-overlay" onClick={onClose}>
      <div className="haveli-modal haveli-modal--sm" onClick={e => e.stopPropagation()}>
        <div className="haveli-modal-header">
          <h2>Join by Invite Code</h2>
          <button className="haveli-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="haveli-modal-body">
          <div className="haveli-field">
            <label>Invite Code</label>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. ABC12345"
              maxLength={12}
              autoFocus
              style={{ textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', fontSize: '1.1rem' }}
            />
          </div>
          {error && <div className="haveli-error">{error}</div>}
        </div>
        <div className="haveli-modal-footer">
          <button className="haveli-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="haveli-btn-primary" onClick={handleJoin} disabled={loading || !code.trim()}>
            {loading ? 'Joining...' : 'Join Haveli'}
          </button>
        </div>
      </div>
    </div>
  )
}

function HaveliCard({ haveli, onEnter, onJoin, isMember }) {
  const theme = getTheme(haveli.themeId)
  const creatorUrl = getAvatarUrl(haveli.creator)
  const creatorInitial = getAvatarInitial(haveli.creator)
  const creatorStyle = getAvatarStyle(haveli.creator)
  const handleEnter = () => onEnter(haveli)

  return (
    <div
      className={`haveli-card ${isMember ? 'haveli-card--enterable' : ''}`}
      style={{ '--theme-color': theme.color, '--theme-accent': theme.accent }}
      role={isMember ? 'button' : undefined}
      tabIndex={isMember ? 0 : undefined}
      onClick={isMember ? handleEnter : undefined}
      onKeyDown={isMember ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleEnter()
        }
      } : undefined}
    >
      <div className="haveli-card-top">
        <div className="haveli-card-theme-bg" />
        <div className="haveli-card-info">
          <span className="haveli-card-emoji">{theme.emoji}</span>
          <div className="haveli-card-title-group">
            <h3 className="haveli-card-name">{haveli.name}</h3>
            {haveli.isLocked && <span className="haveli-card-locked" title="Locked">🔒</span>}
          </div>
          {haveli.description && <p className="haveli-card-desc">{haveli.description}</p>}
        </div>
      </div>

      <div className="haveli-card-bottom">
        <div className="haveli-card-meta">
          <div className="haveli-card-creator">
            <div className="haveli-card-creator-avatar">
              {creatorUrl ? (
                <img src={creatorUrl} alt="" />
              ) : (
                <span style={creatorStyle}>{creatorInitial}</span>
              )}
            </div>
            <span>by {haveli.creator?.name || 'Unknown'}</span>
          </div>
          <div className="haveli-card-members">
            <span className="haveli-card-members-icon">👥</span>
            <span>{haveli.memberCount || 0}</span>
          </div>
        </div>

        {isMember ? (
          <button
            className="haveli-card-btn haveli-card-btn--enter"
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              handleEnter()
            }}
          >
            Enter Room
          </button>
        ) : haveli.isLocked ? (
          <button className="haveli-card-btn haveli-card-btn--locked" type="button" disabled>
            Locked
          </button>
        ) : (
          <button className="haveli-card-btn haveli-card-btn--join" type="button" onClick={() => onJoin(haveli.id)}>
            Join
          </button>
        )}
      </div>
    </div>
  )
}

export default function HaveliBazaar({ session, authedFetch, onEnterHaveli, onBack }) {
  const [tab, setTab] = useState('bazaar') // 'bazaar' | 'mine'
  const [publicHavelis, setPublicHavelis] = useState([])
  const [myHavelis, setMyHavelis] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showJoinCode, setShowJoinCode] = useState(false)
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000'

  const fetchPublic = useCallback(async () => {
    try {
      const res = await authedFetch(`${BACKEND_URL}/api/v1/havelis?limit=30`)
      const json = await res.json()
      if (json.success) setPublicHavelis(json.data.havelis || [])
    } catch {}
  }, [authedFetch, BACKEND_URL])

  const fetchMine = useCallback(async () => {
    try {
      const res = await authedFetch(`${BACKEND_URL}/api/v1/havelis/mine`)
      const json = await res.json()
      if (json.success) setMyHavelis(json.data.havelis || [])
    } catch {}
  }, [authedFetch, BACKEND_URL])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchPublic(), fetchMine()]).finally(() => setLoading(false))
  }, [fetchPublic, fetchMine])

  const handleCreate = async (data) => {
    setActionLoading(true)
    try {
      const res = await authedFetch(`${BACKEND_URL}/api/v1/havelis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message || 'Failed')
      setShowCreate(false)
      await Promise.all([fetchPublic(), fetchMine()])
      onEnterHaveli(json.data.haveli)
    } finally {
      setActionLoading(false)
    }
  }

  const handleJoin = async (haveliId) => {
    setActionLoading(true)
    try {
      const res = await authedFetch(`${BACKEND_URL}/api/v1/havelis/${haveliId}/join`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message || 'Failed')
      await Promise.all([fetchPublic(), fetchMine()])
    } finally {
      setActionLoading(false)
    }
  }

  const handleJoinByCode = async (code) => {
    setActionLoading(true)
    try {
      const res = await authedFetch(`${BACKEND_URL}/api/v1/havelis/join/${code}`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message || 'Invalid invite code')
      setShowJoinCode(false)
      await Promise.all([fetchPublic(), fetchMine()])
      if (json.data?.haveli) onEnterHaveli(json.data.haveli)
    } finally {
      setActionLoading(false)
    }
  }

  const myHaveliIds = new Set(myHavelis.map(h => h.id))

  return (
    <div className="haveli-bazaar">
      <div className="haveli-bazaar-header">
        <button className="back-btn" onClick={onBack}>
          <span>←</span><span>Back</span>
        </button>
        <div className="haveli-bazaar-title">
          <h1>🏛️ The Haveli</h1>
          <p>Group rooms for the bold. Create, join, vibe.</p>
        </div>
        <div className="haveli-bazaar-actions">
          <button className="haveli-btn-secondary" onClick={() => setShowJoinCode(true)}>
            🔑 Join by Code
          </button>
          <button className="haveli-btn-primary" onClick={() => setShowCreate(true)}>
            + Create Haveli
          </button>
        </div>
      </div>

      <div className="haveli-tabs">
        <button className={`haveli-tab ${tab === 'bazaar' ? 'active' : ''}`} onClick={() => setTab('bazaar')}>
          🌐 Bazaar
          {publicHavelis.length > 0 && <span className="haveli-tab-count">{publicHavelis.length}</span>}
        </button>
        <button className={`haveli-tab ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>
          🏠 My Havelis
          {myHavelis.length > 0 && <span className="haveli-tab-count">{myHavelis.length}</span>}
        </button>
      </div>

      {loading ? (
        <div className="haveli-loading">
          <div className="haveli-loading-spinner" />
          <p>Loading Havelis...</p>
        </div>
      ) : (
        <div className="haveli-grid">
          {tab === 'bazaar' && (
            publicHavelis.length === 0 ? (
              <div className="haveli-empty">
                <span className="haveli-empty-icon">🏛️</span>
                <h3>The Bazaar is empty</h3>
                <p>Be the first to open a Haveli!</p>
                <button className="haveli-btn-primary" onClick={() => setShowCreate(true)}>Create One</button>
              </div>
            ) : (
              publicHavelis.map(h => (
                <HaveliCard
                  key={h.id}
                  haveli={h}
                  isMember={myHaveliIds.has(h.id)}
                  onEnter={onEnterHaveli}
                  onJoin={handleJoin}
                />
              ))
            )
          )}

          {tab === 'mine' && (
            myHavelis.length === 0 ? (
              <div className="haveli-empty">
                <span className="haveli-empty-icon">🏠</span>
                <h3>No Havelis yet</h3>
                <p>Create one or join from the Bazaar.</p>
                <button className="haveli-btn-primary" onClick={() => setShowCreate(true)}>Create One</button>
              </div>
            ) : (
              myHavelis.map(h => (
                <HaveliCard
                  key={h.id}
                  haveli={h}
                  isMember={true}
                  onEnter={onEnterHaveli}
                  onJoin={handleJoin}
                />
              ))
            )
          )}
        </div>
      )}

      {showCreate && (
        <CreateHaveliModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
          loading={actionLoading}
        />
      )}

      {showJoinCode && (
        <JoinByCodeModal
          onClose={() => setShowJoinCode(false)}
          onJoin={handleJoinByCode}
          loading={actionLoading}
        />
      )}
    </div>
  )
}
