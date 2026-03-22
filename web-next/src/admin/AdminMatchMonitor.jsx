import { useState, useEffect, useCallback } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

const STATE_OPTIONS = [
  { value: 'all', label: 'All states' },
  { value: 'online', label: 'Online' },
  { value: 'in_queue', label: 'In queue' },
  { value: 'in_active_room', label: 'In active room' },
  { value: 'offline', label: 'Offline' },
];

const DEFAULT_FILTERS = {
  state: 'all',
  city: '',
  campus: '',
  centerLat: '',
  centerLong: '',
  radiusKm: '',
  limit: '200',
};

const formatBucketName = (name) => name.replace('matchq:', '').replace(/:/g, ' -> ');

const formatWhen = (value) => {
  if (!value) return '--';
  const ts = new Date(value);
  if (Number.isNaN(ts.getTime())) return '--';
  return ts.toLocaleString();
};

const ttlTone = (ttl) => {
  if (ttl <= 0) return 'danger';
  if (ttl <= 8) return 'warn';
  return 'ok';
};

const stateTone = (state) => {
  if (state === 'in_queue') return 'queue';
  if (state === 'in_active_room') return 'room';
  if (state === 'online') return 'online';
  return 'offline';
};

const AdminMatchMonitor = ({ session, authedFetch }) => {
  const [stats, setStats] = useState(null);
  const [debugSnapshot, setDebugSnapshot] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);

  const [loading, setLoading] = useState(true);
  const [debugLoading, setDebugLoading] = useState(false);
  const [error, setError] = useState(null);
  const [debugError, setDebugError] = useState(null);

  const [actionBusyKey, setActionBusyKey] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);

  const fetchStats = useCallback(async () => {
    const res = await authedFetch(`${BACKEND_URL}/api/v1/admin/matchmaking-stats`);
    const data = await res.json();
    if (data.timestamp) {
      setStats(data);
      setError(null);
      return;
    }
    throw new Error('Invalid telemetry payload');
  }, [authedFetch]);

  const fetchDebugSnapshot = useCallback(async (activeFilters, silent = false) => {
    if (!silent) setDebugLoading(true);
    setDebugError(null);

    try {
      const params = new URLSearchParams();
      if (activeFilters.state && activeFilters.state !== 'all') params.set('state', activeFilters.state);
      if (activeFilters.city.trim()) params.set('city', activeFilters.city.trim());
      if (activeFilters.campus.trim()) params.set('campus', activeFilters.campus.trim());
      if (activeFilters.centerLat.trim()) params.set('centerLat', activeFilters.centerLat.trim());
      if (activeFilters.centerLong.trim()) params.set('centerLong', activeFilters.centerLong.trim());
      if (activeFilters.radiusKm.trim()) params.set('radiusKm', activeFilters.radiusKm.trim());
      if (activeFilters.limit.trim()) params.set('limit', activeFilters.limit.trim());

      const query = params.toString();
      const url = `${BACKEND_URL}/api/v1/admin/matchmaking-debug${query ? `?${query}` : ''}`;

      const res = await authedFetch(url);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to fetch queue diagnostics');
      }

      setDebugSnapshot(data);
      setDebugError(null);
    } catch (err) {
      setDebugError(err?.message || 'Failed to fetch queue diagnostics');
    } finally {
      if (!silent) setDebugLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    let active = true;

    const boot = async () => {
      try {
        await Promise.all([
          fetchStats(),
          fetchDebugSnapshot(appliedFilters, true),
        ]);
      } catch {
        if (active) {
          setError('Failed to connect to monitoring service');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    boot();

    const interval = setInterval(() => {
      fetchStats().catch(() => setError('Failed to connect to monitoring service'));
      fetchDebugSnapshot(appliedFilters, true);
    }, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [session?.accessToken, fetchStats, fetchDebugSnapshot, appliedFilters]);

  const onFilterInput = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const applyFilters = async (event) => {
    event.preventDefault();
    const nextFilters = { ...filters };
    setAppliedFilters(nextFilters);
    await fetchDebugSnapshot(nextFilters);
  };

  const resetFilters = async () => {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    await fetchDebugSnapshot(DEFAULT_FILTERS);
  };

  const useCurrentLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setDebugError('Geolocation is not available in this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setFilters((prev) => ({
          ...prev,
          centerLat: coords.latitude.toFixed(6),
          centerLong: coords.longitude.toFixed(6),
          radiusKm: prev.radiusKm || '10',
        }));
      },
      () => {
        setDebugError('Unable to read your location. Allow location permission and retry.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  };

  const runAction = async (action, userId) => {
    if (action === 'force_rematch') {
      const confirmed = window.confirm('Force rematch will clear room state and requeue this user. Continue?');
      if (!confirmed) return;
    }

    const busyKey = `${action}:${userId}`;
    setActionBusyKey(busyKey);
    setActionMessage(null);

    try {
      const res = await authedFetch(`${BACKEND_URL}/api/v1/admin/matchmaking-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to execute action');
      }

      const label = action.replaceAll('_', ' ');
      setActionMessage(`Executed ${label} for ${userId.slice(0, 8)}...`);

      await Promise.all([
        fetchStats(),
        fetchDebugSnapshot(appliedFilters, true),
      ]);
    } catch (err) {
      setDebugError(err?.message || 'Action failed');
    } finally {
      setActionBusyKey(null);
    }
  };

  if (loading && !stats) {
    return (
      <div className="admin-loading">
        <div className="loading-spinner" />
        <p>Syncing with Matchmaker Core...</p>
      </div>
    );
  }

  if (error && !stats) {
    return <div className="admin-error">{error}</div>;
  }

  const getLatencyColor = (ms) => {
    if (ms < 5000) return '#00ffcc';
    if (ms < 15000) return '#ffd60a';
    return '#ff2d55';
  };

  const bucketCounts = Object.entries(stats?.queues?.bucketCounts || {});
  const users = debugSnapshot?.users || [];
  const counts = debugSnapshot?.counts || {
    totalUsers: 0,
    filteredUsers: 0,
    inQueue: 0,
    inActiveRoom: 0,
    online: 0,
    offline: 0,
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
            <span className="mini-value">{stats?.health?.redisMemoryUsed ?? '--'}</span>
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
          {bucketCounts.length > 0 ? (
            bucketCounts.map(([name, count], i) => (
              <div key={name} className={`bucket-card ${count > 0 ? 'active' : ''}`} style={{ animationDelay: `${i * 0.05}s` }}>
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

      <div className="queue-debug-section">
        <div className="section-header debug-header-row">
          <h3>LIVE QUEUE DEBUG TABLE</h3>
          <button className="btn-muted" onClick={() => fetchDebugSnapshot(appliedFilters)} disabled={debugLoading}>
            {debugLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <form className="debug-filter-grid" onSubmit={applyFilters}>
          <label>
            State
            <select name="state" value={filters.state} onChange={onFilterInput}>
              {STATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            City
            <input name="city" value={filters.city} onChange={onFilterInput} placeholder="Noida" />
          </label>

          <label>
            Campus
            <input name="campus" value={filters.campus} onChange={onFilterInput} placeholder="GBU" />
          </label>

          <label>
            Center Lat
            <input name="centerLat" value={filters.centerLat} onChange={onFilterInput} placeholder="28.475" />
          </label>

          <label>
            Center Long
            <input name="centerLong" value={filters.centerLong} onChange={onFilterInput} placeholder="77.503" />
          </label>

          <label>
            Radius (km)
            <input name="radiusKm" value={filters.radiusKm} onChange={onFilterInput} placeholder="10" />
          </label>

          <label>
            Limit
            <input name="limit" value={filters.limit} onChange={onFilterInput} placeholder="200" />
          </label>

          <div className="filter-actions">
            <button type="submit" className="btn-primary" disabled={debugLoading}>Apply</button>
            <button type="button" className="btn-muted" onClick={resetFilters} disabled={debugLoading}>Reset</button>
            <button type="button" className="btn-muted" onClick={useCurrentLocation}>Use My Location</button>
          </div>
        </form>

        <div className="debug-kpi-row">
          <span>Total: {counts.totalUsers}</span>
          <span>Filtered: {counts.filteredUsers}</span>
          <span>In Queue: {counts.inQueue}</span>
          <span>In Room: {counts.inActiveRoom}</span>
          <span>Online: {counts.online}</span>
          <span>Offline: {counts.offline}</span>
        </div>

        {actionMessage && <div className="debug-message success">{actionMessage}</div>}
        {debugError && <div className="debug-message error">{debugError}</div>}

        <div className="debug-table-wrap">
          <table className="debug-table">
            <thead>
              <tr>
                <th>User</th>
                <th>State</th>
                <th>Queued?</th>
                <th>Heartbeat TTL</th>
                <th>Lock Key</th>
                <th>Queue Bucket</th>
                <th>Joined At</th>
                <th>Last Ping</th>
                <th>Geo</th>
                <th>Matchmaking Controls</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr key={row.userId}>
                  <td>
                    <div className="user-cell">
                      <strong>{row.name || 'Unknown'}</strong>
                      <span>@{row.username || 'no_username'}</span>
                      <code>{row.userId}</code>
                    </div>
                  </td>
                  <td>
                    <span className={`state-pill ${stateTone(row.state)}`}>
                      {row.state.replaceAll('_', ' ')}
                    </span>
                    {row.activeRoomId && <code className="room-id">room: {row.activeRoomId}</code>}
                  </td>
                  <td>{row.queued ? 'Yes' : 'No'}</td>
                  <td>
                    <span className={`ttl-pill ${ttlTone(row.heartbeatTtl)}`}>
                      {row.heartbeatTtl}s
                    </span>
                  </td>
                  <td>
                    <div className="lock-cell">
                      <code>{row.lockKey}</code>
                      <span>{row.hasLock ? `TTL ${row.lockTtl}s` : 'clear'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="bucket-list">
                      {Array.isArray(row.queueBuckets) && row.queueBuckets.length > 0 ? (
                        row.queueBuckets.map((bucket) => <code key={bucket}>{formatBucketName(bucket)}</code>)
                      ) : (
                        <span>--</span>
                      )}
                    </div>
                  </td>
                  <td>{formatWhen(row.joinedAt)}</td>
                  <td>{formatWhen(row.lastPingAt)}</td>
                  <td>
                    <div className="geo-cell">
                      <span>{row.city || '--'} / {row.campus || '--'}</span>
                      {typeof row.distanceKm === 'number' ? (
                        <span>{row.distanceKm.toFixed(1)} km</span>
                      ) : (
                        <span>--</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="action-grid">
                      {[
                        { key: 'force_dequeue', label: 'Force dequeue' },
                        { key: 'clear_stale_heartbeat', label: 'Clear heartbeat' },
                        { key: 'clear_lock', label: 'Clear lock' },
                        { key: 'force_rematch', label: 'Force rematch' },
                      ].map((item) => {
                        const busy = actionBusyKey === `${item.key}:${row.userId}`;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            className="action-btn"
                            onClick={() => runAction(item.key, row.userId)}
                            disabled={Boolean(actionBusyKey)}
                          >
                            {busy ? 'Working...' : item.label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan="10" className="empty-table">No rows for selected filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="monitor-footer">
        <p>TELEMETRY SYNC: {stats?.timestamp ? new Date(stats.timestamp).toLocaleTimeString() : '--'}</p>
        <div className="pulse-indicator">
          <div className="pulse-dot" />
          <span>SYSTEM NORMAL</span>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .admin-match-monitor {
          animation: fadeIn 0.8s cubic-bezier(0.23, 1, 0.32, 1);
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }
        .monitor-hero {
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 2rem;
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
          margin-bottom: 1rem;
        }
        .terminal-status {
          font-family: 'JetBrains Mono', monospace;
          color: #00ffcc;
          font-size: 0.8rem;
          opacity: 0.5;
        }
        .queue-buckets-section h3,
        .queue-debug-section h3 {
          margin: 0;
          font-size: 1.2rem;
          letter-spacing: -0.02em;
          font-weight: 800;
        }
        .buckets-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1rem;
        }
        .bucket-card {
          background: rgba(15, 15, 20, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 1rem;
          transition: all 0.3s ease;
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
          margin-bottom: 1rem;
        }
        .bucket-name {
          font-size: 0.9rem;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.8);
        }
        .bucket-count {
          font-size: 1.1rem;
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
          padding: 4rem;
          color: rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.01);
          border: 1px dashed rgba(255, 255, 255, 0.05);
          border-radius: 24px;
        }
        .empty-buckets p {
          margin: 0 0 0.5rem;
          font-size: 1.2rem;
          color: rgba(255, 255, 255, 0.4);
        }
        .queue-debug-section {
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 1rem;
        }
        .debug-header-row {
          margin-bottom: 1rem;
        }
        .btn-primary,
        .btn-muted,
        .action-btn {
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.04);
          color: #fff;
          border-radius: 10px;
          padding: 0.5rem 0.8rem;
          font-size: 0.8rem;
          cursor: pointer;
        }
        .btn-primary {
          border-color: rgba(0, 255, 204, 0.4);
          background: rgba(0, 255, 204, 0.12);
          color: #00ffcc;
          font-weight: 700;
        }
        .btn-primary:disabled,
        .btn-muted:disabled,
        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .debug-filter-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .debug-filter-grid label {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.7);
        }
        .debug-filter-grid input,
        .debug-filter-grid select {
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: rgba(15, 15, 20, 0.85);
          color: #fff;
          border-radius: 10px;
          padding: 0.5rem;
          font-size: 0.85rem;
        }
        .filter-actions {
          display: flex;
          align-items: flex-end;
          gap: 0.4rem;
          flex-wrap: wrap;
        }
        .debug-kpi-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 0.8rem;
        }
        .debug-kpi-row span {
          font-size: 0.75rem;
          padding: 0.25rem 0.5rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.86);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .debug-message {
          border-radius: 10px;
          padding: 0.6rem 0.8rem;
          font-size: 0.8rem;
          margin-bottom: 0.7rem;
        }
        .debug-message.success {
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.35);
          color: #6ee7b7;
        }
        .debug-message.error {
          background: rgba(239, 68, 68, 0.14);
          border: 1px solid rgba(239, 68, 68, 0.34);
          color: #fca5a5;
        }
        .debug-table-wrap {
          overflow-x: auto;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
        }
        .debug-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1220px;
          font-size: 0.8rem;
        }
        .debug-table th,
        .debug-table td {
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          padding: 0.6rem;
          vertical-align: top;
        }
        .debug-table th {
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.72rem;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          background: rgba(0, 0, 0, 0.2);
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .debug-table tr:hover td {
          background: rgba(255, 255, 255, 0.02);
        }
        .user-cell {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .user-cell strong {
          font-size: 0.85rem;
        }
        .user-cell span {
          color: rgba(255, 255, 255, 0.7);
        }
        .user-cell code,
        .room-id,
        .lock-cell code,
        .bucket-list code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.75);
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 0.15rem 0.4rem;
          width: fit-content;
        }
        .state-pill,
        .ttl-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 0.15rem 0.55rem;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border: 1px solid;
        }
        .state-pill.queue {
          color: #34d399;
          border-color: rgba(52, 211, 153, 0.45);
          background: rgba(52, 211, 153, 0.12);
        }
        .state-pill.room {
          color: #60a5fa;
          border-color: rgba(96, 165, 250, 0.45);
          background: rgba(96, 165, 250, 0.12);
        }
        .state-pill.online {
          color: #facc15;
          border-color: rgba(250, 204, 21, 0.45);
          background: rgba(250, 204, 21, 0.1);
        }
        .state-pill.offline {
          color: #94a3b8;
          border-color: rgba(148, 163, 184, 0.45);
          background: rgba(148, 163, 184, 0.1);
        }
        .ttl-pill.ok {
          color: #34d399;
          border-color: rgba(52, 211, 153, 0.4);
          background: rgba(52, 211, 153, 0.12);
        }
        .ttl-pill.warn {
          color: #facc15;
          border-color: rgba(250, 204, 21, 0.4);
          background: rgba(250, 204, 21, 0.12);
        }
        .ttl-pill.danger {
          color: #f87171;
          border-color: rgba(248, 113, 113, 0.45);
          background: rgba(248, 113, 113, 0.12);
        }
        .lock-cell,
        .geo-cell,
        .bucket-list,
        .action-grid {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .lock-cell span,
        .geo-cell span {
          color: rgba(255, 255, 255, 0.7);
        }
        .action-grid {
          min-width: 150px;
        }
        .action-btn {
          text-align: left;
          font-size: 0.74rem;
          white-space: nowrap;
        }
        .empty-table {
          text-align: center;
          color: rgba(255, 255, 255, 0.45);
          padding: 2rem;
        }
        .monitor-footer {
          margin-top: 1rem;
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
        .pulse-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #00ffcc;
          box-shadow: 0 0 0 0 rgba(0, 255, 204, 0.6);
          animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(0, 255, 204, 0.6);
          }
          70% {
            box-shadow: 0 0 0 8px rgba(0, 255, 204, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(0, 255, 204, 0);
          }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 1180px) {
          .monitor-hero {
            grid-template-columns: 1fr;
          }
          .latency-gauge {
            padding: 2rem;
          }
          .gauge-value {
            font-size: 3.8rem;
          }
        }
      ` }} />
    </div>
  );
};

export default AdminMatchMonitor;
