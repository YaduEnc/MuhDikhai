import { useState, useEffect } from 'react'
import { useWebRTC } from '../hooks/useWebRTC'
import { playIncomingDrop, playOutgoingTick } from '../utils/soundEngine'
import { calculateAuraLevel } from '../utils/aura'
import './CallOverlay.css'

export default function CallOverlay({
    socket,
    session,
    callState,
    partner,
    onAccept,
    onDecline,
    onEnd
}) {
    // callState = { status: 'requesting' | 'incoming' | 'active', type: 'random' | 'friend' }

    // For friend calls, we use recipientId. For random, we use roomId.
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
        switchDevice
    } = useWebRTC(socket, roomId, session?.user?.id, recipientId)

    const [showDeviceSettings, setShowDeviceSettings] = useState(false)

    // Helper: Flip Camera logic
    const handleFlipCamera = () => {
        if (!availableVideoDevices || availableVideoDevices.length < 2) return

        let currentIndex = availableVideoDevices.findIndex(d => d.deviceId === selectedVideoDevice)
        if (currentIndex === -1) currentIndex = 0

        const nextIndex = (currentIndex + 1) % availableVideoDevices.length
        const nextDeviceId = availableVideoDevices[nextIndex].deviceId

        switchDevice('video', nextDeviceId)
    }

    // Sync WebRTC with call status
    useEffect(() => {
        if (callState.status === 'requesting' && callState.isInitiator && !localStream) {
            prepareLocalMedia()
        }
    }, [callState.status, callState.isInitiator, localStream, prepareLocalMedia])

    // Special handler for acceptance
    const handleAccept = async () => {
        const success = await prepareLocalMedia()
        if (success) {
            onAccept()
        } else {
            onDecline()
        }
    }

    // Effect to handle P2P start when state becomes active
    useEffect(() => {
        if (callState.status === 'active' && localStream) {
            // If we are the initiator, we should start the offer
            // How do we know if we are the initiator?
            // Let's assume onInitiate was called.
            if (callState.isInitiator) {
                establishConnection(true)
            }
        }
    }, [callState.status, localStream, callState.isInitiator, establishConnection])

    if (callState.status === 'idle') return null

    return (
        <div className={`call-overlay-fixed ${callState.status === 'active' ? 'active-mode' : ''}`}>
            <div className="call-overlay-content">
                {callState.status === 'incoming' && (
                    <div className="call-incoming-view">
                        <div className="call-partner-avatar large">
                            {partner?.profilePictureUrl ? (
                                <img src={partner.profilePictureUrl} alt={partner.name} />
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
                            {partner?.profilePictureUrl ? (
                                <img src={partner.profilePictureUrl} alt={partner.name} />
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
                        <div className="video-grid">
                            <div className="video-tile remote">
                                {remoteStream ? (
                                    <video autoPlay playsInline ref={el => { if (el) el.srcObject = remoteStream }} />
                                ) : (
                                    <div className="video-placeholder">Connecting...</div>
                                )}
                                <div className="tile-label">{partner?.name}</div>
                            </div>
                            <div className="video-tile local">
                                {localStream ? (
                                    <video autoPlay playsInline muted ref={el => { if (el) el.srcObject = localStream }} />
                                ) : (
                                    <div className="video-placeholder">Your Camera</div>
                                )}
                                <div className="tile-label">You</div>
                            </div>
                        </div>

                        <div className="call-controls">
                            <button className={`ctrl-btn ${isMuted ? 'off' : ''}`} onClick={toggleMute} title="Toggle Audio">
                                {isMuted ? '🔇' : '🎤'}
                            </button>
                            <button className={`ctrl-btn ${isVideoOff ? 'off' : ''}`} onClick={toggleVideo} title="Toggle Video">
                                {isVideoOff ? '' : '🎥'}
                            </button>

                            {/* Flip Camera Button (Only shows if >1 camera exists) */}
                            {availableVideoDevices?.length > 1 && (
                                <button className="ctrl-btn flip-btn" onClick={handleFlipCamera} title="Flip Camera">
                                    🔄
                                </button>
                            )}

                            {/* Device Settings Button */}
                            <button
                                className={`ctrl-btn settings-btn ${showDeviceSettings ? 'active' : ''}`}
                                onClick={() => setShowDeviceSettings(!showDeviceSettings)}
                                title="Device Settings"
                            >
                                ⚙️
                            </button>

                            <button className="ctrl-btn end" onClick={() => { stopLocalMedia(); onEnd(); }} title="End Call">
                                📞
                            </button>
                        </div>

                        {/* Settings Popover */}
                        {showDeviceSettings && (
                            <div className="device-settings-popover">
                                <h4>Device Settings</h4>
                                <div className="device-group">
                                    <label>Camera:</label>
                                    <select
                                        value={selectedVideoDevice || ''}
                                        onChange={(e) => switchDevice('video', e.target.value)}
                                        disabled={isVideoOff}
                                    >
                                        {availableVideoDevices.map(device => (
                                            <option key={device.deviceId} value={device.deviceId}>
                                                {device.label || `Camera ${availableVideoDevices.indexOf(device) + 1}`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="device-group">
                                    <label>Microphone:</label>
                                    <select
                                        value={selectedAudioDevice || ''}
                                        onChange={(e) => switchDevice('audio', e.target.value)}
                                        disabled={isMuted}
                                    >
                                        {availableAudioDevices.map(device => (
                                            <option key={device.deviceId} value={device.deviceId}>
                                                {device.label || `Microphone ${availableAudioDevices.indexOf(device) + 1}`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button className="close-settings" onClick={() => setShowDeviceSettings(false)}>Done</button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
