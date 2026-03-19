/**
 * Web Audio API Sound Engine
 * Synthesizes organic, "glassmorphic" sounds in real-time.
 */

let audioCtx = null;
let isSoundEnabled = true;

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
