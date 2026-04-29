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

const BRANDING = {
    logoSrc: '/logo.png',
    text: 'Muhdikhai Live',
    accent: '#f59e0b',
    textColor: '#ffffff',
}

function waitForVideoReady(video) {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            video.removeEventListener('loadedmetadata', handleLoaded)
            video.removeEventListener('error', handleError)
        }

        const handleLoaded = () => {
            cleanup()
            resolve()
        }

        const handleError = (event) => {
            cleanup()
            reject(event)
        }

        if (video.readyState >= 1) {
            resolve()
            return
        }

        video.addEventListener('loadedmetadata', handleLoaded, { once: true })
        video.addEventListener('error', handleError, { once: true })
    })
}

function loadBrandImage(src) {
    return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = src
    })
}

function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
}

function drawWatermark(ctx, canvas, logoImage) {
    const paddingX = Math.max(18, Math.round(canvas.width * 0.03))
    const paddingY = Math.max(18, Math.round(canvas.height * 0.04))
    const badgeWidth = Math.max(172, Math.round(canvas.width * 0.26))
    const badgeHeight = Math.max(42, Math.round(canvas.height * 0.095))
    const x = canvas.width - badgeWidth - paddingX
    const y = paddingY
    const radius = badgeHeight / 2
    const logoSize = Math.round(badgeHeight * 0.52)
    const textX = x + 18 + logoSize + 10
    const textY = y + (badgeHeight / 2) + 5

    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
    ctx.shadowBlur = 24
    ctx.shadowOffsetY = 8
    roundedRect(ctx, x, y, badgeWidth, badgeHeight, radius)
    ctx.fillStyle = 'rgba(6, 11, 24, 0.62)'
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'
    ctx.stroke()

    const accentWidth = 4
    roundedRect(ctx, x, y, accentWidth + 8, badgeHeight, radius)
    ctx.fillStyle = BRANDING.accent
    ctx.fill()

    if (logoImage) {
        ctx.drawImage(
            logoImage,
            x + 16,
            y + Math.round((badgeHeight - logoSize) / 2),
            logoSize,
            logoSize
        )
    }

    ctx.fillStyle = BRANDING.textColor
    ctx.font = `700 ${Math.max(14, Math.round(badgeHeight * 0.34))}px sans-serif`
    ctx.textBaseline = 'middle'
    ctx.fillText(BRANDING.text, textX, textY - 4)

    ctx.fillStyle = 'rgba(232, 240, 255, 0.78)'
    ctx.font = `500 ${Math.max(10, Math.round(badgeHeight * 0.22))}px sans-serif`
    ctx.fillText('Live Call', textX, textY + 10)
    ctx.restore()
}

function deriveConnectionBadge(callTelemetry) {
    const state = callTelemetry?.connectionState || 'new'
    const rtt = Number(callTelemetry?.avgRttMs)
    const loss = Number(callTelemetry?.packetLossPct)

    if (state === 'failed') {
        return { tone: 'down', label: 'Offline', detail: 'Signal path failed' }
    }
    if (state === 'disconnected' || state === 'connecting') {
        return { tone: 'warn', label: 'Reconnecting', detail: 'Recovering ICE path' }
    }
    if (state === 'connected') {
        const weak = (Number.isFinite(rtt) && rtt >= ADAPTIVE_THRESHOLDS.degradeRttMs)
            || (Number.isFinite(loss) && loss >= ADAPTIVE_THRESHOLDS.degradePacketLossPct)
        if (weak) {
            return { tone: 'warn', label: 'Weak', detail: 'High latency or packet loss' }
        }
        return { tone: 'good', label: 'HD', detail: 'Peer signal stable' }
    }
    return { tone: 'neutral', label: 'Syncing', detail: 'Negotiating media path' }
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
        connectionBadge: deriveConnectionBadge({ connectionState: 'new' }),
    })

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
    const rawLocalStreamRef = useRef(null)
    const watermarkedTrackRef = useRef(null)
    const watermarkArtifactsRef = useRef(null)
    const callStartedAtRef = useRef(null)
    const statsIntervalRef = useRef(null)
    const reconnectCountRef = useRef(0)
    const hasConnectedOnceRef = useRef(false)
    const qualityProfileRef = useRef('high')
    const lastQualitySwitchAtRef = useRef(0)

    useEffect(() => { socketRef.current = socket }, [socket])
    useEffect(() => { roomIdRef.current = roomId }, [roomId])
    useEffect(() => { recipientIdRef.current = recipientId }, [recipientId])
    useEffect(() => { localStreamRef.current = localStream }, [localStream])

    const emitTelemetry = useCallback((patch) => {
        setCallTelemetry((prev) => {
            const next = {
                ...prev,
                ...patch,
            }
            next.connectionBadge = deriveConnectionBadge(next)
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

    const enumerateDevices = useCallback(async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            const videoInputs = devices.filter((device) => device.kind === 'videoinput')
            const audioInputs = devices.filter((device) => device.kind === 'audioinput')

            setAvailableVideoDevices(videoInputs)
            setAvailableAudioDevices(audioInputs)

            if (!selectedVideoDevice && videoInputs.length > 0) {
                setSelectedVideoDevice(videoInputs[0].deviceId)
            }
            if (!selectedAudioDevice && audioInputs.length > 0) {
                setSelectedAudioDevice(audioInputs[0].deviceId)
            }
        } catch (err) {
            console.error('Error enumerating devices:', err)
        }
    }, [selectedAudioDevice, selectedVideoDevice])

    useEffect(() => {
        if (navigator.mediaDevices) {
            navigator.mediaDevices.addEventListener('devicechange', enumerateDevices)
            return () => {
                navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices)
            }
        }
    }, [enumerateDevices])

    const stopStatsPolling = useCallback(() => {
        if (statsIntervalRef.current) {
            clearInterval(statsIntervalRef.current)
            statsIntervalRef.current = null
        }
    }, [])

    const cleanupWatermarkPipeline = useCallback(() => {
        if (watermarkArtifactsRef.current?.cleanup) {
            watermarkArtifactsRef.current.cleanup()
        }
        watermarkArtifactsRef.current = null
        watermarkedTrackRef.current = null
    }, [])

    const createWatermarkedVideoTrack = useCallback(async (rawVideoTrack) => {
        if (!rawVideoTrack) {
            return { processedTrack: null, cleanup: () => {} }
        }

        const sourceStream = new MediaStream([rawVideoTrack])
        const sourceVideo = document.createElement('video')
        sourceVideo.autoplay = true
        sourceVideo.muted = true
        sourceVideo.playsInline = true
        sourceVideo.srcObject = sourceStream
        sourceVideo.setAttribute('playsinline', 'true')

        await waitForVideoReady(sourceVideo)
        await sourceVideo.play().catch(() => {})

        const rawSettings = rawVideoTrack.getSettings?.() || {}
        const profile = QUALITY_PROFILES[qualityProfileRef.current] || QUALITY_PROFILES.high
        const width = Math.max(320, Number(rawSettings.width) || profile.width)
        const height = Math.max(180, Number(rawSettings.height) || profile.height)
        const fps = Math.max(12, Math.min(profile.maxFramerate, Number(rawSettings.frameRate) || profile.maxFramerate))

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        const logoImage = await loadBrandImage(BRANDING.logoSrc)

        let rafId = 0
        const renderFrame = () => {
            if (!ctx) return
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height)
            drawWatermark(ctx, canvas, logoImage)
            rafId = window.requestAnimationFrame(renderFrame)
        }
        renderFrame()

        const brandedStream = canvas.captureStream(fps)
        const processedTrack = brandedStream.getVideoTracks()[0]
        processedTrack.enabled = rawVideoTrack.enabled

        const cleanup = () => {
            if (rafId) {
                window.cancelAnimationFrame(rafId)
            }
            brandedStream.getTracks().forEach((track) => track.stop())
            sourceVideo.pause()
            sourceVideo.srcObject = null
        }

        return { processedTrack, cleanup }
    }, [])

    const syncPreviewStream = useCallback((audioTrack, videoTrack) => {
        const nextTracks = []
        if (videoTrack) nextTracks.push(videoTrack)
        if (audioTrack) nextTracks.push(audioTrack)
        const previewStream = new MediaStream(nextTracks)
        setLocalStream(previewStream)
        localStreamRef.current = previewStream
        return previewStream
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
            } catch {
                // Browsers may reject unsupported params; ignore safely.
            }
        }))
    }, [])

    const applyTrackConstraintsForProfile = useCallback(async (profileKey = qualityProfileRef.current) => {
        const rawVideoTrack = rawLocalStreamRef.current?.getVideoTracks?.()[0]
        if (!rawVideoTrack || typeof rawVideoTrack.applyConstraints !== 'function') return

        const profile = QUALITY_PROFILES[profileKey] || QUALITY_PROFILES.high
        try {
            await rawVideoTrack.applyConstraints({
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
            } catch {
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

            const rawStream = await navigator.mediaDevices.getUserMedia(constraints)
            const rawAudioTrack = rawStream.getAudioTracks()[0] || null
            const rawVideoTrack = rawStream.getVideoTracks()[0] || null
            const { processedTrack, cleanup } = await createWatermarkedVideoTrack(rawVideoTrack)

            cleanupWatermarkPipeline()
            rawLocalStreamRef.current = rawStream
            watermarkArtifactsRef.current = { cleanup }
            watermarkedTrackRef.current = processedTrack

            if (rawVideoTrack && isVideoOff) rawVideoTrack.enabled = false
            if (processedTrack && isVideoOff) processedTrack.enabled = false
            if (rawAudioTrack && isMuted) rawAudioTrack.enabled = false

            syncPreviewStream(rawAudioTrack, processedTrack)
            await enumerateDevices()

            return true
        } catch (err) {
            console.error('Failed to get media devices:', err)
            alert('Could not access camera/microphone. Please check browser permissions.')
            return false
        }
    }, [cleanupWatermarkPipeline, createWatermarkedVideoTrack, enumerateDevices, isMuted, isVideoOff, selectedAudioDevice, selectedVideoDevice, syncPreviewStream])

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

            const isolatedStream = await navigator.mediaDevices.getUserMedia(constraints)
            const currentRawStream = rawLocalStreamRef.current
            const currentAudioTrack = kind === 'audio'
                ? isolatedStream.getAudioTracks()[0] || null
                : currentRawStream?.getAudioTracks?.()[0] || null
            const nextRawVideoTrack = kind === 'video'
                ? isolatedStream.getVideoTracks()[0] || null
                : currentRawStream?.getVideoTracks?.()[0] || null

            let nextPreviewVideoTrack = watermarkedTrackRef.current
            let nextWatermarkCleanup = watermarkArtifactsRef.current?.cleanup

            if (kind === 'video' && nextRawVideoTrack) {
                const watermark = await createWatermarkedVideoTrack(nextRawVideoTrack)
                nextPreviewVideoTrack = watermark.processedTrack
                nextWatermarkCleanup = watermark.cleanup

                if (isVideoOff) {
                    nextRawVideoTrack.enabled = false
                    if (nextPreviewVideoTrack) nextPreviewVideoTrack.enabled = false
                }
            }

            if (kind === 'audio' && currentAudioTrack && isMuted) {
                currentAudioTrack.enabled = false
            }

            const senderKind = kind === 'video' ? 'video' : 'audio'
            const senderTrack = kind === 'video' ? nextPreviewVideoTrack : currentAudioTrack
            const sender = pcRef.current?.getSenders().find((item) => item.track && item.track.kind === senderKind)
            if (sender && senderTrack) {
                await sender.replaceTrack(senderTrack)
                if (kind === 'video') {
                    await applySenderEncodingParams(pcRef.current)
                }
            }

            if (kind === 'video') {
                cleanupWatermarkPipeline()
                watermarkArtifactsRef.current = { cleanup: nextWatermarkCleanup }
                watermarkedTrackRef.current = nextPreviewVideoTrack
            }

            if (currentRawStream) {
                if (kind === 'video') {
                    const oldTrack = currentRawStream.getVideoTracks()[0]
                    if (oldTrack) oldTrack.stop()
                    if (nextRawVideoTrack) {
                        if (oldTrack) currentRawStream.removeTrack(oldTrack)
                        currentRawStream.addTrack(nextRawVideoTrack)
                    }
                } else {
                    const oldTrack = currentRawStream.getAudioTracks()[0]
                    if (oldTrack) oldTrack.stop()
                    if (currentAudioTrack) {
                        if (oldTrack) currentRawStream.removeTrack(oldTrack)
                        currentRawStream.addTrack(currentAudioTrack)
                    }
                }
            }

            syncPreviewStream(
                kind === 'audio' ? currentAudioTrack : currentRawStream?.getAudioTracks?.()[0] || null,
                kind === 'video' ? nextPreviewVideoTrack : watermarkedTrackRef.current
            )

            if (kind === 'video') setSelectedVideoDevice(deviceId)
            if (kind === 'audio') setSelectedAudioDevice(deviceId)

            return true
        } catch (err) {
            console.error(`Failed to switch ${kind} to ${deviceId}:`, err)
            return false
        }
    }, [applySenderEncodingParams, cleanupWatermarkPipeline, createWatermarkedVideoTrack, isMuted, isVideoOff, syncPreviewStream])

    const establishConnection = useCallback(async (isInitiator) => {
        const stream = localStreamRef.current
        if (!stream) {
            console.error('Cannot establish connection without local stream')
            return
        }

        let pc = pcRef.current
        if (!pc) {
            pc = createPC()
            stream.getTracks().forEach((track) => pc.addTrack(track, stream))
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
    }, [applySenderEncodingParams, createPC])

    const stopLocalMedia = useCallback(() => {
        stopStatsPolling()
        cleanupWatermarkPipeline()

        if (rawLocalStreamRef.current) {
            rawLocalStreamRef.current.getTracks().forEach((track) => track.stop())
            rawLocalStreamRef.current = null
        }

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => {
                if (track.readyState !== 'ended') track.stop()
            })
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
            connectionBadge: deriveConnectionBadge({ connectionState: 'new' }),
        })
    }, [cleanupWatermarkPipeline, stopStatsPolling])

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
    }, [socket, roomId, userId, establishConnection, recipientId])

    const toggleMute = () => {
        const nextMuted = !isMuted
        rawLocalStreamRef.current?.getAudioTracks().forEach((track) => {
            track.enabled = !nextMuted
        })
        setIsMuted(nextMuted)
    }

    const toggleVideo = () => {
        const nextVideoOff = !isVideoOff
        rawLocalStreamRef.current?.getVideoTracks().forEach((track) => {
            track.enabled = !nextVideoOff
        })
        localStreamRef.current?.getVideoTracks().forEach((track) => {
            track.enabled = !nextVideoOff
        })
        if (watermarkedTrackRef.current) {
            watermarkedTrackRef.current.enabled = !nextVideoOff
        }
        setIsVideoOff(nextVideoOff)
    }

    useEffect(() => {
        return () => {
            stopStatsPolling()
            cleanupWatermarkPipeline()
            rawLocalStreamRef.current?.getTracks().forEach((track) => track.stop())
            localStreamRef.current?.getTracks().forEach((track) => {
                if (track.readyState !== 'ended') track.stop()
            })
            pcRef.current?.close()
        }
    }, [cleanupWatermarkPipeline, stopStatsPolling])

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
        availableVideoDevices,
        availableAudioDevices,
        selectedVideoDevice,
        selectedAudioDevice,
        switchDevice,
        callTelemetry,
    }
}
