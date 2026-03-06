import { useState, useEffect, useRef, useCallback } from 'react'

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
}

export function useWebRTC(socket, roomId, userId) {
    const [localStream, setLocalStream] = useState(null)
    const [remoteStream, setRemoteStream] = useState(null)
    const [isMuted, setIsMuted] = useState(false)
    const [isVideoOff, setIsVideoOff] = useState(false)

    const pcRef = useRef(null)
    const pendingCandidates = useRef([])
    const socketRef = useRef(socket)
    const roomIdRef = useRef(roomId)
    const localStreamRef = useRef(localStream)

    // Keep refs in sync
    useEffect(() => { socketRef.current = socket }, [socket])
    useEffect(() => { roomIdRef.current = roomId }, [roomId])
    useEffect(() => { localStreamRef.current = localStream }, [localStream])

    // ─── Initialize PeerConnection ───────────────────────────────────────────
    const createPC = useCallback(() => {
        const pc = new RTCPeerConnection(ICE_SERVERS)

        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current) {
                socketRef.current.emit('webrtc:signal', {
                    roomId: roomIdRef.current,
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
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' },
                audio: true
            })
            setLocalStream(stream)
            localStreamRef.current = stream
            return true
        } catch (err) {
            console.error('Failed to get media devices:', err)
            alert('Could not access camera/microphone. Please check browser permissions.')
            return false
        }
    }, [])

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
            socketRef.current.emit('webrtc:signal', { roomId: roomIdRef.current, signal: offer })
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
        if (!socket || !roomId) return

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
                    socket.emit('webrtc:signal', { roomId, signal: answer })

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
        stopLocalMedia
    }
}
