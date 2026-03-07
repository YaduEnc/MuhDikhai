import { useState, useEffect, useRef, useCallback } from 'react'

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
}

export function useGroupWebRTC(socket, partyId, currentUserId, members) {
    const [localStream, setLocalStream] = useState(null)
    const [remoteStreams, setRemoteStreams] = useState({}) // { userId: MediaStream }
    const [isMuted, setIsMuted] = useState(false)

    const peersRef = useRef({}) // { userId: RTCPeerConnection }
    const localStreamRef = useRef(null)

    // Setup local audio
    useEffect(() => {
        let isSetup = true;
        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
            .then(stream => {
                if (!isSetup) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }
                setLocalStream(stream)
                localStreamRef.current = stream
            })
            .catch(err => console.error("Could not get microphone:", err))

        return () => {
            isSetup = false;
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(t => t.stop())
            }
        }
    }, [])

    const toggleMute = useCallback(() => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0]
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled
                setIsMuted(!audioTrack.enabled)
            }
        }
    }, [])

    const createPeer = useCallback((targetUserId, initiator) => {
        const pc = new RTCPeerConnection(ICE_SERVERS)

        // Add local tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current)
            })
        }

        pc.onicecandidate = (event) => {
            if (event.candidate && socket) {
                socket.emit('party:audio:signal', {
                    partyId,
                    targetUserId,
                    signal: { type: 'candidate', candidate: event.candidate }
                })
            }
        }

        pc.ontrack = (event) => {
            setRemoteStreams(prev => ({
                ...prev,
                [targetUserId]: event.streams[0]
            }))
        }

        if (initiator) {
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .then(() => {
                    if (socket) {
                        socket.emit('party:audio:signal', {
                            partyId,
                            targetUserId,
                            signal: pc.localDescription
                        })
                    }
                })
                .catch(err => console.error("Error creating offer:", err))
        }

        return pc
    }, [socket, partyId])

    // Handle new members
    useEffect(() => {
        if (!members || !currentUserId || !localStreamRef.current) return;

        members.forEach(member => {
            if (member.id === currentUserId) return; // Don't connect to self

            if (!peersRef.current[member.id]) {
                // Determine who initiates the connection to avoid glare
                // Lexicographical string comparison
                const isInitiator = currentUserId > member.id;
                peersRef.current[member.id] = createPeer(member.id, isInitiator);
            }
        });

        // Cleanup dropped members
        Object.keys(peersRef.current).forEach(peerId => {
            if (!members.find(m => m.id === peerId)) {
                peersRef.current[peerId].close();
                delete peersRef.current[peerId];
                setRemoteStreams(prev => {
                    const next = { ...prev };
                    delete next[peerId];
                    return next;
                });
            }
        });

    }, [members, currentUserId, createPeer, localStream]) // React to localStream being ready

    // Listen for WebRTC signals
    useEffect(() => {
        if (!socket) return

        const handleSignal = async (data) => {
            const { fromUserId, signal } = data
            if (!peersRef.current[fromUserId]) {
                // We shouldn't get answers before offering, but we could get offers
                peersRef.current[fromUserId] = createPeer(fromUserId, false)
            }

            const pc = peersRef.current[fromUserId]

            try {
                if (signal.type === 'offer') {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal))
                    const answer = await pc.createAnswer()
                    await pc.setLocalDescription(answer)
                    socket.emit('party:audio:signal', {
                        partyId,
                        targetUserId: fromUserId,
                        signal: pc.localDescription
                    })
                } else if (signal.type === 'answer') {
                    if (pc.signalingState !== 'stable') {
                        await pc.setRemoteDescription(new RTCSessionDescription(signal))
                    }
                } else if (signal.type === 'candidate') {
                    await pc.addIceCandidate(new RTCIceCandidate(signal.candidate))
                }
            } catch (err) {
                console.error("Signaling error:", err)
            }
        }

        socket.on('party:audio:signal', handleSignal)

        return () => {
            socket.off('party:audio:signal', handleSignal)
        }
    }, [socket, partyId, createPeer])

    // Cleanup all peers on unmount
    useEffect(() => {
        return () => {
            Object.values(peersRef.current).forEach(pc => pc.close())
            peersRef.current = {}
            setRemoteStreams({})
        }
    }, [])

    return { localStream, remoteStreams, isMuted, toggleMute }
}
