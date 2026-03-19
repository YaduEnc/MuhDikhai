export const AURA_LEVELS = [
    { level: 1, name: 'Dissolved Mist', minPoints: 0, color: '#94a3b8' },      // Grey/Muted
    { level: 2, name: 'Fading Whisper', minPoints: 50, color: '#f87171' },    // Soft Red
    { level: 3, name: 'Soft Glow', minPoints: 100, color: '#fbbf24' },        // Amber
    { level: 4, name: 'Steady Lantern', minPoints: 250, color: '#22c55e' },   // Green
    { level: 5, name: 'Lighthouse', minPoints: 500, color: '#8b5cf6' },       // Purple/Premium
];

export function calculateAuraLevel(points = 0) {
    const reverseLevels = [...AURA_LEVELS].reverse();
    const current = reverseLevels.find(l => points >= l.minPoints) || AURA_LEVELS[0];

    const next = AURA_LEVELS.find(l => l.level === current.level + 1) || null;

    return {
        ...current,
        nextLevel: next ? next.minPoints : null,
        progress: next ? ((points - current.minPoints) / (next.minPoints - current.minPoints)) * 100 : 100
    };
}
