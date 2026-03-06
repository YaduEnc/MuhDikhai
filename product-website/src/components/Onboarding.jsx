import React, { useState, useRef } from 'react'
import './Onboarding.css'

const GENDERS = [
    { id: 'male', label: 'He / Him', icon: '♂' },
    { id: 'female', label: 'She / Her', icon: '♀' },
    { id: 'non-binary', label: 'They / Them', icon: '⚥' },
    { id: 'other', label: 'Other', icon: '✧' },
    { id: 'prefer_not_to_say', label: 'Quiet', icon: '☁' },
]

const AVATARS = [
    { id: 'gentle_1', color: '#ffafbd', icon: '🌸' },
    { id: 'gentle_2', color: '#ffc3a0', icon: '🍊' },
    { id: 'gentle_3', color: '#2193b0', icon: '🌊' },
    { id: 'gentle_4', color: '#b21f1f', icon: '🌹' },
    { id: 'gentle_5', color: '#ee9ca7', icon: '🍥' },
    { id: 'gentle_6', color: '#42275a', icon: '🍇' },
    { id: 'gentle_7', color: '#11998e', icon: '🌿' },
    { id: 'gentle_8', color: '#fdbb2d', icon: '✨' },
]

export default function Onboarding({ session, onComplete }) {
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState('')
    const fileInputRef = useRef(null)

    const [profile, setProfile] = useState({
        name: session?.user?.name || '',
        gender: '',
        avatar: AVATARS[0].id,
        customAvatarUrl: '',
        bio: ''
    })

    const handleNext = () => setStep(s => s + 1)
    const handlePrev = () => setStep(s => s - 1)

    const handleFileUpload = async (e) => {
        const file = e.target.files[0]
        if (!file) return

        setUploading(true)
        setError('')

        const formData = new FormData()
        formData.append('avatar', file)

        try {
            const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
            const response = await fetch(`${BACKEND_URL}/api/v1/users/me/avatar`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.accessToken}`
                },
                body: formData
            })

            if (!response.ok) throw new Error('Upload failed')

            const result = await response.json()
            setProfile({ ...profile, customAvatarUrl: result.data.url, avatar: 'custom' })
        } catch {
            setError('Could not upload image. Try a smaller file.')
        } finally {
            setUploading(false)
        }
    }

    const handleSubmit = async () => {
        setLoading(true)
        setError('')
        try {
            const selectedAvatar = AVATARS.find(a => a.id === profile.avatar)

            let profilePictureUrl = ''
            if (profile.avatar === 'custom' && profile.customAvatarUrl) {
                profilePictureUrl = profile.customAvatarUrl
            } else if (selectedAvatar) {
                profilePictureUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=${selectedAvatar.color.replace('#', '')}&color=fff&size=256`
            } else {
                // Fallback
                profilePictureUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=000&color=fff`
            }

            const payload = {
                name: profile.name,
                gender: profile.gender,
                bio: profile.bio || 'Just a gentle stranger.',
                profilePictureUrl
            }

            const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
            const response = await fetch(`${BACKEND_URL}/api/v1/users/me`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.accessToken}`
                },
                body: JSON.stringify(payload)
            })

            if (!response.ok) {
                throw new Error('Failed to save profile')
            }

            const result = await response.json()
            onComplete(result.data.user)
        } catch (err) {
            setError(err?.message || 'Could not save profile. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="onboarding-overlay">
            <div className="onboarding-card">
                <div className="onboarding-progress">
                    <div className="progress-bar" style={{ width: `${(step / 3) * 100}%` }} />
                </div>

                {step === 1 && (
                    <div className="onboarding-step fade-in">
                        <h2 className="onboarding-title">Welcome to MushDikhai</h2>
                        <p className="onboarding-sub">First, what should we call you in the quiet rooms?</p>

                        <div className="input-field">
                            <label>Your Name</label>
                            <input
                                type="text"
                                value={profile.name}
                                onChange={e => setProfile({ ...profile, name: e.target.value })}
                                placeholder="Name or Alias"
                            />
                        </div>

                        <div className="gender-grid">
                            {GENDERS.map(g => (
                                <button
                                    key={g.id}
                                    className={`gender-btn ${profile.gender === g.id ? 'active' : ''}`}
                                    onClick={() => setProfile({ ...profile, gender: g.id })}
                                >
                                    <span className="gender-icon">{g.icon}</span>
                                    <span className="gender-label">{g.label}</span>
                                </button>
                            ))}
                        </div>

                        <button
                            className="onboarding-cta"
                            disabled={!profile.name || !profile.gender}
                            onClick={handleNext}
                        >
                            Next Step
                        </button>
                    </div>
                )}

                {step === 2 && (
                    <div className="onboarding-step fade-in">
                        <h2 className="onboarding-title">Pick your glow</h2>
                        <p className="onboarding-sub">Select an avatar that represents your presence tonight.</p>

                        <div className="avatar-grid">
                            {AVATARS.map(a => (
                                <button
                                    key={a.id}
                                    className={`avatar-btn ${profile.avatar === a.id ? 'active' : ''}`}
                                    onClick={() => setProfile({ ...profile, avatar: a.id })}
                                    style={{ '--avatar-color': a.color }}
                                >
                                    <span className="avatar-preview">{a.icon}</span>
                                </button>
                            ))}

                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                accept="image/*"
                                onChange={handleFileUpload}
                            />

                            <button
                                className={`avatar-btn upload-btn ${profile.avatar === 'custom' ? 'active' : ''}`}
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                            >
                                {profile.customAvatarUrl ? (
                                    <img src={profile.customAvatarUrl} alt="Upload" className="avatar-upload-preview" />
                                ) : (
                                    <span className="upload-icon">{uploading ? '...' : '+'}</span>
                                )}
                            </button>
                        </div>

                        <div className="onboarding-actions">
                            <button className="onboarding-back" onClick={handlePrev}>Back</button>
                            <button className="onboarding-cta" onClick={handleNext}>Next Step</button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="onboarding-step fade-in">
                        <h2 className="onboarding-title">Almost there...</h2>
                        <p className="onboarding-sub">A tiny bit about yourself? (Keep it gentle)</p>

                        <div className="input-field">
                            <label>Bio (Optional)</label>
                            <textarea
                                value={profile.bio}
                                onChange={e => setProfile({ ...profile, bio: e.target.value })}
                                placeholder="Somewhere between a hello and a goodbye..."
                                rows={3}
                            />
                        </div>

                        {error && <p className="onboarding-error">{error}</p>}

                        <div className="onboarding-actions">
                            <button className="onboarding-back" onClick={handlePrev}>Back</button>
                            <button className="onboarding-cta" onClick={handleSubmit} disabled={loading}>
                                {loading ? 'Creating your room...' : 'Start My Journey'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
