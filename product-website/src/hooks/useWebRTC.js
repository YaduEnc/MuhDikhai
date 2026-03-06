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

    // ─── Initialize PeerConnection ───────────────────────────────────────────
    const createPC = useCallback(() => {
        const pc = new RTCPeerConnection(ICE_SERVERS)

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('webrtc:signal', {
                    roomId,
                    signal: { type: 'candidate', candidate: event.candidate }
                })
            }
        }

        pc.ontrack = (event) => {
            setRemoteStream(event.streams[0])
        }

        pcRef.current = pc
        return pc
    }, [socket, roomId])

    // ─── Start Media & Call ──────────────────────────────────────────────────
    const prepareLocalMedia = useCallback(async () => {
        if (localStream) return true

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
            return true
        } catch (err) {
            console.error('Failed to get media devices:', err)
            alert('Could not access camera/microphone. Please check browser permissions.')
            return false
        }
    }, [localStream])

    const establishConnection = useCallback(async (isInitiator) => {
        if (!localStream) {
            console.error("Cannot establish connection without local stream")
            return
        }

        let pc = pcRef.current
        if (!pc) {
            pc = createPC()
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream))
        }

        if (isInitiator) {
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            socket.emit('webrtc:signal', { roomId, signal: offer })
        }
    }, [localStream, createPC, socket, roomId])

    const stopLocalMedia = useCallback(() => {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop())
            setLocalStream(null)
        }
        if (pcRef.current) {
            pcRef.current.close()
            pcRef.current = null
        }
        setRemoteStream(null)
        pendingCandidates.current = []
    }, [localStream])

    // ─── Handle Signaling ────────────────────────────────────────────────────
    useEffect(() => {
        if (!socket || !roomId) return

        const handleSignal = async (data) => {
            if (data.fromUserId === userId) return

            let pc = pcRef.current
            if (!pc && data.signal.type === 'offer') {
                // If we get an offer but don't have a PC, create one (we should have local media already if we accepted)
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

                    // Add any pending candidates
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
        if (localStream) {
            localStream.getAudioTracks().forEach(track => (track.enabled = isMuted))
            setIsMuted(!isMuted)
        }
    }

    const toggleVideo = () => {
        if (localStream) {
            localStream.getVideoTracks().forEach(track => (track.enabled = isVideoOff))
            setIsVideoOff(!isVideoOff)
        }
    }
    // Cleanup
    useEffect(() => {
        return () => {
            localStream?.getTracks().forEach(track => track.stop())
            pcRef.current?.close()
        }
    }, [localStream])

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
