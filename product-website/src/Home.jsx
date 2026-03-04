import { useState, useRef, useEffect, useCallback } from 'react'
import './Home.css'

function DeleteConfirmationModal({ onConfirm, onCancel }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleConfirm = async () => {
        setLoading(true);
        setError('');
        try {
            await onConfirm();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete account');
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay delete-modal-overlay">
            <div className="modal-card delete-modal-card">
                <div className="delete-modal-icon">⬡</div>
                <h3>Delete account forever?</h3>
                <p>
                    This will permanently remove your profile, preferences, and all history.
                    This action is irreversible. Are you sure you want to disappear?
                </p>
                {error && <div className="modal-error">{error}</div>}
                <div className="modal-actions-v2">
                    <button
                        className="btn-danger-v2"
                        onClick={handleConfirm}
                        disabled={loading}
                    >
                        {loading ? 'Deleting...' : 'Delete my account'}
                    </button>
                    <button
                        className="btn-ghost-v2"
                        onClick={onCancel}
                        disabled={loading}
                    >
                        Keep my account
                    </button>
                </div>
            </div>
        </div>
    );
}

function ProfileView({ session, onBack, onUpdateProfile, onUploadAvatar }) {
    const [bio, setBio] = useState(session?.user?.bio || '')
    const [gender, setGender] = useState(session?.user?.gender || 'prefer_not_to_say')
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState('')
    const fileInputRef = useRef(null)

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (file.size > 10 * 1024 * 1024) {
            setError('Photo must be less than 10MB')
            return
        }

        setIsSaving(true)
        setError('')
        try {
            const url = await onUploadAvatar(file)
            await onUpdateProfile({ profilePictureUrl: url })
        } catch (err) {
            setError(err.message || 'Failed to upload photo')
        } finally {
            setIsSaving(false)
        }
    }

    const handleSave = async () => {
        setIsSaving(true)
        setError('')
        try {
            await onUpdateProfile({ bio, gender })
        } catch (err) {
            setError(err.message || 'Failed to update profile')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="inner-view">
            <button className="back-btn" type="button" onClick={onBack}>
                <span>←</span>
                <span>Back to home</span>
            </button>
            <div className="profile-card">
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    <div className="avatar-upload-wrap" onClick={() => fileInputRef.current?.click()} title="Change photo">
                        <div className="profile-avatar">
                            {session?.user?.photoURL ? (
                                <img src={session.user.photoURL} alt="avatar" className="profile-avatar-img" />
                            ) : (
                                <span className="profile-avatar-initials">
                                    {(session?.user?.name || session?.user?.email || 'U')[0].toUpperCase()}
                                </span>
                            )}
                        </div>
                        <div className="avatar-edit-overlay">✎</div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            accept="image/*"
                            onChange={handleFileChange}
                        />
                    </div>
                    <div className="profile-info">
                        <span className="profile-name">{session?.user?.name || 'Anonymous'}</span>
                        <span className="profile-email">{session?.user?.email || ''}</span>
                    </div>
                </div>

                <div className="profile-edit-section">
                    <div className="profile-field-group">
                        <label className="profile-field-label">About you</label>
                        <textarea
                            className="profile-textarea"
                            placeholder="Tell the world something about yourself..."
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            maxLength={500}
                        />
                    </div>

                    <div className="profile-field-group">
                        <label className="profile-field-label">Gender</label>
                        <div className="gender-selector">
                            {['male', 'female', 'other', 'prefer_not_to_say'].map((g) => (
                                <button
                                    key={g}
                                    type="button"
                                    className={`gender-pill ${gender === g ? 'active' : ''}`}
                                    onClick={() => setGender(g)}
                                >
                                    {g.charAt(0).toUpperCase() + g.slice(1).replace(/_/g, ' ')}
                                </button>
                            ))}
                        </div>
                    </div>

                    {error && <div className="modal-error" style={{ marginBottom: 0 }}>{error}</div>}

                    <div className="profile-save-row">
                        <button
                            className="profile-save-btn"
                            onClick={handleSave}
                            disabled={isSaving}
                        >
                            {isSaving ? 'Updating...' : 'Save Changes'}
                        </button>
                    </div>
                </div>

                <div className="profile-stats">
                    <div className="profile-stat">
                        <span className="profile-stat-value">{session?.user?.roomsEntered || 0}</span>
                        <span className="profile-stat-label">Rooms entered</span>
                    </div>
                    <div className="profile-stat">
                        <span className="profile-stat-value">0</span>
                        <span className="profile-stat-label">Hours chatted</span>
                    </div>
                    <div className="profile-stat">
                        <span className="profile-stat-value">∞</span>
                        <span className="profile-stat-label">Moments forgotten</span>
                    </div>
                </div>
                <div className="profile-section-title">Your preferences</div>
                <div className="profile-prefs">
                    <label className="pref-toggle">
                        <span className="pref-label">Camera optional by default</span>
                        <span className="toggle-pill active" />
                    </label>
                    <label className="pref-toggle">
                        <span className="pref-label">Soft‑spoken mode</span>
                        <span className="toggle-pill" />
                    </label>
                    <label className="pref-toggle">
                        <span className="pref-label">Blurred preview on match</span>
                        <span className="toggle-pill active" />
                    </label>
                </div>
            </div>
        </div>
    )
}

function SettingsView({ onBack, onSignOut, onDeleteRequest }) {
    return (
        <div className="inner-view">
            <button className="back-btn" type="button" onClick={onBack}>
                <span>←</span>
                <span>Back to home</span>
            </button>
            <div className="settings-card">
                <div className="settings-group">
                    <div className="settings-group-label">Account</div>
                    <button className="settings-row danger" type="button" onClick={onSignOut}>
                        <span className="settings-row-icon">⎋</span>
                        <div className="settings-row-body">
                            <span className="settings-row-title">Sign out quietly</span>
                            <span className="settings-row-desc">Your session will end, no trace left behind.</span>
                        </div>
                        <span className="settings-row-arrow">→</span>
                    </button>
                </div>

                <div className="settings-group">
                    <div className="settings-group-label">Experience</div>
                    <div className="settings-row">
                        <span className="settings-row-icon">◎</span>
                        <div className="settings-row-body">
                            <span className="settings-row-title">Match speed</span>
                            <span className="settings-row-desc">How quickly we look for someone. Slower = quieter pool.</span>
                        </div>
                        <span className="settings-badge">Gentle</span>
                    </div>
                    <div className="settings-row">
                        <span className="settings-row-icon">⊕</span>
                        <div className="settings-row-body">
                            <span className="settings-row-title">Interface density</span>
                            <span className="settings-row-desc">How much information shows at once.</span>
                        </div>
                        <span className="settings-badge">Sparse</span>
                    </div>
                </div>

                <div className="settings-group">
                    <div className="settings-group-label">Privacy</div>
                    <div className="settings-row">
                        <span className="settings-row-icon">⬡</span>
                        <div className="settings-row-body">
                            <span className="settings-row-title">Session data</span>
                            <span className="settings-row-desc">All data is ephemeral and cleared when you leave.</span>
                        </div>
                        <span className="settings-badge safe">Auto-cleared</span>
                    </div>
                    <div className="settings-row">
                        <span className="settings-row-icon">◈</span>
                        <div className="settings-row-body">
                            <span className="settings-row-title">Encryption</span>
                            <span className="settings-row-desc">End-to-end, always. No exceptions.</span>
                        </div>
                        <span className="settings-badge safe">Active</span>
                    </div>
                </div>

                <div className="settings-group danger-zone">
                    <div className="settings-group-label">Danger Zone</div>
                    <button className="settings-row danger" type="button" onClick={onDeleteRequest}>
                        <span className="settings-row-icon">⬡</span>
                        <div className="settings-row-body">
                            <span className="settings-row-title">Delete account forever</span>
                            <span className="settings-row-desc">Permanently remove all your data and disappear from Muhdikhai.</span>
                        </div>
                        <span className="settings-row-arrow">→</span>
                    </button>
                </div>
            </div>
        </div>
    )
}

function FriendsView({ session, onBack, onStartChat }) {

    const [friends, setFriends] = useState([])
    const [pendingReceived, setPendingReceived] = useState([])
    const [searchResults, setSearchResults] = useState([])
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(false)

    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

    const fetchFriends = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`${BACKEND_URL}/api/v1/friends?status=accepted`, {
                headers: { 'Authorization': `Bearer ${session.accessToken}` }
            })
            const json = await res.json()
            if (json.success) setFriends(json.data.friendships)
        } catch (err) {
            console.error('Fetch friends failed', err)
        } finally {
            setLoading(false)
        }
    }, [session.accessToken, BACKEND_URL])

    const fetchRequests = useCallback(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/v1/friends/requests/pending`, {
                headers: { 'Authorization': `Bearer ${session.accessToken}` }
            })
            const json = await res.json()
            if (json.success) {
                setPendingReceived(json.data.received)
                // pendingSent not needed for UI but kept as data
            }
        } catch (err) {
            console.error('Fetch requests failed', err)
        }
    }, [session.accessToken, BACKEND_URL])

    useEffect(() => {
        fetchFriends()
        fetchRequests()
    }, [fetchFriends, fetchRequests])

    const handleSearch = async (e) => {
        const q = e.target.value
        setSearchQuery(q)
        if (q.length < 3) {
            setSearchResults([])
            return
        }
        try {
            const res = await fetch(`${BACKEND_URL}/api/v1/users/search?q=${encodeURIComponent(q)}&type=all`, {
                headers: { 'Authorization': `Bearer ${session.accessToken}` }
            })
            const json = await res.json()
            if (json.success) setSearchResults(json.data.users)
        } catch (err) {
            console.error('Search failed', err)
        }
    }

    const sendRequest = async (userId) => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/v1/friends/request`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userId })
            })
            const json = await res.json()
            if (json.success) {
                fetchRequests()
                setSearchResults(prev => prev.filter(u => u.id !== userId))
            } else {
                alert(json.error?.message || 'Failed to send request')
            }
        } catch (err) {
            console.error('Send request failed', err)
        }
    }

    const handleAction = async (friendshipId, action) => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/v1/friends/${friendshipId}/${action}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.accessToken}` }
            })
            if (res.ok) {
                fetchFriends()
                fetchRequests()
            }
        } catch (err) {
            console.error(`${action} failed`, err)
        }
    }

    const unfriend = async (friendshipId) => {
        if (!confirm('Are you sure you want to remove this friend?')) return
        try {
            await fetch(`${BACKEND_URL}/api/v1/friends/${friendshipId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session.accessToken}` }
            })
            fetchFriends()
        } catch (err) {
            console.error('Unfriend failed', err)
        }
    }

    return (
        <div className="inner-view friends-view">
            <button className="back-btn" type="button" onClick={onBack}>
                <span>←</span>
                <span>Back to home</span>
            </button>

            <div className="friends-container">
                <div className="friends-main">
                    <section className="friends-section">
                        <h2 className="section-title">Your Friends</h2>
                        {loading && <div className="friends-loading">Loading your circle...</div>}
                        {!loading && friends.length === 0 && (
                            <div className="friends-empty">No friends yet. Your circle is waiting to grow.</div>
                        )}
                        <div className="friends-list">
                            {friends.map(f => (
                                <div key={f.id} className="friend-item">
                                    <div className="friend-info">
                                        <div className="friend-avatar">
                                            {f.user.profilePictureUrl ? <img src={f.user.profilePictureUrl} alt="" /> : (f.user.name || '?')[0].toUpperCase()}
                                        </div>
                                        <div className="friend-details">
                                            <span className="friend-name">{f.user.name}</span>
                                            <span className="friend-status">{f.user.status || 'offline'}</span>
                                        </div>
                                    </div>
                                    <div className="friend-actions">
                                        <button className="btn-message" onClick={() => onStartChat(f.user)}>Message</button>
                                        <button className="btn-unfriend" onClick={() => unfriend(f.id)}>Remove</button>
                                    </div>

                                </div>
                            ))}
                        </div>
                    </section>

                    {pendingReceived.length > 0 && (
                        <section className="friends-section">
                            <h2 className="section-title">Friend Requests</h2>
                            <div className="requests-list">
                                {pendingReceived.map(r => (
                                    <div key={r.id} className="request-item">
                                        <div className="friend-info">
                                            <div className="friend-avatar">
                                                {r.user.profilePictureUrl ? <img src={r.user.profilePictureUrl} alt="" /> : (r.user.name || '?')[0].toUpperCase()}
                                            </div>
                                            <span className="friend-name">{r.user.name}</span>
                                        </div>
                                        <div className="request-actions">
                                            <button className="btn-accept" onClick={() => handleAction(r.id, 'accept')}>Accept</button>
                                            <button className="btn-deny" onClick={() => handleAction(r.id, 'deny')}>Reject</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>

                <div className="friends-sidebar">
                    <section className="friends-section search-section">
                        <h2 className="section-title">Add Friends</h2>
                        <input
                            type="text"
                            className="friend-search-input"
                            placeholder="Search by name..."
                            value={searchQuery}
                            onChange={handleSearch}
                        />
                        <div className="search-results">
                            {searchResults.map(u => (
                                <div key={u.id} className="search-item">
                                    <div className="friend-info">
                                        <div className="friend-avatar">
                                            {u.profilePictureUrl ? <img src={u.profilePictureUrl} alt="" /> : (u.name || '?')[0].toUpperCase()}
                                        </div>
                                        <span className="friend-name">{u.name}</span>
                                    </div>
                                    <button className="btn-add" onClick={() => sendRequest(u.id)}>+</button>
                                </div>
                            ))}
                            {searchQuery.length >= 3 && searchResults.length === 0 && (
                                <div className="no-results">No strangers found with that name.</div>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    )
}

export default function Home({ session, onlineCount, onStartMatch, onSignOut, onDeleteAccount, onUpdateProfile, onUploadAvatar, onStartChat }) {

    const [view, setView] = useState('home') // 'home' | 'profile' | 'settings' | 'friends'
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [pendingReceived, setPendingReceived] = useState([])

    useEffect(() => {
        if (!session?.accessToken) return
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
        fetch(`${BACKEND_URL}/api/v1/friends/requests/pending`, {
            headers: { 'Authorization': `Bearer ${session.accessToken}` }
        })
            .then(res => res.json())
            .then(json => {
                if (json.success) setPendingReceived(json.data.received)
            })
            .catch(err => console.error('Silent request check failed', err))
    }, [session?.accessToken])

    const hour = new Date().getHours()
    const greeting =
        hour < 5 ? 'Still awake?' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night'

    const name = session?.user?.name?.split(' ')[0] || 'you'

    if (view === 'friends') {
        return (
            <FriendsView
                session={session}
                onBack={() => setView('home')}
                onStartChat={(friend) => {
                    onStartChat(friend);
                }}
            />

        )
    }

    if (view === 'profile') {
        return (
            <ProfileView
                session={session}
                onBack={() => setView('home')}
                onUpdateProfile={onUpdateProfile}
                onUploadAvatar={onUploadAvatar}
            />
        )
    }

    if (view === 'settings') {
        return (
            <>
                <SettingsView
                    onBack={() => setView('home')}
                    onSignOut={onSignOut}
                    onDeleteRequest={() => setShowDeleteModal(true)}
                />
                {showDeleteModal && (
                    <DeleteConfirmationModal
                        onConfirm={onDeleteAccount}
                        onCancel={() => setShowDeleteModal(false)}
                    />
                )}
            </>
        )
    }

    return (
        <div className="home-shell">
            {/* Greeting */}
            <div className="home-greeting">
                <div className="home-greeting-eyebrow">
                    <span className="home-dot-live" />
                    <span>You&apos;re in</span>
                </div>
                <h1 className="home-greeting-heading">
                    {greeting}, <span>{name}.</span>
                </h1>
                <p className="home-greeting-sub">
                    {onlineCount > 1
                        ? `${onlineCount - 1} stranger${onlineCount === 2 ? '' : 's'} waiting to be found. Or take your time — there's no rush here.`
                        : "The rooms are quiet right now. You're the first one here — take a moment for yourself."
                    }
                </p>
            </div>

            {/* Primary action — Start Matching */}
            <button className="home-match-btn" type="button" onClick={onStartMatch}>
                <div className="home-match-btn-left">
                    <div className="home-match-glow" />
                    <div className="home-match-btn-icon">◎</div>
                    <div className="home-match-btn-copy">
                        <span className="home-match-btn-title">Start a gentle match</span>
                        <span className="home-match-btn-sub">Enter a quiet room with one stranger</span>
                    </div>
                </div>
                <span className="home-match-btn-arrow">↗</span>
            </button>

            {/* Secondary card grid */}
            <div className="home-card-grid">
                {/* Profile */}
                <button className="home-card" type="button" onClick={() => setView('profile')}>
                    <div className="home-card-icon-wrap">
                        {session?.user?.photoURL ? (
                            <img src={session.user.photoURL} alt="avatar" className="home-card-avatar" />
                        ) : (
                            <span className="home-card-avatar-initials">
                                {(session?.user?.name || session?.user?.email || 'U')[0].toUpperCase()}
                            </span>
                        )}
                    </div>
                    <div className="home-card-body">
                        <span className="home-card-label">Your profile</span>
                        <span className="home-card-title">{session?.user?.name || 'Anonymous'}</span>
                        <span className="home-card-sub">Preferences &amp; identity</span>
                    </div>
                    <span className="home-card-arrow">→</span>
                </button>

                {/* Friends */}
                <button className="home-card" type="button" onClick={() => setView('friends')}>
                    <div className="home-card-icon-wrap home-card-icon-wrap--friends">
                        <span className="home-card-icon-glyph">👥</span>
                    </div>
                    <div className="home-card-body">
                        <span className="home-card-label">Your circle</span>
                        <span className="home-card-title">Friends</span>
                        <span className="home-card-sub">Manage your quiet connections</span>
                    </div>
                    {pendingReceived.length > 0 && <span className="friend-badge">{pendingReceived.length}</span>}
                    <span className="home-card-arrow">→</span>
                </button>

                {/* Settings */}
                <button className="home-card" type="button" onClick={() => setView('settings')}>
                    <div className="home-card-icon-wrap home-card-icon-wrap--settings">
                        <span className="home-card-icon-glyph">⚙</span>
                    </div>
                    <div className="home-card-body">
                        <span className="home-card-label">Configuration</span>
                        <span className="home-card-title">Settings</span>
                        <span className="home-card-sub">Match speed, privacy, display</span>
                    </div>
                    <span className="home-card-arrow">→</span>
                </button>

                {/* Status / info card */}
                <div className="home-status-card">
                    <div className="home-status-header">
                        <span className="home-status-title">Room conditions</span>
                        <span className="home-status-chip">live</span>
                    </div>
                    <div className="home-status-rows">
                        <div className="home-status-row">
                            <span className="home-status-dot green" />
                            <span>Matching engine online</span>
                        </div>
                        <div className="home-status-row">
                            <span className="home-status-dot green" />
                            <span>E2E encryption active</span>
                        </div>
                        <div className="home-status-row">
                            <span className="home-status-dot green" />
                            <span>{onlineCount} {onlineCount === 1 ? 'soul' : 'souls'} online now</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Soft footer hint */}
            <p className="home-hint">
                Tap <strong>Start a gentle match</strong> when you&apos;re ready. You can leave any room with a single key — no pressure, no history.
            </p>
        </div>
    )
}
