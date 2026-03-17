import { useState, useEffect } from 'react';
import './AdminDashboard.css';

const AdminMatchMonitor = ({ session, authedFetch }) => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchStats = async () => {
        try {
            const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
            const res = await authedFetch(`${BACKEND_URL}/api/v1/admin/matchmaking-stats`);
            const data = await res.json();
            if (data.timestamp) {
                setStats(data);
                setError(null);
            } else {
                setError('Invalid data received');
            }
        } catch (err) {
            setError('Failed to connect to monitoring service');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, 3000); // 3s refresh for real-time vibe
        return () => clearInterval(interval);
    }, [session.accessToken]);

    if (loading && !stats) return (
      <div className="admin-loading">
        <div className="loading-spinner" />
        <p>Syncing with Matchmaker Core...</p>
      </div>
    );
    
    if (error) return <div className="admin-error">{error}</div>;

    const getLatencyColor = (ms) => {
        if (ms < 5000) return '#00ffcc'; // Cyan
        if (ms < 15000) return '#ffd60a'; // Yellow
        return '#ff2d55'; // Red Magenta
    };

    const formatBucketName = (name) => {
        return name.replace('matchq:', '').replace(/:/g, ' → ');
    };

    return (
        <div className="admin-match-monitor">
            <div className="monitor-hero">
                <div className="latency-gauge">
                    <div className="gauge-header">
                        <span className="dot" />
                        CORE FREQUENCY
                    </div>
                    <div className="gauge-value" style={{ color: getLatencyColor(stats?.metrics?.avgLatencyMs ?? 0) }}>
                        {stats?.metrics?.avgLatencyMs ?? 0}
                        <span className="unit">ms</span>
                    </div>
                    <div className="gauge-label">Avg Connection Latency</div>
                </div>
                <div className="system-health-cards">
                    <div className="mini-stat">
                        <span className="mini-label">REDIS ENTROPY</span>
                        <span className="mini-value">{stats?.health?.redisMemoryUsed ?? '—'}</span>
                    </div>
                    <div className="mini-stat">
                        <span className="mini-label">ACTIVE NODES</span>
                        <span className="mini-value">{stats?.metrics?.activeRooms ?? 0}</span>
                    </div>
                    <div className="mini-stat">
                        <span className="mini-label">LIFETIME MATCHES</span>
                        <span className="mini-value">{(stats?.metrics?.totalMatchedSinceStart ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="mini-stat highlight">
                        <span className="mini-label">QUEUE DEPTH</span>
                        <span className="mini-value">{stats?.queues?.totalUsers ?? 0}</span>
                    </div>
                </div>
            </div>

            <div className="queue-buckets-section">
                <div className="section-header">
                  <h3>PARTITIONED SUB-QUEUES</h3>
                  <div className="terminal-status">SCANNING [OFFSET: 0]</div>
                </div>
                <div className="buckets-grid">
                    {Object.entries(stats?.queues?.bucketCounts || {}).length > 0 ? (
                        Object.entries(stats.queues.bucketCounts).map(([name, count], i) => (
                            <div key={name} className={`bucket-card ${count > 0 ? 'active' : ''}`} style={{animationDelay: `${i * 0.05}s`}}>
                                <div className="bucket-info">
                                    <span className="bucket-name">{formatBucketName(name)}</span>
                                    <span className="bucket-count">{count}</span>
                                </div>
                                <div className="bucket-bar">
                                    <div className="bucket-fill" style={{ width: `${Math.min(100, (count / 10) * 100)}%` }} />
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="empty-buckets">
                          <p>All neural pathways are clear.</p>
                          <span>Waiting for new subjects to join the queue...</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="monitor-footer">
                <p>TELEMETRY SYNC: {stats?.timestamp ? new Date(stats.timestamp).toLocaleTimeString() : '—'}</p>
                <div className="pulse-indicator">
                    <div className="pulse-dot" />
                    <span>SYSTEM NORMAL</span>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                .admin-match-monitor {
                    animation: fadeIn 0.8s cubic-bezier(0.23, 1, 0.32, 1);
                }
                .monitor-hero {
                    display: grid;
                    grid-template-columns: 350px 1fr;
                    gap: 2rem;
                    margin-bottom: 3rem;
                }
                .latency-gauge {
                    background: rgba(0, 255, 204, 0.03);
                    border: 1px solid rgba(0, 255, 204, 0.1);
                    border-radius: 32px;
                    padding: 3rem;
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    position: relative;
                    overflow: hidden;
                }
                .latency-gauge::after {
                  content: '';
                  position: absolute;
                  bottom: -50px;
                  right: -50px;
                  width: 150px;
                  height: 150px;
                  background: rgba(0, 255, 204, 0.05);
                  border-radius: 50%;
                  filter: blur(40px);
                }
                .gauge-header {
                  font-size: 0.7rem;
                  font-weight: 800;
                  color: #00ffcc;
                  letter-spacing: 0.2em;
                  margin-bottom: 1rem;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  gap: 0.5rem;
                }
                .gauge-header .dot {
                  width: 6px;
                  height: 6px;
                  background: #00ffcc;
                  border-radius: 50%;
                  box-shadow: 0 0 10px #00ffcc;
                  animation: blink 1s infinite;
                }
                .gauge-value {
                    font-size: 5rem;
                    font-weight: 900;
                    font-family: 'Outfit';
                    line-height: 1;
                    display: flex;
                    align-items: baseline;
                    justify-content: center;
                }
                .gauge-value .unit {
                  font-size: 1.5rem;
                  font-weight: 500;
                  margin-left: 0.5rem;
                  opacity: 0.5;
                }
                .system-health-cards {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 1.5rem;
                }
                .mini-stat {
                    background: rgba(255, 255, 255, 0.02);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 24px;
                    padding: 2rem;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s ease;
                }
                .mini-stat:hover {
                  background: rgba(255, 255, 255, 0.04);
                  border-color: rgba(255, 255, 255, 0.1);
                }
                .mini-stat.highlight {
                  background: rgba(255, 0, 85, 0.02);
                  border-color: rgba(255, 45, 85, 0.1);
                }
                .mini-label {
                    color: rgba(255, 255, 255, 0.3);
                    font-size: 0.7rem;
                    font-weight: 800;
                    letter-spacing: 0.1em;
                    margin-bottom: 0.8rem;
                }
                .mini-value {
                    font-size: 1.8rem;
                    font-weight: 800;
                    color: #fff;
                }
                .section-header {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-bottom: 2rem;
                }
                .terminal-status {
                  font-family: 'JetBrains Mono', monospace;
                  color: #00ffcc;
                  font-size: 0.8rem;
                  opacity: 0.5;
                }
                .queue-buckets-section h3 {
                    margin: 0;
                    font-size: 1.4rem;
                    letter-spacing: -0.02em;
                    font-weight: 800;
                }
                .buckets-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                    gap: 1.5rem;
                }
                .bucket-card {
                    background: rgba(15, 15, 20, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 20px;
                    padding: 1.5rem;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    animation: slideUp 0.5s ease-out both;
                }
                .bucket-card.active {
                    border-color: rgba(0, 255, 204, 0.3);
                    background: rgba(0, 255, 204, 0.05);
                    box-shadow: 0 10px 30px -10px rgba(0, 255, 204, 0.2);
                }
                .bucket-info {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                }
                .bucket-name {
                    font-size: 0.95rem;
                    font-weight: 700;
                    color: rgba(255, 255, 255, 0.8);
                }
                .bucket-count {
                    font-size: 1.2rem;
                    font-weight: 900;
                    color: #00ffcc;
                }
                .bucket-bar {
                    height: 6px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 3px;
                    overflow: hidden;
                }
                .bucket-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #ff0055, #00ffcc);
                    box-shadow: 0 0 10px rgba(0, 255, 204, 0.5);
                    transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .empty-buckets {
                    grid-column: 1 / -1;
                    text-align: center;
                    padding: 6rem;
                    color: rgba(255, 255, 255, 0.2);
                    background: rgba(255, 255, 255, 0.01);
                    border: 1px dashed rgba(255, 255, 255, 0.05);
                    border-radius: 32px;
                }
                .empty-buckets p {
                  font-size: 1.5rem;
                  font-weight: 700;
                  margin-bottom: 0.5rem;
                  color: rgba(255, 255, 255, 0.4);
                }
                .monitor-footer {
                    margin-top: 4rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    color: rgba(255, 255, 255, 0.2);
                    font-size: 0.8rem;
                    font-family: 'JetBrains Mono', monospace;
                }
                .pulse-indicator {
                    display: flex;
                    align-items: center;
                    gap: 0.8rem;
                    color: #00ffcc;
                    font-weight: 800;
                }
                @keyframes blink {
                  0%, 100% { opacity: 1; }
                  50% { opacity: 0.3; }
                }
                @keyframes slideUp {
                  from { opacity: 0; transform: translateY(20px); }
                  to { opacity: 1; transform: translateY(0); }
                }
            `}} />
        </div>
    );
};

export default AdminMatchMonitor;
