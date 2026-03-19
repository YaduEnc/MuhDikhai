import { useState } from 'react'

export default function VibeCheckModal({ partner, roomId, onVote, onSkip }) {
    const [status, setStatus] = useState('idle') // 'idle', 'voting', 'done'
    const [error, setError] = useState('')

    const handleVote = async (vibe) => {
        setStatus('voting')
        setError('')
        try {
            await onVote(vibe)
            setStatus('done')
            // Add a small delay for feedback before closing
            setTimeout(() => onSkip(), 1200)
        } catch (err) {
            setError('Failed to record vibe. Try skipping.')
            setStatus('idle')
        }
    }

    if (status === 'done') {
        return (
            <div className="vibe-modal-overlay">
                <div className="vibe-modal-card done">
                    <div className="vibe-done-icon">✧</div>
                    <h3>Grateful for your honesty.</h3>
                    <p>Connecting you to the next room shortly...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="vibe-modal-overlay">
            <div className="vibe-modal-card">
                <div className="vibe-modal-eyebrow">Shared Moments</div>
                <h3>How was the vibe with {partner?.name || 'them'}?</h3>
                <p>Your feedback helps keep Muhdikhai tender and safe for everyone.</p>

                <div className="vibe-actions">
                    <button
                        className="vibe-btn warm"
                        onClick={() => handleVote('warm')}
                        disabled={status === 'voting'}
                    >
                        <span className="vibe-icon">☀️</span>
                        <div className="vibe-text">
                            <span className="vibe-label">Warm</span>
                            <span className="vibe-desc">Kind & Pleasant</span>
                        </div>
                    </button>

                    <button
                        className="vibe-btn cold"
                        onClick={() => handleVote('cold')}
                        disabled={status === 'voting'}
                    >
                        <span className="vibe-icon">❄️</span>
                        <div className="vibe-text">
                            <span className="vibe-label">Cold</span>
                            <span className="vibe-desc">Rude or Odd</span>
                        </div>
                    </button>
                </div>

                {error && <div className="vibe-error">{error}</div>}

                <button className="vibe-skip" onClick={onSkip} disabled={status === 'voting'}>
                    Skip feedback
                </button>
            </div>
        </div>
    )
}
