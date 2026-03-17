import { useState, useEffect, useCallback } from 'react';
import { calculateAuraLevel } from '../utils/aura';
import AdminMatchMonitor from './AdminMatchMonitor';
import GlobalInteractiveGlobe from './GlobalInteractiveGlobe';
import './AdminDashboard.css';

const AdminDashboard = ({ session, authedFetch }) => {
    const [liveStats, setLiveStats] = useState({ onlineUsers: 0, activeSessions: 0 });
    const [growthStats, setGrowthStats] = useState({ totalUsers: 0, newUsersToday: 0, topVibes: [] });
    const [reports, setReports] = useState([]);
    const [matchmaking, setMatchmaking] = useState({ metrics: { avgLatencyMs: 0, userLocations: [] } });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('stats');

    const fetchStats = useCallback(async (isAuto = true) => {
        if (!isAuto) setRefreshing(true);
        try {
            const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

            const [liveRes, growthRes, reportsRes, matchmakingRes] = await Promise.all([
                authedFetch(`${BACKEND_URL}/api/v1/admin/stats/live`),
                authedFetch(`${BACKEND_URL}/api/v1/admin/stats/growth`),
                authedFetch(`${BACKEND_URL}/api/v1/admin/reports`),
                authedFetch(`${BACKEND_URL}/api/v1/admin/matchmaking-stats`)
            ]);

            const [liveData, growthData, reportsData, matchmakingData] = await Promise.all([
                liveRes.json(),
                growthRes.json(),
                reportsRes.json(),
                matchmakingRes.json()
            ]);

            setLiveStats(liveData);
            setGrowthStats(growthData);
            setReports(reportsData.reports || []);
            if (matchmakingData?.metrics) setMatchmaking(matchmakingData);

        } catch (err) {
            console.error('Failed to fetch admin stats', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [session.accessToken]);

    useEffect(() => {
        fetchStats();
        const interval = setInterval(() => fetchStats(true), 15000); // 15s auto-refresh
        return () => clearInterval(interval);
    }, [fetchStats]);

    const handleActionReport = async (reportId, status) => {
        try {
            const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
            await authedFetch(`${BACKEND_URL}/api/v1/admin/reports/${reportId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status })
            });
            setReports(prev => prev.map(r => r.id === reportId ? { ...r, status } : r));
        } catch (err) {
            console.error('Action failed', err);
        }
    };

    const handleBanUser = async (userId) => {
        if (!confirm('Are you sure you want to ban this user?')) return;
        try {
            const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
            await authedFetch(`${BACKEND_URL}/api/v1/admin/users/${userId}/ban`, {
                method: 'POST'
            });
            alert('User banned successfully');
        } catch (err) {
            console.error('Ban failed', err);
        }
    };

    const pendingReportsCount = reports.filter(r => r.status === 'pending').length;

    return (
        <div className="admin-dashboard">
            <div className="admin-sidebar">
                <div className="admin-logo">
                    <span className="logo-icon">🪐</span>
                    <h2>Terminal</h2>
                </div>
                <nav className="admin-nav">
                    <button className={activeTab === 'stats' ? 'active' : ''} onClick={() => setActiveTab('stats')}>
                        Dashboard
                        <span className="nav-shortcut">⌥ 1</span>
                    </button>
                    <button className={activeTab === 'reports' ? 'active' : ''} onClick={() => setActiveTab('reports')}>
                        Reports {pendingReportsCount > 0 && <span className="badge">{pendingReportsCount}</span>}
                        <span className="nav-shortcut">⌥ 2</span>
                    </button>
                    <button className={activeTab === 'matchmaking' ? 'active' : ''} onClick={() => setActiveTab('matchmaking')}>
                        Matchmaking
                        <span className="nav-shortcut">⌥ 3</span>
                    </button>
                </nav>
                <div className="admin-footer">
                    <button className="btn-exit" onClick={() => window.location.href = '/'}>
                        ⎋ Exit Terminal
                    </button>
                </div>
            </div>

            <div className="admin-content">
                <header className="admin-header">
                    <div className="header-title-area">
                        <h1>
                            {activeTab === 'stats' ? 'Live Overview' : 
                             activeTab === 'matchmaking' ? 'Matching Engine' : 
                             'Safety Reports'}
                        </h1>
                        <p className="header-subtitle">
                            {activeTab === 'stats' ? 'Global platform health and user metrics.' : 
                             activeTab === 'matchmaking' ? 'Real-time telemetry from partitioned matching queues.' : 
                             'Moderation queue for reported user behavior.'}
                        </p>
                    </div>
                    <div className="admin-user-info">
                        <button 
                            className={`refresh-btn ${refreshing ? 'spinning' : ''}`} 
                            onClick={() => fetchStats(false)}
                            title="Force Refresh Data"
                        >
                            ↻
                        </button>
                        <span>V1.0.4-BETA</span>
                    </div>
                </header>

                {loading ? (
                    <div className="admin-loading">
                        <div className="loading-spinner" />
                        <p>Establishing Secure Protocol...</p>
                    </div>
                ) : activeTab === 'matchmaking' ? (
                    <AdminMatchMonitor session={session} authedFetch={authedFetch} />
                ) : activeTab === 'stats' ? (
                    <div className="admin-stats-container">
                        <div className="admin-stats-grid">
                            <div className="stat-card live">
                                <span className="stat-label">Online Strangers</span>
                                <div className="stat-value">{liveStats.onlineUsers}</div>
                                <div className="stat-chart-mock">Currently active socket heartbeat</div>
                            </div>
                            <div className="stat-card">
                                <span className="stat-label">Total Citizens</span>
                                <div className="stat-value">{growthStats.totalUsers}</div>
                                <div className="stat-chart-mock">Lifetime accounts in registry</div>
                            </div>
                            <div className="stat-card">
                                <span className="stat-label">Day Gain</span>
                                <div className="stat-value">+{growthStats.newUsersToday}</div>
                                <div className="stat-chart-mock">New joiners in last 24h cycle</div>
                            </div>
                        </div>

                        <div className="vibe-card">
                            <div className="card-header">
                                <span className="stat-label">Top Behavioral Vibes</span>
                                <span className="stat-label" style={{ color: '#00ffff' }}>Pairing Latency: {matchmaking?.metrics?.avgLatencyMs ?? 0}ms</span>
                            </div>
                            <div className="vibe-list">
                                {growthStats.topVibes.length > 0 ? growthStats.topVibes.map((v, i) => (
                                    <div key={i} className="vibe-item" style={{animationDelay: `${i * 0.1}s`}}>
                                        <span className="vibe-name">{v.vibe || 'Undefined'}</span>
                                        <span className="vibe-count">{v.count}</span>
                                    </div>
                                )) : (
                                    <div className="empty-vibes">No behavioral data acquired yet.</div>
                                )}
                            </div>
                        </div>

                        {/* GOD MODE: 3D GLOBE */}
                        <div className="globe-visualization-card">
                            <div className="globe-header">
                                <h3>GOD MODE: GLOBAL PRESENCE</h3>
                                <div className="warp-speed-gauge">
                                    <span className="warp-label">WARP SPEED</span>
                                    <div className="warp-bar">
                                        <div className="warp-fill" style={{ width: `${Math.min(100, 100 - ((matchmaking?.metrics?.avgLatencyMs ?? 0) / 50))} %` }}></div>
                                    </div>
                                    <span className="warp-value">{(matchmaking?.metrics?.avgLatencyMs ?? 0) < 500 ? 'OPTIMAL' : 'CONGESTED'}</span>
                                </div>
                            </div>
                            <GlobalInteractiveGlobe locations={matchmaking?.metrics?.userLocations || []} />
                            <div className="globe-footer">
                                <span className="telemetry-ping">📡 REAL-TIME TELEMETRY ACTIVE</span>
                                <span className="active-nodes">{matchmaking?.metrics?.userLocations?.length || 0} ACTIVE NODES</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="admin-reports-view">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Reporter</th>
                                    <th>Target</th>
                                    <th>Incident</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reports.map((r, i) => (
                                    <tr key={r.id} style={{animationDelay: `${i * 0.05}s`}}>
                                        <td>
                                            <div className="user-info-cell">
                                                <strong>
                                                    {r.reporterName}
                                                    {r.reporterAura !== undefined && (
                                                        <span
                                                            className="partner-aura-badge"
                                                            style={{ color: calculateAuraLevel(r.reporterAura).color }}
                                                        >
                                                            ✦
                                                        </span>
                                                    )}
                                                </strong>
                                                <span>{r.reporterEmail}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="user-info-cell">
                                                <strong>
                                                    {r.reportedName}
                                                    {r.reportedAura !== undefined && (
                                                        <span
                                                            className="partner-aura-badge"
                                                            style={{ color: calculateAuraLevel(r.reportedAura).color }}
                                                        >
                                                            ✦
                                                        </span>
                                                    )}
                                                </strong>
                                                <span>{r.reportedEmail}</span>
                                            </div>
                                        </td>
                                        <td>
                                          <div className="incident-cell">
                                            <span className="incident-reason">{r.reason}</span>
                                            {r.details && <p className="incident-details">{r.details}</p>}
                                          </div>
                                        </td>
                                        <td>
                                            <span className={`pill ${r.status}`}>{r.status}</span>
                                        </td>
                                        <td>
                                            <div className="table-actions">
                                                {r.status === 'pending' && (
                                                    <>
                                                        <button className="btn-resolve" onClick={() => handleActionReport(r.id, 'resolved')}>✓</button>
                                                        <button className="btn-dismiss" onClick={() => handleActionReport(r.id, 'dismissed')}>×</button>
                                                    </>
                                                )}
                                                <button className="btn-ban" onClick={() => handleBanUser(r.reportedId)}>Ban</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {reports.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="empty-table">The system is currently stable. No incidents reached the queue.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
              .nav-shortcut {
                font-size: 0.65rem;
                opacity: 0.3;
                font-family: 'JetBrains Mono', monospace;
              }
              .header-subtitle {
                font-size: 0.9rem;
                color: rgba(255, 255, 255, 0.4);
                margin: 0.5rem 0 0;
              }
              .refresh-btn {
                background: none;
                border: none;
                color: rgba(255, 255, 255, 0.4);
                font-size: 1.5rem;
                cursor: pointer;
                padding: 0.5rem;
                margin-right: 1rem;
                transition: all 0.3s ease;
              }
              .refresh-btn:hover {
                color: #00ffcc;
              }
              .refresh-btn.spinning {
                animation: spin 1s infinite linear;
              }
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
              .incident-cell {
                display: flex;
                flex-direction: column;
                gap: 0.3rem;
              }
              .incident-details {
                font-size: 0.75rem;
                color: rgba(255, 255, 255, 0.3);
                margin: 0;
                max-width: 250px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }
              .loading-spinner {
                width: 40px;
                height: 40px;
                border: 3px solid rgba(0, 255, 204, 0.1);
                border-top-color: #00ffcc;
                border-radius: 50%;
                animation: spin 1s infinite linear;
                margin-bottom: 1rem;
              }
              .empty-vibes {
                text-align: center;
                padding: 3rem;
                color: rgba(255, 255, 255, 0.3);
                font-style: italic;
              }
            `}} />
        </div>
    );
};

export default AdminDashboard;
