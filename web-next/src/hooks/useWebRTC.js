import { useState, useEffect, useRef, useCallback } from 'react'

const STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
]

const TURN_URL = process.env.NEXT_PUBLIC_TURN_URL
const TURN_USERNAME = process.env.NEXT_PUBLIC_TURN_USERNAME
const TURN_PASSWORD = process.env.NEXT_PUBLIC_TURN_PASSWORD

const ICE_SERVERS = [
    ...STUN_SERVERS,
    ...(TURN_URL && TURN_USERNAME && TURN_PASSWORD
        ? [{ urls: TURN_URL, username: TURN_USERNAME, credential: TURN_PASSWORD }]
        : []
    ),
]

const ICE_CONFIGURATION = {
    iceServers: ICE_SERVERS,
    iceTransportPolicy: 'all',
}

const VIDEO_CONSTRAINTS = {
    width: { ideal: 640, max: 960 },
    height: { ideal: 360, max: 540 },
    frameRate: { ideal: 24, max: 30 },
}

const QUALITY_PROFILES = {
    high: {
        maxBitrate: 450_000,
        maxFramerate: 24,
        width: 640,
        height: 360,
    },
    medium: {
        maxBitrate: 320_000,
        maxFramerate: 20,
        width: 480,
        height: 270,
    },
    low: {
        maxBitrate: 180_000,
        maxFramerate: 15,
        width: 320,
        height: 180,
    },
}

const ADAPTIVE_THRESHOLDS = {
    severeRttMs: 600,
    severePacketLossPct: 12,
    degradeRttMs: 350,
    degradePacketLossPct: 5,
    recoverRttMs: 220,
    recoverPacketLossPct: 2,
    cooldownMs: 12_000,
}

export function useWebRTC(socket, roomId, userId, recipientId) {
    const [localStream, setLocalStream] = useState(null)
    const [remoteStream, setRemoteStream] = useState(null)
    const [isMuted, setIsMuted] = useState(false)
    const [isVideoOff, setIsVideoOff] = useState(false)
    const [callTelemetry, setCallTelemetry] = useState({
        setupTimeMs: null,
        avgRttMs: null,
        packetLossPct: null,
        reconnectCount: 0,
        connectionState: 'new',
        qualityProfile: 'high',
    })

    // Device Management
    const [availableVideoDevices, setAvailableVideoDevices] = useState([])
    const [availableAudioDevices, setAvailableAudioDevices] = useState([])
    const [selectedVideoDevice, setSelectedVideoDevice] = useState(null)
    const [selectedAudioDevice, setSelectedAudioDevice] = useState(null)

    const pcRef = useRef(null)
    const pendingCandidates = useRef([])
    const socketRef = useRef(socket)
    const roomIdRef = useRef(roomId)
    const recipientIdRef = useRef(recipientId)
    const localStreamRef = useRef(localStream)
    const callStartedAtRef = useRef(null)
    const statsIntervalRef = useRef(null)
    const reconnectCountRef = useRef(0)
    const hasConnectedOnceRef = useRef(false)
    const qualityProfileRef = useRef('high')
    const lastQualitySwitchAtRef = useRef(0)

    // Keep refs in sync
    useEffect(() => { socketRef.current = socket }, [socket])
    useEffect(() => { roomIdRef.current = roomId }, [roomId])
    useEffect(() => { recipientIdRef.current = recipientId }, [recipientId])
    useEffect(() => { localStreamRef.current = localStream }, [localStream])

    const emitTelemetry = useCallback((patch) => {
        setCallTelemetry((prev) => {
            const next = { ...prev, ...patch }
            if (socketRef.current) {
                socketRef.current.emit('webrtc:telemetry', {
                    roomId: roomIdRef.current,
                    recipientId: recipientIdRef.current,
                    metrics: next,
                    at: new Date().toISOString(),
                })
            }
            return next
        })
    }, [])

    // ─── Device Enumeration ─────────────────────────────────────────────────
    const enumerateDevices = useCallback(async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            const videoInputs = devices.filter(device => device.kind === 'videoinput')
            const audioInputs = devices.filter(device => device.kind === 'audioinput')

            setAvailableVideoDevices(videoInputs)
            setAvailableAudioDevices(audioInputs)

            // Auto-select first devices if none currently selected
            if (!selectedVideoDevice && videoInputs.length > 0) {
                // Try to find physical hardware over virtual if possible, but default to first.
                setSelectedVideoDevice(videoInputs[0].deviceId)
            }
            if (!selectedAudioDevice && audioInputs.length > 0) {
                setSelectedAudioDevice(audioInputs[0].deviceId)
            }
        } catch (err) {
            console.error('Error enumerating devices:', err)
        }
    }, [selectedVideoDevice, selectedAudioDevice])

    // Listen for device changes (e.g. plugging in a mic)
    useEffect(() => {
        if (navigator.mediaDevices) {
            navigator.mediaDevices.addEventListener('devicechange', enumerateDevices)
            return () => {
                navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices)
            }
        }
    }, [enumerateDevices])

    // ─── Initialize PeerConnection ───────────────────────────────────────────
    const stopStatsPolling = useCallback(() => {
        if (statsIntervalRef.current) {
            clearInterval(statsIntervalRef.current)
            statsIntervalRef.current = null
        }
    }, [])

    const applySenderEncodingParams = useCallback(async (pc, profileKey = qualityProfileRef.current) => {
        const profile = QUALITY_PROFILES[profileKey] || QUALITY_PROFILES.high
        const senders = pc.getSenders().filter((sender) => sender.track && sender.track.kind === 'video')
        await Promise.all(senders.map(async (sender) => {
            try {
                const params = sender.getParameters()
                params.encodings = params.encodings && params.encodings.length > 0 ? params.encodings : [{}]
                params.encodings[0].maxBitrate = profile.maxBitrate
                params.encodings[0].maxFramerate = profile.maxFramerate
                await sender.setParameters(params)
            } catch (error) {
                // Browsers may reject unsupported params; ignore safely.
            }
        }))
    }, [])

    const applyTrackConstraintsForProfile = useCallback(async (profileKey = qualityProfileRef.current) => {
        const localVideoTrack = localStreamRef.current?.getVideoTracks?.()[0]
        if (!localVideoTrack || typeof localVideoTrack.applyConstraints !== 'function') return

        const profile = QUALITY_PROFILES[profileKey] || QUALITY_PROFILES.high
        try {
            await localVideoTrack.applyConstraints({
                width: { ideal: profile.width, max: profile.width },
                height: { ideal: profile.height, max: profile.height },
                frameRate: { ideal: profile.maxFramerate, max: profile.maxFramerate },
            })
        } catch {
            // Best-effort only; unsupported constraints should not break calls.
        }
    }, [])

    const maybeAdaptQuality = useCallback(async (pc, rttMs, packetLossPct) => {
        const now = Date.now()
        if (now - lastQualitySwitchAtRef.current < ADAPTIVE_THRESHOLDS.cooldownMs) return

        const current = qualityProfileRef.current
        let target = current

        const severe = (rttMs !== null && rttMs >= ADAPTIVE_THRESHOLDS.severeRttMs)
            || (packetLossPct !== null && packetLossPct >= ADAPTIVE_THRESHOLDS.severePacketLossPct)
        const degraded = (rttMs !== null && rttMs >= ADAPTIVE_THRESHOLDS.degradeRttMs)
            || (packetLossPct !== null && packetLossPct >= ADAPTIVE_THRESHOLDS.degradePacketLossPct)
        const healthy = (rttMs !== null && rttMs <= ADAPTIVE_THRESHOLDS.recoverRttMs)
            && (packetLossPct !== null && packetLossPct <= ADAPTIVE_THRESHOLDS.recoverPacketLossPct)

        if (severe) {
            target = 'low'
        } else if (degraded) {
            target = current === 'high' ? 'medium' : 'low'
        } else if (healthy) {
            target = current === 'low' ? 'medium' : 'high'
        }

        if (target === current) return

        qualityProfileRef.current = target
        lastQualitySwitchAtRef.current = now
        await applySenderEncodingParams(pc, target)
        await applyTrackConstraintsForProfile(target)
        emitTelemetry({ qualityProfile: target })

        // Renegotiate on quality profile shifts so both peers settle on the new envelope.
        if (pc.signalingState === 'stable' && socketRef.current) {
            try {
                const offer = await pc.createOffer()
                await pc.setLocalDescription(offer)
                socketRef.current.emit('webrtc:signal', {
                    roomId: roomIdRef.current,
                    recipientId: recipientIdRef.current,
                    signal: offer,
                })
            } catch {
                // ignore renegotiation errors; polling loop will try again on future shifts
            }
        }
    }, [applySenderEncodingParams, applyTrackConstraintsForProfile, emitTelemetry])

    const startStatsPolling = useCallback((pc) => {
        stopStatsPolling()
        statsIntervalRef.current = setInterval(async () => {
            try {
                const stats = await pc.getStats()
                let rttMs = null
                let packetsLost = null
                let packetsReceived = null

                stats.forEach((report) => {
                    if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.currentRoundTripTime) {
                        rttMs = Math.round(report.currentRoundTripTime * 1000)
                    }
                    if (report.type === 'inbound-rtp' && report.kind === 'video') {
                        packetsLost = Number(report.packetsLost || 0)
                        packetsReceived = Number(report.packetsReceived || 0)
                    }
                })

                const total = (packetsLost || 0) + (packetsReceived || 0)
                const packetLossPct = total > 0 ? Number((((packetsLost || 0) / total) * 100).toFixed(2)) : null

                emitTelemetry({
                    avgRttMs: rttMs,
                    packetLossPct,
                })
                await maybeAdaptQuality(pc, rttMs, packetLossPct)
            } catch (error) {
                // ignore periodic stats errors
            }
        }, 5000)
    }, [emitTelemetry, maybeAdaptQuality, stopStatsPolling])

    const createPC = useCallback(() => {
        const pc = new RTCPeerConnection(ICE_CONFIGURATION)

        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current) {
                socketRef.current.emit('webrtc:signal', {
                    roomId: roomIdRef.current,
                    recipientId: recipientIdRef.current,
                    signal: { type: 'candidate', candidate: event.candidate }
                })
            }
        }

        pc.ontrack = (event) => {
            setRemoteStream(event.streams[0])
        }

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState
            emitTelemetry({ connectionState: state })

            if (state === 'connected') {
                if (!hasConnectedOnceRef.current) {
                    hasConnectedOnceRef.current = true
                    const startedAt = callStartedAtRef.current
                    if (startedAt) {
                        emitTelemetry({ setupTimeMs: Date.now() - startedAt })
                    }
                }
                startStatsPolling(pc)
            } else if (state === 'disconnected' || state === 'failed') {
                reconnectCountRef.current += 1
                emitTelemetry({ reconnectCount: reconnectCountRef.current })
            } else if (state === 'closed') {
                stopStatsPolling()
            }
        }

        pcRef.current = pc
        return pc
    }, [emitTelemetry, startStatsPolling, stopStatsPolling])

    // ─── Start Media & Call ──────────────────────────────────────────────────
    const prepareLocalMedia = useCallback(async () => {
        if (localStreamRef.current) return true
        if (!callStartedAtRef.current) callStartedAtRef.current = Date.now()

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Your browser does not support video calls, or you are not using a secure (HTTPS) connection.')
            return false
        }

        try {
            const constraints = {
                video: selectedVideoDevice
                    ? { deviceId: { exact: selectedVideoDevice }, ...VIDEO_CONSTRAINTS }
                    : { ...VIDEO_CONSTRAINTS, facingMode: 'user' },
                audio: selectedAudioDevice
                    ? {
                        deviceId: { exact: selectedAudioDevice },
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    }
                    : {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    }
            }

            const stream = await navigator.mediaDevices.getUserMedia(constraints)

            // Maintain current mute/video toggled states when re-requesting stream
            if (isVideoOff) stream.getVideoTracks().forEach(t => t.enabled = false)
            if (isMuted) stream.getAudioTracks().forEach(t => t.enabled = false)

            setLocalStream(stream)
            localStreamRef.current = stream

            // Crucial: Enumerate *after* getting first stream so labels are exposed
            await enumerateDevices()

            return true
        } catch (err) {
            console.error('Failed to get media devices:', err)
            alert('Could not access camera/microphone. Please check browser permissions.')
            return false
        }
    }, [selectedVideoDevice, selectedAudioDevice, isVideoOff, isMuted, enumerateDevices])

    // ─── Hot Swap Devices ────────────────────────────────────────────────────
    const switchDevice = useCallback(async (kind, deviceId) => {
        if (!deviceId || !localStreamRef.current) return false

        try {
            const constraints = {
                video: kind === 'video' ? { deviceId: { exact: deviceId }, ...VIDEO_CONSTRAINTS } : false,
                audio: kind === 'audio'
                    ? {
                        deviceId: { exact: deviceId },
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    }
                    : false
            }

            // Grab the specific isolated stream for the new hardware
            const newStream = await navigator.mediaDevices.getUserMedia(constraints)
            const newTrack = kind === 'video' ? newStream.getVideoTracks()[0] : newStream.getAudioTracks()[0]

            // Apply current muted/video disabled state to new track
            if (kind === 'video' && isVideoOff) newTrack.enabled = false
            if (kind === 'audio' && isMuted) newTrack.enabled = false

            // Replace track on the live RTCPeerConnection sender without tearing down connection
            const sender = pcRef.current?.getSenders().find(s => s.track && s.track.kind === (kind === 'video' ? 'video' : 'audio'))
            if (sender) {
                await sender.replaceTrack(newTrack)
                await applySenderEncodingParams(pcRef.current)
            }

            // 1. Remove old track from our local stream
            const oldTrack = localStreamRef.current.getTracks().find(t => t.kind === (kind === 'video' ? 'video' : 'audio'))
            if (oldTrack) {
                localStreamRef.current.removeTrack(oldTrack)
                oldTrack.stop() // Turn off hardware light for old camera
            }

            // 2. Add new track to our local stream for local preview
            localStreamRef.current.addTrack(newTrack)

            // Update React state explicitly to trigger a re-render of `<video>` preview if necessary
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()))

            // Update selected states
            if (kind === 'video') setSelectedVideoDevice(deviceId)
            if (kind === 'audio') setSelectedAudioDevice(deviceId)

            return true
        } catch (err) {
            console.error(`Failed to switch ${kind} to ${deviceId}:`, err)
            return false
        }
    }, [isVideoOff, isMuted, applySenderEncodingParams])

    const establishConnection = useCallback(async (isInitiator) => {
        const stream = localStreamRef.current
        if (!stream) {
            console.error("Cannot establish connection without local stream")
            return
        }

        let pc = pcRef.current
        if (!pc) {
            pc = createPC()
            stream.getTracks().forEach(track => pc.addTrack(track, stream))
            await applySenderEncodingParams(pc)
        }

        if (isInitiator && socketRef.current) {
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            socketRef.current.emit('webrtc:signal', {
                roomId: roomIdRef.current,
                recipientId: recipientIdRef.current,
                signal: offer
            })
        }
    }, [createPC, applySenderEncodingParams])

    const stopLocalMedia = useCallback(() => {
        stopStatsPolling()
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop())
            setLocalStream(null)
            localStreamRef.current = null
        }
        if (pcRef.current) {
            pcRef.current.close()
            pcRef.current = null
        }
        setRemoteStream(null)
        pendingCandidates.current = []
        hasConnectedOnceRef.current = false
        reconnectCountRef.current = 0
        callStartedAtRef.current = null
        qualityProfileRef.current = 'high'
        lastQualitySwitchAtRef.current = 0
        setCallTelemetry({
            setupTimeMs: null,
            avgRttMs: null,
            packetLossPct: null,
            reconnectCount: 0,
            connectionState: 'new',
            qualityProfile: 'high',
        })
    }, [stopStatsPolling])

    // ─── Handle Signaling ────────────────────────────────────────────────────
    useEffect(() => {
        if (!socket || (!roomId && !recipientId)) return

        const handleSignal = async (data) => {
            if (data.fromUserId === userId) return

            let pc = pcRef.current
            if (!pc && data.signal.type === 'offer') {
                await establishConnection(false)
                pc = pcRef.current
            }

            if (!pc) return

            try {
                if (data.signal.type === 'offer') {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.signal))
                    const answer = await pc.createAnswer()
                    await pc.setLocalDescription(answer)
                    socket.emit('webrtc:signal', {
                        roomId,
                        recipientId,
                        signal: answer
                    })

                    while (pendingCandidates.current.length) {
                        await pc.addIceCandidate(pendingCandidates.current.shift())
                    }
                } else if (data.signal.type === 'answer') {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.signal))
                } else if (data.signal.type === 'candidate') {
                    const candidate = new RTCIceCandidate(data.signal.candidate)
                    if (pc.remoteDescription) {
                        await pc.addIceCandidate(candidate)
                    } else {
                        pendingCandidates.current.push(candidate)
                    }
                }
            } catch (err) {
                console.error('WebRTC Signaling Error:', err)
            }
        }
        socket.on('webrtc:signal', handleSignal)

        return () => {
            socket.off('webrtc:signal', handleSignal)
        }
    }, [socket, roomId, userId, establishConnection])

    // ─── Controls ────────────────────────────────────────────────────────────
    const toggleMute = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => (track.enabled = isMuted))
            setIsMuted(!isMuted)
        }
    }

    const toggleVideo = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach(track => (track.enabled = isVideoOff))
            setIsVideoOff(!isVideoOff)
        }
    }

    // Cleanup
    useEffect(() => {
        return () => {
            stopStatsPolling()
            localStreamRef.current?.getTracks().forEach(track => track.stop())
            pcRef.current?.close()
        }
    }, [stopStatsPolling])

    return {
        localStream,
        remoteStream,
        isMuted,
        isVideoOff,
        toggleMute,
        toggleVideo,
        prepareLocalMedia,
        establishConnection,
        stopLocalMedia,
        // New Device exports
        availableVideoDevices,
        availableAudioDevices,
        selectedVideoDevice,
        selectedAudioDevice,
        switchDevice,
        callTelemetry,
    }
}
