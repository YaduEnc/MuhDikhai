/**
 * Web Audio API Sound Engine
 * Synthesizes organic, "glassmorphic" sounds in real-time.
 */

let audioCtx = null;
let isSoundEnabled = true;
let incomingRingtoneInterval = null;

// Initialize sound preferences from localStorage
try {
    if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem('pw_soundEnabled');
        if (stored !== null) {
            isSoundEnabled = stored === 'true';
        }
    }
} catch (e) {
    // no-op in non-browser render contexts
}

/**
 * Browsers require a user gesture to start the AudioContext.
 * Call this function on the first click (e.g., clicking "Start Match").
 */
export function initAudio() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

export function toggleSound(enabled) {
    isSoundEnabled = enabled;
    if (!enabled) {
        stopIncomingCallRingtone();
    }
    try {
        localStorage.setItem('pw_soundEnabled', enabled.toString());
    } catch (e) {
        // ignore
    }
}

export function getSoundEnabled() {
    return isSoundEnabled;
}

/**
 * Plays a deep, organic "thump" (like a gentle heartbeat).
 * Used when a match is successfully found.
 */
export function playMatchThump() {
    if (!isSoundEnabled || !audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    // Low frequency sine wave for the deep thump
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, now);
    // Sweet spot frequency drop for the "heartbeat" feel
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);

    // Volume envelope: quick attack, slow decay
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.8, now + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 1);
}

/**
 * Plays a bright, delicate "glass tap" or "water drop".
 * Used when an incoming message is received.
 */
export function playIncomingDrop() {
    if (!isSoundEnabled || !audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    // High frequency sine for brightness
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);

    // Quick bandpass filter sweep
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1000, now);
    filter.frequency.exponentialRampToValueAtTime(400, now + 0.1);

    // Very fast attack and decay
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
}

/**
 * Plays a deeply muffled, extremely subtle "tick".
 * Used for tactile feedback when the user sends a message.
 */
export function playOutgoingTick() {
    if (!isSoundEnabled || !audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    // Mid-low sine
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);

    // Extremely short blip
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.15, now + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
}

export function playQueueEnterChirp() {
    if (!isSoundEnabled || !audioCtx) return;

    const now = audioCtx.currentTime;
    const lead = audioCtx.createOscillator();
    const shimmer = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    lead.type = 'triangle';
    lead.frequency.setValueAtTime(480, now);
    lead.frequency.exponentialRampToValueAtTime(860, now + 0.22);

    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(720, now + 0.04);
    shimmer.frequency.exponentialRampToValueAtTime(1180, now + 0.26);

    filter.type = 'highpass';
    filter.frequency.setValueAtTime(280, now);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(0.14, now + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    lead.connect(filter);
    shimmer.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    lead.start(now);
    shimmer.start(now + 0.04);
    lead.stop(now + 0.3);
    shimmer.stop(now + 0.32);
}

export function playRadarPing() {
    if (!isSoundEnabled || !audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const echo = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    const echoGain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1320, now);
    osc.frequency.exponentialRampToValueAtTime(860, now + 0.14);

    echo.type = 'sine';
    echo.frequency.setValueAtTime(960, now + 0.18);
    echo.frequency.exponentialRampToValueAtTime(620, now + 0.4);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(8, now);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(0.05, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    echoGain.gain.setValueAtTime(0.0001, now + 0.18);
    echoGain.gain.linearRampToValueAtTime(0.025, now + 0.2);
    echoGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    echo.connect(echoGain);
    echoGain.connect(audioCtx.destination);

    osc.start(now);
    echo.start(now + 0.18);
    osc.stop(now + 0.26);
    echo.stop(now + 0.5);
}

export function playReadAck() {
    if (!isSoundEnabled || !audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const harmonic = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.09);

    harmonic.type = 'sine';
    harmonic.frequency.setValueAtTime(930, now);
    harmonic.frequency.exponentialRampToValueAtTime(1380, now + 0.08);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(0.08, now + 0.008);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gainNode);
    harmonic.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start(now);
    harmonic.start(now);
    osc.stop(now + 0.14);
    harmonic.stop(now + 0.12);
}

export function playPartnerLeftDissolve() {
    if (!isSoundEnabled || !audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const shimmer = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(170, now + 0.7);

    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(660, now);
    shimmer.frequency.exponentialRampToValueAtTime(210, now + 0.65);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(280, now + 0.7);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(0.11, now + 0.04);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    osc.connect(filter);
    shimmer.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start(now);
    shimmer.start(now + 0.02);
    osc.stop(now + 0.85);
    shimmer.stop(now + 0.72);
}

export function playCallConnectedChirp() {
    if (!isSoundEnabled || !audioCtx) return;

    const now = audioCtx.currentTime;
    const first = audioCtx.createOscillator();
    const second = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    first.type = 'sine';
    first.frequency.setValueAtTime(560, now);
    first.frequency.exponentialRampToValueAtTime(760, now + 0.08);

    second.type = 'triangle';
    second.frequency.setValueAtTime(760, now + 0.1);
    second.frequency.exponentialRampToValueAtTime(1080, now + 0.22);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(0.12, now + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    first.connect(gainNode);
    second.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    first.start(now);
    second.start(now + 0.1);
    first.stop(now + 0.12);
    second.stop(now + 0.28);
}

export function playHangupTone() {
    if (!isSoundEnabled || !audioCtx) return;

    const now = audioCtx.currentTime;
    const first = audioCtx.createOscillator();
    const second = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    first.type = 'triangle';
    first.frequency.setValueAtTime(520, now);
    first.frequency.exponentialRampToValueAtTime(340, now + 0.12);

    second.type = 'sine';
    second.frequency.setValueAtTime(320, now + 0.12);
    second.frequency.exponentialRampToValueAtTime(180, now + 0.3);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + 0.32);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(0.11, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    first.connect(filter);
    second.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    first.start(now);
    second.start(now + 0.12);
    first.stop(now + 0.18);
    second.stop(now + 0.36);
}

function playIncomingCallRingtoneCycle() {
    if (!isSoundEnabled || !audioCtx) return;

    const now = audioCtx.currentTime;

    [0, 0.42].forEach((offset) => {
        const lead = audioCtx.createOscillator();
        const harmony = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();

        lead.type = 'triangle';
        lead.frequency.setValueAtTime(740, now + offset);
        lead.frequency.exponentialRampToValueAtTime(680, now + offset + 0.28);

        harmony.type = 'sine';
        harmony.frequency.setValueAtTime(1110, now + offset);
        harmony.frequency.exponentialRampToValueAtTime(1020, now + offset + 0.28);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(980, now + offset);
        filter.Q.setValueAtTime(6, now + offset);

        gainNode.gain.setValueAtTime(0.0001, now + offset);
        gainNode.gain.linearRampToValueAtTime(0.16, now + offset + 0.03);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.34);

        lead.connect(filter);
        harmony.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        lead.start(now + offset);
        harmony.start(now + offset);
        lead.stop(now + offset + 0.3);
        harmony.stop(now + offset + 0.3);
    });
}

export function startIncomingCallRingtone() {
    stopIncomingCallRingtone();
    if (!isSoundEnabled || !audioCtx) return;

    playIncomingCallRingtoneCycle();
    incomingRingtoneInterval = globalThis.setInterval(() => {
        if (!isSoundEnabled || !audioCtx) {
            stopIncomingCallRingtone();
            return;
        }
        playIncomingCallRingtoneCycle();
    }, 2800);
}

export function stopIncomingCallRingtone() {
    if (incomingRingtoneInterval !== null) {
        globalThis.clearInterval(incomingRingtoneInterval);
        incomingRingtoneInterval = null;
    }
}
