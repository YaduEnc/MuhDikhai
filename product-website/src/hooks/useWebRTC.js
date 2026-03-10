import { useState, useEffect, useRef, useCallback } from 'react'

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
}

export function useWebRTC(socket, roomId, userId, recipientId) {
    const [localStream, setLocalStream] = useState(null)
    const [remoteStream, setRemoteStream] = useState(null)
    const [isMuted, setIsMuted] = useState(false)
    const [isVideoOff, setIsVideoOff] = useState(false)

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

    // Keep refs in sync
    useEffect(() => { socketRef.current = socket }, [socket])
    useEffect(() => { roomIdRef.current = roomId }, [roomId])
    useEffect(() => { recipientIdRef.current = recipientId }, [recipientId])
    useEffect(() => { localStreamRef.current = localStream }, [localStream])

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
    const createPC = useCallback(() => {
        const pc = new RTCPeerConnection(ICE_SERVERS)

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

        pcRef.current = pc
        return pc
    }, [])

    // ─── Start Media & Call ──────────────────────────────────────────────────
    const prepareLocalMedia = useCallback(async () => {
        if (localStreamRef.current) return true

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Your browser does not support video calls, or you are not using a secure (HTTPS) connection.')
            return false
        }

        try {
            const constraints = {
                video: selectedVideoDevice
                    ? { deviceId: { exact: selectedVideoDevice }, width: 640, height: 480 }
                    : { width: 640, height: 480, facingMode: 'user' },
                audio: selectedAudioDevice
                    ? { deviceId: { exact: selectedAudioDevice } }
                    : true
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
                video: kind === 'video' ? { deviceId: { exact: deviceId }, width: 640, height: 480 } : false,
                audio: kind === 'audio' ? { deviceId: { exact: deviceId } } : false
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
    }, [isVideoOff, isMuted])

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
    }, [createPC])

    const stopLocalMedia = useCallback(() => {
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
    }, [])

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
            localStreamRef.current?.getTracks().forEach(track => track.stop())
            pcRef.current?.close()
        }
    }, [])

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
        switchDevice
    }
}
