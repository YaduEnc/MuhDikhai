import { useState, useEffect } from 'react';
import { calculateAuraLevel } from '../utils/aura';
import './AdminDashboard.css';

const AdminDashboard = ({ session }) => {
    const [liveStats, setLiveStats] = useState({ onlineUsers: 0, activeSessions: 0 });
    const [growthStats, setGrowthStats] = useState({ totalUsers: 0, newUsersToday: 0, topVibes: [] });
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('stats');

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

                // Fetch Live Stats
                const liveRes = await fetch(`${BACKEND_URL}/api/v1/admin/stats/live`, {
                    headers: { 'Authorization': `Bearer ${session.accessToken}` }
                });
                const liveData = await liveRes.json();
                setLiveStats(liveData);

                // Fetch Growth Stats
                const growthRes = await fetch(`${BACKEND_URL}/api/v1/admin/stats/growth`, {
                    headers: { 'Authorization': `Bearer ${session.accessToken}` }
                });
                const growthData = await growthRes.json();
                setGrowthStats(growthData);

                // Fetch Reports
                const reportsRes = await fetch(`${BACKEND_URL}/api/v1/admin/reports`, {
                    headers: { 'Authorization': `Bearer ${session.accessToken}` }
                });
                const reportsData = await reportsRes.json();
                setReports(reportsData.reports || []);

            } catch (err) {
                console.error('Failed to fetch admin stats', err);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, [session.accessToken]);

    const handleActionReport = async (reportId, status) => {
        try {
            const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
            await fetch(`${BACKEND_URL}/api/v1/admin/reports/${reportId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${session.accessToken}`,
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
            await fetch(`${BACKEND_URL}/api/v1/admin/users/${userId}/ban`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.accessToken}` }
            });
            alert('User banned successfully');
        } catch (err) {
            console.error('Ban failed', err);
        }
    };

    return (
        <div className="admin-dashboard">
            <div className="admin-sidebar">
                <div className="admin-logo">
                    <span className="logo-icon">🪐</span>
                    <h2>Admin</h2>
                </div>
                <nav className="admin-nav">
                    <button className={activeTab === 'stats' ? 'active' : ''} onClick={() => setActiveTab('stats')}>
                        Dashboard
                    </button>
                    <button className={activeTab === 'reports' ? 'active' : ''} onClick={() => setActiveTab('reports')}>
                        Reports {reports.filter(r => r.status === 'pending').length > 0 && <span className="badge">!</span>}
                    </button>
                </nav>
                <div className="admin-footer">
                    <button className="btn-exit" onClick={() => window.location.href = '/'}>Exit Terminal</button>
                </div>
            </div>

            <div className="admin-content">
                <header className="admin-header">
                    <h1>{activeTab === 'stats' ? 'Live Overview' : 'Safety Reports'}</h1>
                    <div className="admin-user-info">
                        <span>Terminal v1.0.4</span>
                    </div>
                </header>

                {loading ? (
                    <div className="admin-loading">Initializing secure connection...</div>
                ) : activeTab === 'stats' ? (
                    <div className="admin-stats-grid">
                        <div className="stat-card live">
                            <span className="stat-label">Online Strangers</span>
                            <div className="stat-value">{liveStats.onlineUsers}</div>
                            <div className="stat-chart-mock">Currently connected to socket nodes</div>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">Total Users</span>
                            <div className="stat-value">{growthStats.totalUsers}</div>
                            <div className="stat-chart-mock">Lifetime accounts created</div>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">New Today</span>
                            <div className="stat-value">+{growthStats.newUsersToday}</div>
                            <div className="stat-chart-mock">Users joined in last 24h</div>
                        </div>
                        <div className="stat-card vibe-card">
                            <span className="stat-label">Top Vibes</span>
                            <div className="vibe-list">
                                {growthStats.topVibes.map((v, i) => (
                                    <div key={i} className="vibe-item">
                                        <span className="vibe-name">{v.vibe || 'No Vibe'}</span>
                                        <span className="vibe-count">{v.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="admin-reports-view">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Reporter</th>
                                    <th>Reported User</th>
                                    <th>Reason</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reports.map(r => (
                                    <tr key={r.id}>
                                        <td>
                                            <div className="user-info-cell">
                                                <strong>
                                                    {r.reporterName}
                                                    {r.reporterAura !== undefined && (
                                                        <span
                                                            className="partner-aura-badge"
                                                            title={`Aura: ${calculateAuraLevel(r.reporterAura).name}`}
                                                            style={{ color: calculateAuraLevel(r.reporterAura).color, fontSize: '0.7rem', marginLeft: '0.3rem' }}
                                                        >
                                                            ✧
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
                                                            title={`Aura: ${calculateAuraLevel(r.reportedAura).name}`}
                                                            style={{ color: calculateAuraLevel(r.reportedAura).color, fontSize: '0.7rem', marginLeft: '0.3rem' }}
                                                        >
                                                            ✧
                                                        </span>
                                                    )}
                                                </strong>
                                                <span>{r.reportedEmail}</span>
                                            </div>
                                        </td>
                                        <td>{r.reason}</td>
                                        <td>
                                            <span className={`pill ${r.status}`}>{r.status}</span>
                                        </td>
                                        <td>
                                            <div className="table-actions">
                                                {r.status === 'pending' && (
                                                    <>
                                                        <button className="btn-resolve" onClick={() => handleActionReport(r.id, 'resolved')}>Resolve</button>
                                                        <button className="btn-dismiss" onClick={() => handleActionReport(r.id, 'dismissed')}>Dismiss</button>
                                                    </>
                                                )}
                                                <button className="btn-ban" onClick={() => handleBanUser(r.reportedId)}>Ban User</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {reports.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="empty-table">No reports found. Everyone is being good.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminDashboard;
