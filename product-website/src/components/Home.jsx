import { useState, useRef, useEffect, useCallback } from 'react'
import { getSoundEnabled, toggleSound, initAudio } from '../utils/soundEngine'
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

function SettingsView({ session, onBack, onSignOut, onDeleteRequest }) {
    const isAdmin = session?.user?.isAdmin;
    const [soundOn, setSoundOn] = useState(getSoundEnabled());

    const handleToggleSound = () => {
        const next = !soundOn;
        setSoundOn(next);
        toggleSound(next);
        if (next) initAudio();
    };

    const navigateToAdmin = () => {
        window.history.pushState({}, '', '/admin');
        window.dispatchEvent(new PopStateEvent('popstate'));
    };

    return (
        <div className="inner-view">
            <button className="back-btn" type="button" onClick={onBack}>
                <span>←</span>
                <span>Back to home</span>
            </button>
            <div className="settings-card">
                <div className="settings-group">
                    <div className="settings-group-label">Account</div>

                    {isAdmin && (
                        <button className="settings-row" type="button" onClick={navigateToAdmin} style={{ marginBottom: '1rem', border: '1px solid rgba(48, 209, 88, 0.3)', background: 'rgba(48, 209, 88, 0.05)' }}>
                            <span className="settings-row-icon" style={{ color: '#30d158' }}>🪐</span>
                            <div className="settings-row-body">
                                <span className="settings-row-title" style={{ color: '#30d158' }}>Admin Terminal</span>
                                <span className="settings-row-desc">Access growth stats and safety reports.</span>
                            </div>
                            <span className="settings-row-arrow">→</span>
                        </button>
                    )}

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
                    <div className="settings-row" onClick={handleToggleSound} style={{ cursor: 'pointer' }}>
                        <span className="settings-row-icon">🔉</span>
                        <div className="settings-row-body">
                            <span className="settings-row-title">Ambient Sound</span>
                            <span className="settings-row-desc">Subtle audio cues for matches and messages.</span>
                        </div>
                        <span className={`toggle-pill ${soundOn ? 'active' : ''}`} style={{ alignSelf: 'center', marginLeft: 'auto' }} />
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

const PREDEFINED_TOPICS = ['Deep talk', 'Music', 'Coding', 'Movies', 'Vent', 'Silence']

function FriendRequests({ requests, onRespond }) {
    if (!requests || requests.length === 0) {
        return <div className="friends-empty">No pending requests</div>
    }

    return (
        <div className="friends-list">
            {requests.map((req) => (
                <div key={req.id} className="recent-match-card">
                    <div className="recent-avatar">
                        {req.user?.profilePictureUrl ? (
                            <img src={req.user.profilePictureUrl} alt="avatar" />
                        ) : (
                            <span className="avatar-placeholder">{req.user?.name?.[0]?.toUpperCase() || 'S'}</span>
                        )}
                    </div>
                    <div className="recent-info">
                        <span className="recent-name">{req.user?.name || 'Stranger'}</span>
                        <span className="recent-topic">Wants to be your friend</span>
                    </div>
                    <div className="friend-actions">
                        <button className="friend-accept-btn" onClick={() => onRespond(req.id, 'accept')}>Accept</button>
                        <button className="friend-deny-btn" onClick={() => onRespond(req.id, 'deny')}>Deny</button>
                    </div>
                </div>
            ))}
        </div>
    )
}

function FriendsList({ friends, onOpenChat, unreadCounts = {} }) {
    if (!friends || friends.length === 0) {
        return <div className="friends-empty">No friends yet. Start matching!</div>
    }

    return (
        <div className="friends-list">
            {friends.map((friend) => {
                const unread = unreadCounts[friend.user?.id] || 0
                return (
                    <div key={friend.id} className={`recent-match-card ${unread > 0 ? 'has-unread' : ''}`}>
                        <div className="recent-avatar">
                            {friend.user?.profilePictureUrl ? (
                                <img src={friend.user.profilePictureUrl} alt="avatar" />
                            ) : (
                                <span className="avatar-placeholder">{friend.user?.name?.[0]?.toUpperCase() || 'S'}</span>
                            )}
                            {unread > 0 && <span className="unread-dot" />}
                        </div>
                        <div className="recent-info">
                            <span className="recent-name">{friend.user?.name || 'Stranger'}</span>
                            <span className="recent-topic">{unread > 0 ? `${unread} new message${unread > 1 ? 's' : ''}` : 'Friend'}</span>
                        </div>
                        <button className="recent-add-btn" onClick={() => onOpenChat(friend)}>
                            {unread > 0 && <span className="unread-badge">{unread}</span>}
                            Message
                        </button>
                    </div>
                )
            })}
        </div>
    )
}

export default function Home({ session, onlineCount, isTransitioning, onStartMatch, onSignOut, onDeleteAccount, onUpdateProfile, onUploadAvatar, onFetchMatches, onAddFriend, onFetchFriendships, onRespondToFriendRequest, onOpenChat, unreadCounts }) {

    const [selectedTopics, setSelectedTopics] = useState([])
    const [customTopic, setCustomTopic] = useState('')




    const [view, setView] = useState('home') // 'home' | 'profile' | 'settings'
    const [homeTab, setHomeTab] = useState('matches') // 'matches' | 'friends' | 'requests'
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [recentMatches, setRecentMatches] = useState([])
    const [friendships, setFriendships] = useState([])
    const [friendRequests, setFriendRequests] = useState([])
    const [loadingHome, setLoadingHome] = useState(false)

    const refreshHomeData = useCallback(async () => {
        setLoadingHome(true);
        try {
            if (homeTab === 'matches') {
                const matches = await onFetchMatches();
                setRecentMatches(matches);
            } else if (homeTab === 'friends') {
                const friends = await onFetchFriendships('accepted');
                setFriendships(friends);
            } else if (homeTab === 'requests') {
                const requests = await onFetchFriendships('pending');
                // Only show received requests if backend doesn't filter by direction
                // Based on route: it returns all. Logic: if you are requester, keep as is.
                // But usually "Requests" tab means incoming.
                setFriendRequests(requests.filter(r => !r.isRequester));
            }
        } catch (err) {
            console.error('Failed to fetch home data:', err);
        } finally {
            setLoadingHome(false);
        }
    }, [homeTab, onFetchMatches, onFetchFriendships]);

    useEffect(() => {
        if (view === 'home') {
            refreshHomeData();
        }
    }, [view, refreshHomeData]);

    const handleRespond = async (friendshipId, action) => {
        try {
            await onRespondToFriendRequest(friendshipId, action);
            refreshHomeData();
        } catch (err) {
            alert(err.message || `Failed to ${action} request`);
        }
    };

    const handleRecentAddFriend = async (userId) => {
        try {
            await onAddFriend(userId);
            alert('Friend request sent!');
        } catch (err) {
            alert(err.message || 'Failed to send request');
        }
    };

    const hour = new Date().getHours()
    const greeting =
        hour < 5 ? 'Still awake?' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night'

    const name = session?.user?.name?.split(' ')[0] || 'you'


    const toggleTopic = (topic) => {
        setSelectedTopics(prev =>
            prev.includes(topic)
                ? prev.filter(t => t !== topic)
                : [...prev, topic]
        )
    }

    const handleAddCustomTopic = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            const trimmed = customTopic.trim()
            if (trimmed && !selectedTopics.includes(trimmed)) {
                if (selectedTopics.length >= 10) {
                    alert("Keep it gentle. 10 interests is plenty.")
                    return
                }
                setSelectedTopics(prev => [...prev, trimmed])
                setCustomTopic('')
            }
        }
    }


    const handleStartMatch = () => {
        onStartMatch(selectedTopics)
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
                    session={session}
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
        <div className={`home-shell ${isTransitioning ? 'transition-out' : ''}`}>
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

            {/* Topic Selection */}
            <div className="home-topic-section">
                <div className="home-topic-header">
                    <span className="home-topic-title">What&apos;s on your mind?</span>
                    <span className="home-topic-count">{selectedTopics.length || 'None'} selected</span>
                </div>
                <div className="home-topic-grid">
                    {PREDEFINED_TOPICS.map(topic => (
                        <button
                            key={topic}
                            type="button"
                            className={`topic-pill ${selectedTopics.includes(topic) ? 'active' : ''}`}
                            onClick={() => toggleTopic(topic)}
                        >
                            {topic}
                        </button>
                    ))}
                    {selectedTopics.filter(t => !PREDEFINED_TOPICS.includes(t)).map(topic => (
                        <button
                            key={topic}
                            type="button"
                            className="topic-pill active custom"
                            onClick={() => toggleTopic(topic)}
                        >
                            {topic} <span className="pill-remove">×</span>
                        </button>
                    ))}

                    <input
                        className="home-topic-input"
                        placeholder="Add your own…"
                        value={customTopic}
                        onChange={(e) => setCustomTopic(e.target.value)}
                        onKeyDown={handleAddCustomTopic}
                        maxLength={20}
                    />
                </div>

            </div>

            {/* Primary action — Start Matching */}
            <button className={`home-match-btn ${isTransitioning ? 'expanding' : ''}`} type="button" onClick={handleStartMatch}>

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

            {/* Home Tabs */}
            <div className="home-tabs">
                <button
                    className={`home-tab ${homeTab === 'matches' ? 'active' : ''}`}
                    onClick={() => setHomeTab('matches')}
                >
                    Matches
                </button>
                <button
                    className={`home-tab ${homeTab === 'friends' ? 'active' : ''}`}
                    onClick={() => setHomeTab('friends')}
                >
                    Friends
                </button>
                <button
                    className={`home-tab ${homeTab === 'requests' ? 'active' : ''}`}
                    onClick={() => setHomeTab('requests')}
                >
                    Requests {friendRequests.length > 0 && <span className="tab-badge">{friendRequests.length}</span>}
                </button>
            </div>

            {/* Tab Content */}
            <div className="home-tab-content">
                {loadingHome ? (
                    <div className="home-loading">Finding your people...</div>
                ) : (
                    <>
                        {homeTab === 'matches' && (
                            recentMatches.length > 0 ? (
                                <div className="home-recents-section">
                                    <div className="recents-list">
                                        {recentMatches.map((match) => (
                                            <div key={match.id} className="recent-match-card">
                                                <div className="recent-avatar">
                                                    {match.partner?.profilePictureUrl ? (
                                                        <img src={match.partner.profilePictureUrl} alt="avatar" />
                                                    ) : (
                                                        <span className="avatar-placeholder">{match.partner?.name?.[0]?.toUpperCase() || 'S'}</span>
                                                    )}
                                                </div>
                                                <div className="recent-info">
                                                    <span className="recent-name">{match.partner?.name || 'Stranger'}</span>
                                                    {match.sharedTopic && <span className="recent-topic">Talked about {match.sharedTopic}</span>}
                                                </div>
                                                <button
                                                    className="recent-add-btn"
                                                    title="Send Friend Request"
                                                    onClick={() => handleRecentAddFriend(match.partner.id)}
                                                >
                                                    + Friend
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="home-hint" style={{ textAlign: 'center', marginTop: '1rem' }}>
                                    No recent encounters. Start a match to find someone to talk to.
                                </div>
                            )
                        )}

                        {homeTab === 'friends' && <FriendsList friends={friendships} onOpenChat={onOpenChat} unreadCounts={unreadCounts} />}
                        {homeTab === 'requests' && <FriendRequests requests={friendRequests} onRespond={handleRespond} />}
                    </>
                )}
            </div>

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
