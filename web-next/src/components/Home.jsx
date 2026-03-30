import { useState, useRef, useEffect, useCallback } from 'react'
import { getSoundEnabled, toggleSound, initAudio } from '../utils/soundEngine'
import { calculateAuraLevel } from '../utils/aura'
import HaveliBazaar from './HaveliBazaar'
import {
    getAvatarUrl,
    getAvatarInitial,
    getAvatarStyle,
    getDisplayHandle,
    normalizeUsernameInput
} from '../utils/avatar'

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

function ProfileView({ session, onBack, onUpdateProfile, onUploadAvatar, onCheckUsernameAvailability, onUpgradeToPlus, onExportLatestInvoice }) {
    const [isEditing, setIsEditing] = useState(false)
    const [editData, setEditData] = useState({
        username: session?.user?.username || '',
        name: session?.user?.name || '',
        bio: session?.user?.bio || '',
        gender: session?.user?.gender || 'prefer_not_to_say'
    })
    const [usernameState, setUsernameState] = useState({ checking: false, available: null, message: '' })
    const [isSaving, setIsSaving] = useState(false)
    const [isAvatarUploading, setIsAvatarUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null)
    const [error, setError] = useState('')
    const [upgradeError, setUpgradeError] = useState('')
    const [isUpgradeLoading, setIsUpgradeLoading] = useState(false)
    const [invoiceError, setInvoiceError] = useState('')
    const [isInvoiceLoading, setIsInvoiceLoading] = useState(false)
    const fileInputRef = useRef(null)

    const auraPoints = session?.user?.auraPoints || 0
    const auraLevel = calculateAuraLevel(auraPoints)
    const auraProgress = auraLevel.progress
    const roomsEntered = session?.user?.roomsEntered || 0
    const friendCount = session?.user?.friendCount || 0
    const avatarUrl = avatarPreviewUrl || getAvatarUrl(session?.user)
    const profileHandle = getDisplayHandle(session?.user)
    const profileAvatarStyle = getAvatarStyle(session?.user)
    const profileInitial = getAvatarInitial(session?.user)

    const hasBio = !!(session?.user?.bio && session.user.bio.trim().length > 0)
    const bioText = hasBio
        ? session.user.bio
        : 'Add a short line about yourself so others know who is on the other side.'
    const hasGender = !!(session?.user?.gender && session.user.gender !== 'prefer_not_to_say')
    const premiumTier = session?.user?.premiumTier || 'free'
    const premiumStatus = session?.user?.premiumStatus || 'inactive'
    const verifiedBadgeEnabled = Boolean(session?.user?.verifiedBadgeEnabled)
    const premiumExpiresAt = session?.user?.premiumExpiresAt ? new Date(session.user.premiumExpiresAt) : null
    const isPremiumActive = premiumTier === 'plus' && premiumStatus === 'active'
    const expiryText = premiumExpiresAt && !Number.isNaN(premiumExpiresAt.getTime())
        ? premiumExpiresAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
        : null

    useEffect(() => () => {
        if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl)
    }, [avatarPreviewUrl])

    const clearPreview = useCallback(() => {
        setAvatarPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return null
        })
    }, [])

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.size > 5 * 1024 * 1024) {
            setError('Photo must be less than 5MB')
            return
        }
        if (!file.type.startsWith('image/')) {
            setError('Please choose an image file')
            return
        }

        const localPreview = URL.createObjectURL(file)

        setAvatarPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return localPreview
        })
        setIsAvatarUploading(true)
        setUploadProgress(0)
        setError('')
        try {
            const url = await onUploadAvatar(file, {
                onProgress: (progress) => setUploadProgress(progress),
            })
            setUploadProgress(100)
            await onUpdateProfile({ profilePictureUrl: url })
            clearPreview()
        } catch (err) {
            clearPreview()
            setError(err.message || 'Failed to upload photo')
        } finally {
            setIsAvatarUploading(false)
            window.setTimeout(() => setUploadProgress(0), 500)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    useEffect(() => {
        if (!isEditing || typeof onCheckUsernameAvailability !== 'function') return undefined

        const normalizedUsername = normalizeUsernameInput(editData.username || '')
        const currentUsername = normalizeUsernameInput(session?.user?.username || '')

        if (!normalizedUsername) {
            setUsernameState({ checking: false, available: null, message: 'Username is required.' })
            return undefined
        }
        if (normalizedUsername.length < 3) {
            setUsernameState({ checking: false, available: null, message: 'At least 3 characters.' })
            return undefined
        }
        if (normalizedUsername === currentUsername) {
            setUsernameState({ checking: false, available: true, message: 'Current username.' })
            return undefined
        }

        setUsernameState((prev) => ({ ...prev, checking: true, message: 'Checking availability...' }))
        const timer = window.setTimeout(async () => {
            try {
                const result = await onCheckUsernameAvailability(normalizedUsername)
                setUsernameState({
                    checking: false,
                    available: Boolean(result?.available),
                    message: result?.available ? 'Username is available.' : 'Username is already taken.',
                })
            } catch {
                setUsernameState({
                    checking: false,
                    available: null,
                    message: 'Could not check username right now.',
                })
            }
        }, 320)

        return () => window.clearTimeout(timer)
    }, [isEditing, editData.username, session?.user?.username, onCheckUsernameAvailability])

    const handleSave = async () => {
        setIsSaving(true)
        setError('')
        try {
            const normalizedUsername = normalizeUsernameInput(editData.username)
            if (!normalizedUsername || normalizedUsername.length < 3) {
                throw new Error('Username must be at least 3 characters.')
            }
            if (usernameState.available === false) {
                throw new Error('Username is already taken.')
            }
            const payload = {
                ...editData,
                username: normalizedUsername,
            }
            await onUpdateProfile(payload)
            setIsEditing(false)
        } catch (err) {
            setError(err.message || 'Failed to update profile')
        } finally {
            setIsSaving(false)
        }
    }

    const handleUseDefaultAvatar = async () => {
        if (isAvatarUploading || isSaving) return
        setError('')
        setIsAvatarUploading(true)
        try {
            await onUpdateProfile({ profilePictureUrl: '' })
        } catch (err) {
            setError(err.message || 'Failed to switch to default avatar')
        } finally {
            setIsAvatarUploading(false)
        }
    }

    const handleUpgrade = async () => {
        if (typeof onUpgradeToPlus !== 'function') return
        setUpgradeError('')
        setIsUpgradeLoading(true)
        try {
            await onUpgradeToPlus()
        } catch (err) {
            setUpgradeError(err?.message || 'Could not start checkout right now.')
        } finally {
            setIsUpgradeLoading(false)
        }
    }

    const handleInvoiceExport = async () => {
        if (typeof onExportLatestInvoice !== 'function') return
        setInvoiceError('')
        setIsInvoiceLoading(true)
        try {
            await onExportLatestInvoice()
        } catch (err) {
            setInvoiceError(err?.message || 'Could not export invoice right now.')
        } finally {
            setIsInvoiceLoading(false)
        }
    }

    if (!isEditing) {
        return (
            <div className="inner-view">
                <button className="back-btn" onClick={onBack}>
                    <span>←</span>
                    <span>Back</span>
                </button>
                <div className="profile-layout">
                    {/* Left column – identity card */}
                    <div className="profile-card profile-identity-card">
                        <div className="profile-card-header">
                            <div className="profile-header-main">
                                <div className="profile-avatar-panel">
                                    <div className="profile-avatar-wrapper">
                                        <div className="profile-avatar lg">
                                            {avatarUrl ? (
                                                <img src={avatarUrl} alt="avatar" className="profile-avatar-img" />
                                            ) : (
                                                <span className="profile-avatar-initials" style={profileAvatarStyle}>
                                                    {profileInitial}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            className="avatar-edit-btn"
                                            onClick={() => fileInputRef.current?.click()}
                                            title="Change avatar"
                                            disabled={isAvatarUploading}
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
                                    {isAvatarUploading && (
                                        <div className="avatar-upload-progress" role="status" aria-live="polite">
                                            <div className="avatar-upload-progress-track">
                                                <span className="avatar-upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
                                            </div>
                                            <span className="avatar-upload-progress-label">Uploading {uploadProgress}%</span>
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        className="avatar-reset-btn"
                                        onClick={handleUseDefaultAvatar}
                                        disabled={isAvatarUploading || isSaving}
                                    >
                                        Use default avatar
                                    </button>
                                </div>
                                <div className="profile-info">
                                    <h2 className="profile-name">
                                        {session?.user?.name}
                                        {verifiedBadgeEnabled && <span className="verified-pill">Verified</span>}
                                    </h2>
                                    {profileHandle && <p className="profile-handle">{profileHandle}</p>}
                                    <p className="profile-email">{session?.user?.email}</p>
                                </div>
                            </div>
                            <button className="btn-primary profile-edit-btn" onClick={() => setIsEditing(true)}>
                                Edit profile
                            </button>
                        </div>
                    </div>

                    {/* Right column – details & stats */}
                    <div className="profile-details-column">
                        <div className="profile-card profile-info-card">
                            <div className="card-section-header card-section-header--with-action">
                                <div className="card-section-heading">
                                    <span className="card-eyebrow">Personal info</span>
                                    <h3 className="card-title">About you</h3>
                                </div>
                                <button
                                    type="button"
                                    className="card-inline-edit"
                                    onClick={() => setIsEditing(true)}
                                >
                                    Edit
                                </button>
                            </div>
                            <div className="info-rows">
                                <div className="info-row">
                                    <span className="info-label">Username</span>
                                    <p className="info-value">{profileHandle || 'Not set'}</p>
                                </div>
                                <div className="info-row info-row--with-action">
                                    <div className="info-row-main">
                                        <span className="info-label">Bio</span>
                                        <p className="info-value info-value--muted">
                                            {bioText}
                                        </p>
                                    </div>
                                    {!hasBio && (
                                        <button
                                            type="button"
                                            className="info-inline-action"
                                            onClick={() => setIsEditing(true)}
                                        >
                                            Add bio
                                        </button>
                                    )}
                                </div>
                                <div className="info-row info-row--with-action">
                                    <div className="info-row-main">
                                        <span className="info-label">Gender</span>
                                        <p className="info-value" style={{ textTransform: 'capitalize' }}>
                                            {hasGender
                                                ? session?.user?.gender?.replace(/_/g, ' ')
                                                : 'Not specified'}
                                        </p>
                                    </div>
                                    {!hasGender && (
                                        <button
                                            type="button"
                                            className="info-inline-action"
                                            onClick={() => setIsEditing(true)}
                                        >
                                            Set gender
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="profile-card profile-aura-card">
                            <div className="aura-card-header">
                                <div>
                                    <span className="card-eyebrow">Account Aura</span>
                                    <h3 className="card-title">{auraLevel.name}</h3>
                                </div>
                                <div className="aura-card-value">
                                    <span className="aura-point-value">{auraPoints}</span>
                                    <span className="aura-point-label">{auraLevel.name}</span>
                                </div>
                            </div>

                            <div className="aura-progress">
                                <div className="aura-progress-track">
                                    <div
                                        className="aura-progress-fill"
                                        style={{ '--aura-progress': `${auraProgress}` }}
                                    />
                                </div>
                                <div className="aura-progress-meta">
                                    <span className="aura-progress-label">
                                        {auraLevel.nextLevel !== null
                                            ? `Next tier at ${auraLevel.nextLevel} points`
                                            : 'Top aura tier reached'}
                                    </span>
                                    <span className="aura-progress-range">Climb as you match, talk, and stay kind.</span>
                                </div>
                            </div>

                            <div className="aura-substats">
                                <div className="aura-substat">
                                    <span className="aura-substat-label">Conversations completed</span>
                                    <span className="aura-substat-value">{roomsEntered}</span>
                                </div>
                                <div className="aura-substat">
                                    <span className="aura-substat-label">Friends made</span>
                                    <span className="aura-substat-value">{friendCount}</span>
                                </div>
                            </div>
                        </div>

                        <div className="profile-card premium-status-card">
                            <div className="card-section-header">
                                <div className="card-section-heading">
                                    <span className="card-eyebrow">Muhdikhai Plus</span>
                                    <h3 className="card-title">Verified badge & advanced profile</h3>
                                </div>
                            </div>
                                <p className="premium-status-copy">
                                    {verifiedBadgeEnabled
                                        ? 'Your verified badge is active across profile and chat.'
                                        : 'Unlock verified badge, cleaner profile identity, and premium visibility at just ₹5/month.'}
                                </p>
                            <div className="premium-status-meta">
                                <span className={`premium-status-pill ${isPremiumActive ? 'active' : ''}`}>
                                    {isPremiumActive ? 'Plus Active' : 'Free Plan • ₹5/month'}
                                </span>
                                {isPremiumActive && expiryText && (
                                    <span className="premium-status-expiry">Renews visibility till {expiryText}</span>
                                )}
                            </div>
                            {upgradeError && <div className="modal-error modal-error--inline">{upgradeError}</div>}
                            {invoiceError && <div className="modal-error modal-error--inline">{invoiceError}</div>}
                            <div className="premium-status-actions">
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={handleUpgrade}
                                    disabled={isUpgradeLoading}
                                >
                                    {isUpgradeLoading ? 'Opening checkout...' : (isPremiumActive ? 'Extend Plus (₹5)' : 'Upgrade to Plus (₹5)')}
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary invoice-export-btn"
                                    onClick={handleInvoiceExport}
                                    disabled={isInvoiceLoading}
                                >
                                    {isInvoiceLoading ? 'Preparing PDF...' : 'Export Invoice PDF'}
                                </button>
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
            <div className="profile-layout profile-layout--editing">
                {/* Left column – static identity preview */}
                <div className="profile-card profile-identity-card profile-identity-card--editing">
                    <div className="profile-card-header">
                        <div className="profile-header-main">
                            <div className="profile-avatar-panel">
                                <div
                                    className={`avatar-upload-wrap avatar-upload-wrap--editing ${isAvatarUploading ? 'is-uploading' : ''}`}
                                    onClick={() => {
                                        if (!isAvatarUploading) fileInputRef.current?.click()
                                    }}
                                    title={isAvatarUploading ? 'Uploading photo...' : 'Change profile photo'}
                                >
                                    <div className="profile-avatar lg">
                                        {avatarUrl ? (
                                            <img src={avatarUrl} alt="avatar" className="profile-avatar-img" />
                                        ) : (
                                            <span className="profile-avatar-initials" style={profileAvatarStyle}>
                                                {profileInitial}
                                            </span>
                                        )}
                                    </div>
                                    <div className="avatar-edit-overlay">
                                        <span>{isAvatarUploading ? `${uploadProgress}%` : 'Change photo'}</span>
                                    </div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        style={{ display: 'none' }}
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        disabled={isAvatarUploading}
                                    />
                                </div>
                                {isAvatarUploading && (
                                    <div className="avatar-upload-progress" role="status" aria-live="polite">
                                        <div className="avatar-upload-progress-track">
                                            <span className="avatar-upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
                                        </div>
                                        <span className="avatar-upload-progress-label">Uploading {uploadProgress}%</span>
                                    </div>
                                )}
                                <button
                                    type="button"
                                    className="avatar-reset-btn"
                                    onClick={handleUseDefaultAvatar}
                                    disabled={isAvatarUploading || isSaving}
                                >
                                    Use default avatar
                                </button>
                            </div>
                            <div className="profile-info">
                                <span className="card-eyebrow">Editing profile</span>
                                <h2 className="profile-name">
                                    {session?.user?.name}
                                    {verifiedBadgeEnabled && <span className="verified-pill">Verified</span>}
                                </h2>
                                {profileHandle && <p className="profile-handle">{profileHandle}</p>}
                                <p className="profile-email">{session?.user?.email}</p>
                            </div>
                        </div>
                    </div>
                    <div className="profile-edit-hint">
                        Changes here update what others see on your profile card.
                    </div>
                </div>

                {/* Right column – form card */}
                <div className="profile-card profile-edit-card">
                    <div className="profile-edit-header">
                        <div className="card-section-heading">
                            <span className="card-eyebrow">Profile details</span>
                            <h3 className="card-title">Update your basics</h3>
                        </div>
                    </div>

                    <div className="profile-edit-grid">
                        <div className="profile-field-group">
                            <label className="profile-field-label">Username</label>
                            <input
                                className="profile-input profile-input--mono"
                                value={editData.username}
                                onChange={(e) => setEditData({ ...editData, username: normalizeUsernameInput(e.target.value) })}
                                placeholder="your_handle"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                maxLength={30}
                            />
                            <div className={`profile-field-meta profile-field-meta--username ${usernameState.available === false ? 'is-error' : ''}`}>
                                <span className="profile-field-hint">
                                    Lowercase letters, numbers, underscores.
                                </span>
                                <span className="profile-field-count">
                                    {usernameState.message || `${Math.max(0, 3 - (editData.username || '').length)} chars to minimum`}
                                </span>
                            </div>
                        </div>
                        <div className="profile-field-group">
                            <label className="profile-field-label">Name</label>
                            <input
                                className="profile-input"
                                value={editData.name}
                                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                placeholder="Your name"
                            />
                        </div>
                        <div className="profile-field-group profile-field-group--full">
                            <label className="profile-field-label">Bio</label>
                            <textarea
                                className="profile-textarea"
                                value={editData.bio}
                                onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                                placeholder="Tell others about yourself..."
                                maxLength={500}
                            />
                            <div className="profile-field-meta">
                                <span className="profile-field-hint">Keep it short, honest, and kind.</span>
                                <span className="profile-field-count">
                                    {editData.bio.length}/500
                                </span>
                            </div>
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
                    </div>

                    {error && <div className="modal-error modal-error--inline">{error}</div>}

                    <div className="profile-edit-footer">
                        <button className="btn-primary" onClick={handleSave} disabled={isSaving || isAvatarUploading}>
                            {isSaving ? 'Saving...' : isAvatarUploading ? 'Uploading photo...' : 'Save profile'}
                        </button>
                    </div>
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

function formatGenderLabel(gender) {
    if (!gender) return 'Not specified'
    return gender
        .replace(/_/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
}

function FriendRequests({ requests, onRespond }) {
    if (!requests || requests.length === 0) {
        return <div className="friends-empty">No pending requests</div>
    }

    return (
        <div className="friends-list">
            {requests.map((req) => {
                const avatarUrl = getAvatarUrl(req.user)
                const avatarStyle = getAvatarStyle(req.user)
                const avatarInitial = getAvatarInitial(req.user)
                const handle = getDisplayHandle(req.user)
                return (
                    <div
                        key={req.id}
                        className="recent-match-card"
                        style={{ '--aura-color': req.user?.auraPoints !== undefined ? calculateAuraLevel(req.user.auraPoints).color : 'var(--stroke)' }}
                    >
                        <div className="recent-avatar">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="avatar" />
                            ) : (
                                <span className="avatar-placeholder" style={avatarStyle}>{avatarInitial}</span>
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
                            <span className="recent-topic">
                                {handle ? `${handle}  •  Wants to be your friend` : 'Wants to be your friend'}
                            </span>
                        </div>
                        <div className="friend-actions">
                            <button className="friend-accept-btn" onClick={() => onRespond(req.id, 'accept')}>Accept</button>
                            <button className="friend-deny-btn" onClick={() => onRespond(req.id, 'deny')}>Deny</button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function ProfilePeekModal({ userId, session, onClose }) {
    const [profile, setProfile] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        const handleEsc = (event) => {
            if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleEsc)
        return () => window.removeEventListener('keydown', handleEsc)
    }, [onClose])

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                setLoading(true)
                setError('')
                const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000'
                const res = await fetch(`${BACKEND_URL}/api/v1/users/${userId}`, {
                    headers: { Authorization: `Bearer ${session.accessToken}` },
                })
                const json = await res.json()
                if (json.success) {
                    setProfile(json.data.user)
                } else {
                    setError(json.message || 'Could not load profile')
                }
            } catch (err) {
                console.error('Failed to fetch profile', err)
                setError('Could not load profile')
            } finally {
                setLoading(false)
            }
        }
        fetchProfile()
    }, [userId, session.accessToken])

    const profileAvatarUrl = getAvatarUrl(profile)
    const aura = calculateAuraLevel(profile?.auraPoints || 0)

    return (
        <div className="home-profile-modal-overlay" onClick={onClose}>
            <div className="home-profile-modal-card" onClick={(event) => event.stopPropagation()}>
                <button className="home-profile-modal-close" type="button" onClick={onClose} aria-label="Close profile">✕</button>
                {loading ? (
                    <div className="home-profile-modal-state">Loading profile...</div>
                ) : error ? (
                    <div className="home-profile-modal-state home-profile-modal-state--error">{error}</div>
                ) : (
                    <>
                        <div className="home-profile-modal-head">
                            <div className="home-profile-modal-avatar">
                                {profileAvatarUrl ? (
                                    <img src={profileAvatarUrl} alt={profile?.name || 'User avatar'} />
                                ) : (
                                    <span className="avatar-placeholder" style={getAvatarStyle(profile)}>
                                        {getAvatarInitial(profile)}
                                    </span>
                                )}
                            </div>
                            <div className="home-profile-modal-identity">
                                <h3>{profile?.name || 'Unknown user'}</h3>
                                <p>{profile?.username ? `@${profile.username}` : 'No username set'}</p>
                            </div>
                        </div>

                        <div className="home-profile-modal-meta">
                            <div className="home-profile-modal-meta-item">
                                <span>Gender</span>
                                <strong>{formatGenderLabel(profile?.gender)}</strong>
                            </div>
                            <div className="home-profile-modal-meta-item">
                                <span>Aura</span>
                                <strong style={{ color: aura.color }}>
                                    {profile?.auraPoints || 0} • {aura.name}
                                </strong>
                            </div>
                        </div>

                        <div className="home-profile-modal-bio">
                            <span>Bio</span>
                            <p>{profile?.bio?.trim() || 'No bio added yet.'}</p>
                        </div>
                    </>
                )}
            </div>
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
                const avatarUrl = getAvatarUrl(friend.user)
                const avatarStyle = getAvatarStyle(friend.user)
                const avatarInitial = getAvatarInitial(friend.user)
                const handle = getDisplayHandle(friend.user)
                return (
                    <div
                        key={friend.id}
                        className={`recent-match-card ${unread > 0 ? 'has-unread' : ''}`}
                        style={{ '--aura-color': friend.user?.auraPoints !== undefined ? calculateAuraLevel(friend.user.auraPoints).color : 'var(--stroke)' }}
                    >
                        <div className="recent-avatar">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="avatar" />
                            ) : (
                                <span className="avatar-placeholder" style={avatarStyle}>{avatarInitial}</span>
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
                            <span className="recent-topic">
                                {unread > 0
                                    ? `${unread} new message${unread > 1 ? 's' : ''}`
                                    : (handle || 'Friend')}
                            </span>
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

function HomeTabSkeleton({ variant = 'matches', count = 4 }) {
    const items = Array.from({ length: count })
    const isMatches = variant === 'matches'
    const isRequests = variant === 'requests'

    return (
        <div
            className={`home-skeleton-list ${isMatches ? 'home-skeleton-list--matches' : ''}`}
            role="status"
            aria-live="polite"
        >
            <span className="home-skeleton-announcer">Loading {variant}...</span>
            {items.map((_, idx) => (
                <div key={`${variant}-${idx}`} className={`recent-match-card skeleton-card skeleton-card--${variant}`}>
                    <div className="recent-avatar skeleton-avatar">
                        <span className="skeleton-block" />
                    </div>
                    <div className="recent-info">
                        <span className="skeleton-block skeleton-line skeleton-line--title" />
                        <span className="skeleton-block skeleton-line skeleton-line--meta" />
                    </div>
                    {isRequests ? (
                        <div className="skeleton-actions">
                            <span className="skeleton-block skeleton-action" />
                            <span className="skeleton-block skeleton-action" />
                        </div>
                    ) : (
                        <span className="skeleton-block skeleton-pill" />
                    )}
                </div>
            ))}
        </div>
    )
}

export default function Home({ session, onlineCount, isTransitioning, onStartMatch, onSignOut, onDeleteAccount, onUpdateProfile, onUploadAvatar, onCheckUsernameAvailability, onFetchMatches, onAddFriend, onFetchFriendships, onRespondToFriendRequest, onOpenChat, unreadCounts, onOpenHaveli, authedFetch, onUpgradeToPlus, onExportLatestInvoice }) {

    const [selectedTopics, setSelectedTopics] = useState([])
    const [customTopic, setCustomTopic] = useState('')
    const [matchingPreference, setMatchingPreference] = useState('everyone') // 'male', 'female', 'everyone'
    const [matchValidationError, setMatchValidationError] = useState('')




    const [view, setView] = useState('home') // 'home' | 'profile' | 'settings' | 'haveli'
    const [homeTab, setHomeTab] = useState('matches') // 'matches' | 'friends' | 'requests'
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [recentMatches, setRecentMatches] = useState([])
    const [friendships, setFriendships] = useState([])
    const [friendRequests, setFriendRequests] = useState([])
    const [loadingHome, setLoadingHome] = useState(false)
    const [selectedProfileId, setSelectedProfileId] = useState(null)
    const [clientHour, setClientHour] = useState(null)

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

    useEffect(() => {
        setClientHour(new Date().getHours())
    }, [])

    const greeting =
        clientHour === null
            ? 'Welcome'
            : clientHour < 5 ? 'Still awake?' : clientHour < 12 ? 'Good morning' : clientHour < 17 ? 'Good afternoon' : clientHour < 21 ? 'Good evening' : 'Good night'

    const name = session?.user?.name?.split(' ')[0] || 'you'
    const sessionAvatarUrl = getAvatarUrl(session?.user)


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
        const hasGender = !!session?.user?.gender
        const hasBio = !!(session?.user?.bio && session.user.bio.trim().length > 0)
        if (!hasGender || !hasBio) {
            setMatchValidationError('Before matching, please complete your profile with gender and bio.')
            return
        }
        setMatchValidationError('')
        onStartMatch(selectedTopics, matchingPreference)
    }

    if (view === 'profile') {
        return (
            <ProfileView
                session={session}
                onBack={() => setView('home')}
                onUpdateProfile={onUpdateProfile}
                onUploadAvatar={onUploadAvatar}
                onCheckUsernameAvailability={onCheckUsernameAvailability}
                onUpgradeToPlus={onUpgradeToPlus}
                onExportLatestInvoice={onExportLatestInvoice}
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

    if (view === 'haveli') {
        return (
            <HaveliBazaar
                session={session}
                authedFetch={authedFetch}
                onEnterHaveli={(haveli) => {
                    if (onOpenHaveli) onOpenHaveli(haveli)
                }}
                onBack={() => setView('home')}
            />
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
            {matchValidationError && (
                <div className="home-match-warning" role="alert">
                    <span>{matchValidationError}</span>
                    <button type="button" onClick={() => setView('profile')}>
                        Complete profile
                    </button>
                </div>
            )}

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
                    <>
                        {homeTab === 'matches' && <HomeTabSkeleton variant="matches" count={3} />}
                        {homeTab === 'friends' && <HomeTabSkeleton variant="friends" count={4} />}
                        {homeTab === 'requests' && <HomeTabSkeleton variant="requests" count={3} />}
                    </>
                ) : (
                    <>
                        {homeTab === 'matches' && (
                            recentMatches.length > 0 ? (
                                <div className="home-recents-section">
                                    <div className="recents-list">
                                        {recentMatches.map((match) => {
                                            const avatarUrl = getAvatarUrl(match.partner)
                                            const avatarStyle = getAvatarStyle(match.partner)
                                            const avatarInitial = getAvatarInitial(match.partner)
                                            const handle = getDisplayHandle(match.partner)
                                            const canOpenProfile = Boolean(match.partner?.id)
                                            return (
                                                <div
                                                    key={match.id}
                                                    className={`recent-match-card ${canOpenProfile ? 'recent-match-card--clickable' : ''}`}
                                                    role={canOpenProfile ? 'button' : undefined}
                                                    tabIndex={canOpenProfile ? 0 : undefined}
                                                    onClick={canOpenProfile ? () => setSelectedProfileId(match.partner.id) : undefined}
                                                    onKeyDown={canOpenProfile ? (event) => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault()
                                                            setSelectedProfileId(match.partner.id)
                                                        }
                                                    } : undefined}
                                                >
                                                    <div className="recent-avatar">
                                                        {avatarUrl ? (
                                                            <img src={avatarUrl} alt="avatar" />
                                                        ) : (
                                                            <span className="avatar-placeholder" style={avatarStyle}>{avatarInitial}</span>
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
                                                        <span className="recent-topic">
                                                            {handle
                                                                ? `${handle}${match.sharedTopic ? `  •  Talked about ${match.sharedTopic}` : ''}`
                                                                : (match.sharedTopic ? `Talked about ${match.sharedTopic}` : 'Recent match')}
                                                        </span>
                                                    </div>
                                                    <button
                                                        className="recent-add-btn"
                                                        type="button"
                                                        title="Send Friend Request"
                                                        onClick={(event) => {
                                                            event.stopPropagation()
                                                            handleRecentAddFriend(match.partner.id)
                                                        }}
                                                    >
                                                        + Friend
                                                    </button>
                                                </div>
                                            )
                                        })}
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
                        {sessionAvatarUrl ? (
                            <img src={sessionAvatarUrl} alt="avatar" className="home-card-avatar" />
                        ) : (
                            <span className="home-card-avatar-initials" style={getAvatarStyle(session?.user)}>
                                {getAvatarInitial(session?.user)}
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
                        {getDisplayHandle(session?.user) && <span className="home-card-sub">{getDisplayHandle(session?.user)}</span>}
                    </div>
                    <span className="home-card-arrow">→</span>
                </button>



                {/* Haveli — Group Rooms */}
                <button className="home-card" type="button" onClick={() => setView('haveli')}>
                    <div className="home-card-icon-wrap" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(109,40,217,0.1))' }}>
                        <span className="home-card-icon-glyph" style={{ fontSize: '1.4rem' }}>🏛️</span>
                    </div>
                    <div className="home-card-body">
                        <span className="home-card-label">Group Rooms</span>
                        <span className="home-card-title">The Haveli</span>
                        <span className="home-card-sub">Create rooms, invite friends, vibe together</span>
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
            {selectedProfileId && (
                <ProfilePeekModal
                    userId={selectedProfileId}
                    session={session}
                    onClose={() => setSelectedProfileId(null)}
                />
            )}
        </div>
    )
}
