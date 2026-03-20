import React, { useMemo, useRef, useState } from 'react'

const GENDERS = [
    { id: 'male', label: 'He / Him', icon: '♂', mood: 'Clear presence' },
    { id: 'female', label: 'She / Her', icon: '♀', mood: 'Soft signal' },
    { id: 'non-binary', label: 'They / Them', icon: '⚥', mood: 'Open energy' },
    { id: 'other', label: 'Other', icon: '✧', mood: 'Custom identity' },
    { id: 'prefer_not_to_say', label: 'Quiet', icon: '☁', mood: 'Keep it minimal' },
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

const STEP_META = [
    {
        index: '01',
        title: 'Shape your first impression',
        caption: 'Name + identity',
        description: 'Choose how the room will meet you. Keep it simple, human, and easy to trust.',
    },
    {
        index: '02',
        title: 'Pick a visual signal',
        caption: 'Avatar + glow',
        description: 'Your profile should feel intentional before your first message ever lands.',
    },
    {
        index: '03',
        title: 'Add your room energy',
        caption: 'Bio + finish',
        description: 'A short line helps the whole experience feel more alive without making it heavy.',
    },
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
        bio: '',
    })

    const currentStep = STEP_META[step - 1]
    const selectedAvatar = useMemo(() => AVATARS.find((avatar) => avatar.id === profile.avatar) || AVATARS[0], [profile.avatar])
    const selectedGender = useMemo(() => GENDERS.find((gender) => gender.id === profile.gender), [profile.gender])
    const completion = `${Math.round((step / STEP_META.length) * 100)}%`

    const handleNext = () => setStep((prev) => Math.min(STEP_META.length, prev + 1))
    const handlePrev = () => setStep((prev) => Math.max(1, prev - 1))

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        setError('')

        const formData = new FormData()
        formData.append('avatar', file)

        try {
            const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000'
            const response = await fetch(`${BACKEND_URL}/api/v1/users/me/avatar`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${session.accessToken}`,
                },
                body: formData,
            })

            if (!response.ok) throw new Error('Upload failed')

            const result = await response.json()
            setProfile((prev) => ({
                ...prev,
                customAvatarUrl: result.data.url,
                avatar: 'custom',
            }))
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
            let profilePictureUrl = ''
            if (profile.avatar === 'custom' && profile.customAvatarUrl) {
                profilePictureUrl = profile.customAvatarUrl
            } else {
                profilePictureUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'Muhdikhai')}&background=${selectedAvatar.color.replace('#', '')}&color=fff&size=256`
            }

            const payload = {
                name: profile.name,
                gender: profile.gender,
                bio: profile.bio || 'Just a gentle stranger.',
                profilePictureUrl,
            }

            const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000'
            const response = await fetch(`${BACKEND_URL}/api/v1/users/me`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.accessToken}`,
                },
                body: JSON.stringify(payload),
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
            <div className="onboarding-ambient-orb onboarding-ambient-orb--one" />
            <div className="onboarding-ambient-orb onboarding-ambient-orb--two" />

            <div className="onboarding-shell">
                <aside className="onboarding-preview-panel">
                    <div className="onboarding-preview-top">
                        <span className="onboarding-kicker">Hosted flow</span>
                        <h2>Set the tone before the room opens.</h2>
                        <p>
                            Muhdikhai works better when the first message already feels like it came from a real person instead of an empty placeholder.
                        </p>
                    </div>

                    <div className="onboarding-stage-card">
                        <div className="onboarding-stage-glow" style={{ '--avatar-glow': selectedAvatar.color }} />
                        <div className="onboarding-stage-header">
                            <span className="onboarding-stage-badge">Profile preview</span>
                            <span className="onboarding-stage-progress">{completion} ready</span>
                        </div>

                        <div className="onboarding-identity-preview">
                            <div
                                className={`onboarding-avatar-preview ${profile.avatar === 'custom' ? 'is-image' : ''}`}
                                style={{ '--avatar-glow': selectedAvatar.color }}
                            >
                                {profile.avatar === 'custom' && profile.customAvatarUrl ? (
                                    <img src={profile.customAvatarUrl} alt="Selected avatar" className="avatar-upload-preview" />
                                ) : (
                                    <span>{selectedAvatar.icon}</span>
                                )}
                            </div>

                            <div className="onboarding-identity-copy">
                                <h3>{profile.name || 'Your room name'}</h3>
                                <p>{selectedGender?.label || 'Choose an identity signal'}</p>
                            </div>
                        </div>

                        <div className="onboarding-preview-message-stack">
                            <div className="onboarding-preview-bubble onboarding-preview-bubble--theirs">
                                Room ready. Let&apos;s see who shows up.
                            </div>
                            <div className="onboarding-preview-bubble onboarding-preview-bubble--mine">
                                {profile.bio || 'Quietly arriving with better UI than before.'}
                            </div>
                        </div>

                        <div className="onboarding-preview-chips">
                            <span>{selectedGender?.mood || 'Identity'}</span>
                            <span>{profile.avatar === 'custom' ? 'Custom avatar' : 'Curated avatar'}</span>
                            <span>{profile.bio ? 'Bio added' : 'Bio optional'}</span>
                        </div>
                    </div>

                    <div className="onboarding-step-rail">
                        {STEP_META.map((item, index) => (
                            <div
                                key={item.index}
                                className={`onboarding-step-rail-item ${step === index + 1 ? 'is-active' : ''} ${step > index + 1 ? 'is-complete' : ''}`}
                            >
                                <span className="onboarding-step-rail-index">{item.index}</span>
                                <div>
                                    <strong>{item.caption}</strong>
                                    <p>{item.title}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>

                <section className="onboarding-card">
                    <div className="onboarding-progress">
                        <div className="progress-bar" style={{ width: `${(step / STEP_META.length) * 100}%` }} />
                    </div>

                    <div className="onboarding-header">
                        <span className="onboarding-step-tag">Step {currentStep.index}</span>
                        <h1 className="onboarding-title">{currentStep.title}</h1>
                        <p className="onboarding-sub">{currentStep.description}</p>
                    </div>

                    {step === 1 && (
                        <div className="onboarding-step fade-in">
                            <div className="input-field">
                                <label>Your Name</label>
                                <input
                                    type="text"
                                    value={profile.name}
                                    onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                                    placeholder="Name or Alias"
                                />
                            </div>

                            <div className="gender-grid">
                                {GENDERS.map((gender) => (
                                    <button
                                        key={gender.id}
                                        type="button"
                                        className={`gender-btn ${profile.gender === gender.id ? 'active' : ''}`}
                                        onClick={() => setProfile((prev) => ({ ...prev, gender: gender.id }))}
                                    >
                                        <span className="gender-icon">{gender.icon}</span>
                                        <span className="gender-copy">
                                            <span className="gender-label">{gender.label}</span>
                                            <span className="gender-mood">{gender.mood}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>

                            <button
                                className="onboarding-cta"
                                disabled={!profile.name || !profile.gender}
                                onClick={handleNext}
                            >
                                Continue to avatar
                            </button>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="onboarding-step fade-in">
                            <div className="onboarding-section-copy">
                                <p>
                                    Pick a glow that feels like you. The room should look intentional before anyone reads a word.
                                </p>
                            </div>

                            <div className="avatar-grid">
                                {AVATARS.map((avatar) => (
                                    <button
                                        key={avatar.id}
                                        type="button"
                                        className={`avatar-btn ${profile.avatar === avatar.id ? 'active' : ''}`}
                                        onClick={() => setProfile((prev) => ({ ...prev, avatar: avatar.id }))}
                                        style={{ '--avatar-color': avatar.color }}
                                    >
                                        <span className="avatar-preview">{avatar.icon}</span>
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
                                    type="button"
                                    className={`avatar-btn upload-btn ${profile.avatar === 'custom' ? 'active' : ''}`}
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                >
                                    {profile.customAvatarUrl ? (
                                        <img src={profile.customAvatarUrl} alt="Uploaded avatar" className="avatar-upload-preview" />
                                    ) : (
                                        <span className="upload-icon">{uploading ? '...' : '+'}</span>
                                    )}
                                </button>
                            </div>

                            <div className="onboarding-actions">
                                <button type="button" className="onboarding-back" onClick={handlePrev}>Back</button>
                                <button type="button" className="onboarding-cta" onClick={handleNext}>Continue to bio</button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="onboarding-step fade-in">
                            <div className="input-field">
                                <label>Bio (Optional)</label>
                                <textarea
                                    value={profile.bio}
                                    onChange={(e) => setProfile((prev) => ({ ...prev, bio: e.target.value }))}
                                    placeholder="Somewhere between a hello and a goodbye..."
                                    rows={4}
                                />
                            </div>

                            <div className="onboarding-section-copy onboarding-section-copy--compact">
                                <p>
                                    Keep it short. A line is enough to make the room feel more human.
                                </p>
                            </div>

                            {error && <p className="onboarding-error">{error}</p>}

                            <div className="onboarding-actions">
                                <button type="button" className="onboarding-back" onClick={handlePrev}>Back</button>
                                <button type="button" className="onboarding-cta" onClick={handleSubmit} disabled={loading}>
                                    {loading ? 'Creating your room...' : 'Enter Muhdikhai'}
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    )
}
