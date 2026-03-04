import { useState } from 'react'
import './Home.css'

function ProfileView({ session, onBack }) {
    return (
        <div className="inner-view">
            <button className="back-btn" type="button" onClick={onBack}>
                <span>←</span>
                <span>Back to home</span>
            </button>
            <div className="profile-card">
                <div className="profile-avatar">
                    {session?.user?.photoURL ? (
                        <img src={session.user.photoURL} alt="avatar" className="profile-avatar-img" />
                    ) : (
                        <span className="profile-avatar-initials">
                            {(session?.user?.name || session?.user?.email || 'U')[0].toUpperCase()}
                        </span>
                    )}
                </div>
                <div className="profile-info">
                    <span className="profile-name">{session?.user?.name || 'Anonymous'}</span>
                    <span className="profile-email">{session?.user?.email || ''}</span>
                </div>
                <div className="profile-stats">
                    <div className="profile-stat">
                        <span className="profile-stat-value">0</span>
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

function SettingsView({ onBack, onSignOut }) {
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
            </div>
        </div>
    )
}

export default function Home({ session, onStartMatch, onSignOut }) {
    const [view, setView] = useState('home') // 'home' | 'profile' | 'settings'

    const hour = new Date().getHours()
    const greeting =
        hour < 5 ? 'Still awake?' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night'

    const name = session?.user?.name?.split(' ')[0] || 'you'

    if (view === 'profile') {
        return <ProfileView session={session} onBack={() => setView('home')} />
    }

    if (view === 'settings') {
        return <SettingsView onBack={() => setView('home')} onSignOut={onSignOut} />
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
                    One stranger is waiting to be found. Or take your time — there&apos;s no rush here.
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
                            <span className="home-status-dot amber" />
                            <span>Pool growing quietly</span>
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
