import { useState, useEffect, useMemo } from 'react'
import { useWebRTC } from '../hooks/useWebRTC'
import { calculateAuraLevel } from '../utils/aura'
import { getAvatarUrl } from '../utils/avatar'

const REPORT_REASONS = [
    { value: 'abuse', label: 'Abuse or harassment' },
    { value: 'nudity', label: 'Sexual or explicit content' },
    { value: 'spam', label: 'Spam or scam' },
    { value: 'hate', label: 'Hate speech' },
    { value: 'impersonation', label: 'Impersonation' },
    { value: 'other', label: 'Other unsafe behavior' },
]

function formatDuration(totalSeconds) {
    const safe = Math.max(0, totalSeconds)
    const mins = Math.floor(safe / 60)
    const secs = safe % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function ReportModal({ partnerName, onClose, onSubmit, isSubmitting, status }) {
    const [reason, setReason] = useState(REPORT_REASONS[0].value)
    const [details, setDetails] = useState('')

    return (
        <div className="call-modal-scrim" onClick={onClose}>
            <div className="call-report-modal" onClick={(event) => event.stopPropagation()}>
                <div className="call-report-header">
                    <div>
                        <span className="call-report-eyebrow">Safety</span>
                        <h3>Report {partnerName || 'this caller'}</h3>
                    </div>
                    <button className="call-report-close" onClick={onClose} aria-label="Close report form">×</button>
                </div>

                <label className="call-report-field">
                    <span>Reason</span>
                    <select value={reason} onChange={(event) => setReason(event.target.value)}>
                        {REPORT_REASONS.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                    </select>
                </label>

                <label className="call-report-field">
                    <span>Details</span>
                    <textarea
                        rows={4}
                        value={details}
                        onChange={(event) => setDetails(event.target.value)}
                        placeholder="Add a few details so moderation knows what happened."
                    />
                </label>

                {status?.message && (
                    <div className={`call-report-status ${status.type || ''}`}>
                        {status.message}
                    </div>
                )}

                <div className="call-report-actions">
                    <button className="call-report-btn secondary" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </button>
                    <button
                        className="call-report-btn danger"
                        onClick={() => onSubmit({ reason, details })}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Sending...' : 'Submit report'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function CallOverlay({
    socket,
    session,
    callState,
    partner,
    onAccept,
    onDecline,
    onEnd,
    onReport,
}) {
    const roomId = partner?.roomId || partner?.id
    const recipientId = callState.type === 'friend' ? partner?.id : null

    const {
        localStream,
        remoteStream,
        isMuted,
        isVideoOff,
        toggleMute,
        toggleVideo,
        prepareLocalMedia,
        establishConnection,
        stopLocalMedia,
        availableVideoDevices,
        availableAudioDevices,
        selectedVideoDevice,
        selectedAudioDevice,
        switchDevice,
        callTelemetry
    } = useWebRTC(socket, roomId, session?.user?.id, recipientId)

    const [showDeviceSettings, setShowDeviceSettings] = useState(false)
    const [callSeconds, setCallSeconds] = useState(0)
    const [showReportModal, setShowReportModal] = useState(false)
    const [reportSubmitting, setReportSubmitting] = useState(false)
    const [reportStatus, setReportStatus] = useState({ type: '', message: '' })

    const networkBadge = callTelemetry.connectionBadge || { label: 'Syncing', tone: 'neutral', detail: 'Negotiating media path' }
    const shouldShowReconnectBanner = callState.status === 'active'
        && (callTelemetry.connectionState === 'disconnected' || callTelemetry.connectionState === 'failed' || callTelemetry.connectionState === 'connecting')

    const reconnectText = useMemo(() => {
        if (callTelemetry.connectionState === 'failed') {
            return 'Connection dropped. Trying to rebuild the video path.'
        }
        if (callTelemetry.connectionState === 'connecting') {
            return 'Negotiating call route...'
        }
        return 'Signal dipped. Reconnecting your call...'
    }, [callTelemetry.connectionState])

    useEffect(() => {
        if (callState.status !== 'active') {
            setCallSeconds(0)
            return
        }

        const startedAt = Date.now()
        const timer = window.setInterval(() => {
            setCallSeconds(Math.floor((Date.now() - startedAt) / 1000))
        }, 1000)

        return () => window.clearInterval(timer)
    }, [callState.status])

    useEffect(() => {
        if (callState.status !== 'requesting' || !callState.isInitiator || localStream) return
        prepareLocalMedia()
    }, [callState.status, callState.isInitiator, localStream, prepareLocalMedia])

    const handleFlipCamera = () => {
        if (!availableVideoDevices || availableVideoDevices.length < 2) return

        let currentIndex = availableVideoDevices.findIndex((device) => device.deviceId === selectedVideoDevice)
        if (currentIndex === -1) currentIndex = 0

        const nextIndex = (currentIndex + 1) % availableVideoDevices.length
        const nextDeviceId = availableVideoDevices[nextIndex].deviceId
        switchDevice('video', nextDeviceId)
    }

    const handleAccept = async () => {
        const success = await prepareLocalMedia()
        if (success) {
            onAccept()
        } else {
            onDecline()
        }
    }

    useEffect(() => {
        if (callState.status === 'active' && localStream && callState.isInitiator) {
            establishConnection(true)
        }
    }, [callState.status, localStream, callState.isInitiator, establishConnection])

    const submitReport = async ({ reason, details }) => {
        if (typeof onReport !== 'function' || !partner?.id) return
        setReportSubmitting(true)
        setReportStatus({ type: '', message: '' })
        try {
            await onReport({
                reportedId: partner.id,
                reason,
                details,
            })
            setReportStatus({ type: 'success', message: 'Report submitted. Our moderation queue has it now.' })
            window.setTimeout(() => {
                setShowReportModal(false)
                setReportStatus({ type: '', message: '' })
            }, 1400)
        } catch (error) {
            setReportStatus({
                type: 'error',
                message: error?.message || 'Could not send the report right now.',
            })
        } finally {
            setReportSubmitting(false)
        }
    }

    if (callState.status === 'idle') return null

    return (
        <div className={`call-overlay-fixed ${callState.status === 'active' ? 'active-mode' : ''}`}>
            <div className="call-overlay-content">
                {callState.status === 'incoming' && (
                    <div className="call-incoming-view">
                        <div className="call-partner-avatar large">
                            {getAvatarUrl(partner) ? (
                                <img src={getAvatarUrl(partner)} alt={partner?.name} />
                            ) : (
                                <span>{partner?.name?.[0]}</span>
                            )}
                        </div>
                        <h3>Incoming Video Call</h3>
                        <p>
                            {partner?.name}
                            {partner?.auraPoints !== undefined && (
                                <span
                                    className="partner-aura-badge"
                                    title={`Aura: ${calculateAuraLevel(partner.auraPoints).name}`}
                                    style={{ color: calculateAuraLevel(partner.auraPoints).color, fontSize: '0.8rem', marginLeft: '0.4rem' }}
                                >
                                    ✧
                                </span>
                            )}
                            is calling you...
                        </p>
                        <div className="call-actions">
                            <button className="call-btn accept" onClick={handleAccept}>Accept</button>
                            <button className="call-btn decline" onClick={onDecline}>Decline</button>
                        </div>
                    </div>
                )}

                {callState.status === 'requesting' && (
                    <div className="call-requesting-view">
                        <div className="call-partner-avatar large pulse">
                            {getAvatarUrl(partner) ? (
                                <img src={getAvatarUrl(partner)} alt={partner?.name} />
                            ) : (
                                <span>{partner?.name?.[0]}</span>
                            )}
                        </div>
                        <h3>Calling...</h3>
                        <p>
                            Waiting for {partner?.name}
                            {partner?.auraPoints !== undefined && (
                                <span
                                    className="partner-aura-badge"
                                    title={`Aura: ${calculateAuraLevel(partner.auraPoints).name}`}
                                    style={{ color: calculateAuraLevel(partner.auraPoints).color, fontSize: '0.8rem', marginLeft: '0.4rem' }}
                                >
                                    ✧
                                </span>
                            )}
                            to answer
                        </p>
                        <div className="call-actions">
                            <button className="call-btn decline" onClick={onEnd}>Cancel</button>
                        </div>
                    </div>
                )}

                {callState.status === 'active' && (
                    <div className="call-active-view">
                        <div className="call-topbar">
                            <div className="call-topbar-center">
                                <div className="call-timer-chip">{formatDuration(callSeconds)}</div>
                                <div className={`call-network-chip tone-${networkBadge.tone}`} title={networkBadge.detail}>
                                    <span className="call-network-dot" />
                                    <span>{networkBadge.label}</span>
                                </div>
                            </div>
                            <button className="call-report-trigger" onClick={() => setShowReportModal(true)}>
                                Report user
                            </button>
                        </div>

                        {shouldShowReconnectBanner && (
                            <div className="call-reconnect-banner">
                                <span className="call-reconnect-pulse" />
                                <span>{reconnectText}</span>
                            </div>
                        )}

                        <div className="call-video-grid">
                            <div className="call-video-tile remote">
                                {remoteStream ? (
                                    <video autoPlay playsInline ref={(element) => { if (element) element.srcObject = remoteStream }} />
                                ) : (
                                    <div className="call-video-placeholder">Connecting...</div>
                                )}
                                <div className="call-video-label">{partner?.name}</div>
                            </div>
                            <div className="call-video-tile local">
                                {localStream ? (
                                    <video autoPlay playsInline muted ref={(element) => { if (element) element.srcObject = localStream }} />
                                ) : (
                                    <div className="call-video-placeholder">Your Camera</div>
                                )}
                                <div className="call-video-label">You</div>
                            </div>
                        </div>

                        <div className="call-controls">
                            <button className={`ctrl-btn ${isMuted ? 'off' : ''}`} onClick={toggleMute} title="Toggle Audio">
                                {isMuted ? '🔇' : '🎤'}
                            </button>
                            <button className={`ctrl-btn ${isVideoOff ? 'off' : ''}`} onClick={toggleVideo} title="Toggle Video">
                                {isVideoOff ? '🚫' : '🎥'}
                            </button>

                            {availableVideoDevices?.length > 1 && (
                                <button className="ctrl-btn flip-btn" onClick={handleFlipCamera} title="Flip Camera">
                                    🔄
                                </button>
                            )}

                            <button
                                className={`ctrl-btn settings-btn ${showDeviceSettings ? 'active' : ''}`}
                                onClick={() => setShowDeviceSettings(!showDeviceSettings)}
                                title="Device Settings"
                            >
                                ⚙️
                            </button>

                            <button className="ctrl-btn end" onClick={() => { stopLocalMedia(); onEnd() }} title="End Call">
                                📞
                            </button>
                        </div>

                        {showDeviceSettings && (
                            <div className="device-settings-popover">
                                <h4>Device Settings</h4>
                                <div className="device-group">
                                    <label>Camera:</label>
                                    <select
                                        value={selectedVideoDevice || ''}
                                        onChange={(event) => switchDevice('video', event.target.value)}
                                        disabled={isVideoOff}
                                    >
                                        {availableVideoDevices.map((device, index) => (
                                            <option key={device.deviceId} value={device.deviceId}>
                                                {device.label || `Camera ${index + 1}`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="device-group">
                                    <label>Microphone:</label>
                                    <select
                                        value={selectedAudioDevice || ''}
                                        onChange={(event) => switchDevice('audio', event.target.value)}
                                        disabled={isMuted}
                                    >
                                        {availableAudioDevices.map((device, index) => (
                                            <option key={device.deviceId} value={device.deviceId}>
                                                {device.label || `Microphone ${index + 1}`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button className="close-settings" onClick={() => setShowDeviceSettings(false)}>Done</button>
                            </div>
                        )}

                        <div className="call-telemetry-strip" aria-live="polite">
                            <span>Setup: {callTelemetry.setupTimeMs ? `${callTelemetry.setupTimeMs}ms` : '—'}</span>
                            <span>RTT: {callTelemetry.avgRttMs ? `${callTelemetry.avgRttMs}ms` : '—'}</span>
                            <span>Loss: {callTelemetry.packetLossPct !== null ? `${callTelemetry.packetLossPct}%` : '—'}</span>
                            <span>Reconnects: {callTelemetry.reconnectCount}</span>
                            <span>Profile: {callTelemetry.qualityProfile || 'high'}</span>
                        </div>
                    </div>
                )}
            </div>

            {showReportModal && (
                <ReportModal
                    partnerName={partner?.name}
                    onClose={() => {
                        if (reportSubmitting) return
                        setShowReportModal(false)
                        setReportStatus({ type: '', message: '' })
                    }}
                    onSubmit={submitReport}
                    isSubmitting={reportSubmitting}
                    status={reportStatus}
                />
            )}
        </div>
    )
}
