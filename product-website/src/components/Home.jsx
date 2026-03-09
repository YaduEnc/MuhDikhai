import { useState, useRef, useEffect, useCallback } from 'react'
import { getSoundEnabled, toggleSound, initAudio } from '../utils/soundEngine'
import { calculateAuraLevel } from '../utils/aura'
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
    const [isEditing, setIsEditing] = useState(false)
    const [editData, setEditData] = useState({
        name: session?.user?.name || '',
        bio: session?.user?.bio || '',
        gender: session?.user?.gender || 'prefer_not_to_say'
    })
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
            await onUpdateProfile(editData)
            setIsEditing(false)
        } catch (err) {
            setError(err.message || 'Failed to update profile')
        } finally {
            setIsSaving(false)
        }
    }

    if (!isEditing) {
        return (
            <div className="inner-view">
                <button className="back-btn" onClick={onBack}>
                    <span>←</span>
                    <span>Back</span>
                </button>
                <div className="profile-card">
                    <div className="profile-header">
                        <div className="profile-avatar-wrapper">
                            <div className="profile-avatar lg">
                                {session?.user?.photoURL ? (
                                    <img src={session.user.photoURL} alt="avatar" className="profile-avatar-img" />
                                ) : (
                                    <span className="profile-avatar-initials">
                                        {(session?.user?.name || session?.user?.email || 'U')[0].toUpperCase()}
                                    </span>
                                )}
                            </div>
                            <button
                                className="avatar-edit-btn"
                                onClick={() => fileInputRef.current?.click()}
                                title="Change avatar"
                            >
                                ✎
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                accept="image/*"
                                onChange={handleFileChange}
                            />
                        </div>
                        <div className="profile-info">
                            <h2 className="profile-name">{session?.user?.name}</h2>
                            <p className="profile-email">{session?.user?.email}</p>
                        </div>
                    </div>

                    <div className="profile-actions">
                        <button className="btn-primary" onClick={() => setIsEditing(true)}>
                            Edit Profile
                        </button>
                    </div>

                    <div className="profile-details-grid">
                        <div className="detail-item">
                            <span className="detail-label">Bio</span>
                            <p className="detail-value">{session?.user?.bio || 'No bio yet'}</p>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label">Gender</span>
                            <p className="detail-value" style={{ textTransform: 'capitalize' }}>
                                {session?.user?.gender?.replace(/_/g, ' ') || 'Not specified'}
                            </p>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label">Account Aura</span>
                            <div className="aura-badge large" style={{ borderColor: calculateAuraLevel(session?.user?.auraPoints || 0).color }}>
                                <span className="aura-point-value">{session?.user?.auraPoints || 0}</span>
                                <span className="aura-name" style={{ color: calculateAuraLevel(session?.user?.auraPoints || 0).color }}>
                                    {calculateAuraLevel(session?.user?.auraPoints || 0).name}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="inner-view">
            <button className="back-btn" onClick={() => setIsEditing(false)}>
                <span>←</span>
                <span>Cancel</span>
            </button>
            <div className="profile-card">
                <div className="profile-field-group">
                    <label className="profile-field-label">Name</label>
                    <input
                        className="profile-input"
                        value={editData.name}
                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                        placeholder="Your name"
                    />
                </div>
                <div className="profile-field-group">
                    <label className="profile-field-label">Bio</label>
                    <textarea
                        className="profile-textarea"
                        value={editData.bio}
                        onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                        placeholder="Tell others about yourself..."
                        maxLength={500}
                    />
                </div>
                <div className="profile-field-group">
                    <label className="profile-field-label">Gender</label>
                    <select
                        className="profile-select"
                        value={editData.gender}
                        onChange={(e) => setEditData({ ...editData, gender: e.target.value })}
                    >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="non-binary">Non-binary</option>
                        <option value="other">Other</option>
                        <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                </div>

                {error && <div className="modal-error">{error}</div>}

                <div className="profile-actions">
                    <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Profile'}
                    </button>
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
                <div
                    key={req.id}
                    className="recent-match-card"
                    style={{ '--aura-color': req.user?.auraPoints !== undefined ? calculateAuraLevel(req.user.auraPoints).color : 'var(--stroke)' }}
                >
                    <div className="recent-avatar">
                        {req.user?.profilePictureUrl ? (
                            <img src={req.user.profilePictureUrl} alt="avatar" />
                        ) : (
                            <span className="avatar-placeholder">{req.user?.name?.[0]?.toUpperCase() || 'S'}</span>
                        )}
                    </div>
                    <div className="recent-info">
                        <span className="recent-name">
                            {req.user?.name || 'Stranger'}
                            {req.user?.auraPoints !== undefined && (
                                <span
                                    className="partner-aura-badge"
                                    title={`Aura: ${calculateAuraLevel(req.user.auraPoints).name}`}
                                    style={{ color: calculateAuraLevel(req.user.auraPoints).color, fontSize: '0.8rem', marginLeft: '0.4rem' }}
                                >
                                    ✧
                                </span>
                            )}
                        </span>
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
                    <div
                        key={friend.id}
                        className={`recent-match-card ${unread > 0 ? 'has-unread' : ''}`}
                        style={{ '--aura-color': friend.user?.auraPoints !== undefined ? calculateAuraLevel(friend.user.auraPoints).color : 'var(--stroke)' }}
                    >
                        <div className="recent-avatar">
                            {friend.user?.profilePictureUrl ? (
                                <img src={friend.user.profilePictureUrl} alt="avatar" />
                            ) : (
                                <span className="avatar-placeholder">{friend.user?.name?.[0]?.toUpperCase() || 'S'}</span>
                            )}
                            {unread > 0 && <span className="unread-dot" />}
                        </div>
                        <div className="recent-info">
                            <span className="recent-name">
                                {friend.user?.name || 'Stranger'}
                                {friend.user?.auraPoints !== undefined && (
                                    <span
                                        className="partner-aura-badge"
                                        title={`Aura: ${calculateAuraLevel(friend.user.auraPoints).name}`}
                                        style={{ color: calculateAuraLevel(friend.user.auraPoints).color, fontSize: '0.8rem', marginLeft: '0.4rem' }}
                                    >
                                        ✧
                                    </span>
                                )}
                            </span>
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
    const [matchingPreference, setMatchingPreference] = useState('everyone') // 'male', 'female', 'everyone'




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
        onStartMatch(selectedTopics, matchingPreference)
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
                        ? `${onlineCount - 1} strangers are loose in the pool. Go find some chaos.`
                        : "The rooms are too quiet. You're the first one here — wait for the storm."
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

            {/* Gender Preference */}
            <div className="home-topic-section gender-pref-section">
                <div className="home-topic-header">
                    <span className="home-topic-title">I want to match with...</span>
                    <span className="home-topic-count">{matchingPreference === 'everyone' ? 'Everyone' : matchingPreference.charAt(0).toUpperCase() + matchingPreference.slice(1)}</span>
                </div>
                <div className="home-topic-grid">
                    {[
                        { id: 'everyone', label: 'Everyone', icon: '🌍' },
                        { id: 'male', label: 'Male', icon: '♂' },
                        { id: 'female', label: 'Female', icon: '♀' }
                    ].map(pref => (
                        <button
                            key={pref.id}
                            type="button"
                            className={`topic-pill pref-pill ${matchingPreference === pref.id ? 'active' : ''}`}
                            onClick={() => setMatchingPreference(pref.id)}
                        >
                            <span className="pref-pill-icon">{pref.icon}</span> {pref.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Primary action — Start Matching */}
            <button className={`home-match-btn-v2 ${isTransitioning ? 'expanding' : ''}`} type="button" onClick={handleStartMatch}>
                <div className="home-match-v2-bg">
                    <div className="beam beam--1" />
                    <div className="beam beam--2" />
                </div>

                <div className="home-match-v2-content">
                    <div className="home-match-v2-visual">
                        <div className="radar-circle radar-circle--1" />
                        <div className="radar-circle radar-circle--2" />
                        <div className="radar-circle radar-circle--3" />
                        <div className="home-match-v2-icon">⚡</div>
                    </div>

                    <div className="home-match-v2-info">
                        <div className="home-match-v2-tag">SYSTEM READY</div>
                        <h2 className="home-match-v2-title">Matching shuru karein?</h2>
                        <p className="home-match-v2-sub">Diving into the unfiltered mayhem of human randomness.</p>
                    </div>
                </div>

                <div className="home-match-v2-arrow">
                    <span className="arrow-glyph">→</span>
                    <span className="arrow-text">LAUNCH</span>
                </div>
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
                                            <div
                                                key={match.id}
                                                className="recent-match-card"
                                                style={{ '--aura-color': match.partner?.auraPoints !== undefined ? calculateAuraLevel(match.partner.auraPoints).color : 'var(--stroke)' }}
                                            >
                                                <div className="recent-avatar">
                                                    {match.partner?.profilePictureUrl ? (
                                                        <img src={match.partner.profilePictureUrl} alt="avatar" />
                                                    ) : (
                                                        <span className="avatar-placeholder">{match.partner?.name?.[0]?.toUpperCase() || 'S'}</span>
                                                    )}
                                                </div>
                                                <div className="recent-info">
                                                    <span className="recent-name">
                                                        {match.partner?.name || 'Stranger'}
                                                        {match.partner?.auraPoints !== undefined && (
                                                            <span
                                                                className="partner-aura-badge"
                                                                title={`Aura: ${calculateAuraLevel(match.partner.auraPoints).name}`}
                                                                style={{ color: calculateAuraLevel(match.partner.auraPoints).color, fontSize: '0.8rem', marginLeft: '0.4rem' }}
                                                            >
                                                                ✧
                                                            </span>
                                                        )}
                                                    </span>
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
                        <span className="home-card-title">
                            {session?.user?.name || 'Anonymous'}
                            {session?.user?.auraPoints !== undefined && (
                                <span
                                    className="partner-aura-badge"
                                    title={`Aura: ${calculateAuraLevel(session.user.auraPoints).name}`}
                                    style={{ color: calculateAuraLevel(session.user.auraPoints).color, fontSize: '0.8rem', marginLeft: '0.4rem' }}
                                >
                                    ✧
                                </span>
                            )}
                        </span>
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
