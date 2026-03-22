import { Router } from 'express';
import reportService from '../services/report.service';
import matchmakingTelemetryService from '../services/matchmakingTelemetry.service';
import { authenticate, isAdmin } from '../middleware/auth.middleware';
import database from '../config/database';
import redis from '../config/redis';
import logger from '../utils/logger';

const router = Router();

// Secure all admin routes
router.use(authenticate);
router.use(isAdmin);

type QueueStateFilter = 'all' | 'online' | 'in_queue' | 'in_active_room' | 'offline';

type QueueDebugFilters = {
  state: QueueStateFilter;
  city?: string;
  campus?: string;
  centerLat?: number;
  centerLong?: number;
  radiusKm?: number;
  limit: number;
};

type QueueCandidate = {
  userId: string;
  topics: string[];
  gender: string;
  preference: 'male' | 'female' | 'everyone';
  enqueuedAt?: number;
};

type DbUserRow = {
  id: string;
  email: string | null;
  username: string | null;
  name: string | null;
  status: string | null;
  lastSeen: string | null;
  gender: string | null;
};

const DEFAULT_QUEUE_HEARTBEAT_TTL = 30;

const firstQueryString = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
};

const parseOptionalNumber = (value: unknown): number | undefined => {
  const raw = firstQueryString(value);
  if (!raw) return undefined;
  const num = Number(raw);
  return Number.isFinite(num) ? num : undefined;
};

const stripRedisPrefix = (rawKey: string, keyPrefix: string): string => {
  if (!keyPrefix) return rawKey;
  return rawKey.startsWith(keyPrefix) ? rawKey.slice(keyPrefix.length) : rawKey;
};

const normalizeCampusFromEmail = (email?: string | null): string | null => {
  if (!email) return null;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;
  if (domain.endsWith('gbu.ac.in')) return 'GBU';
  if (domain.endsWith('gmail.com')) return 'GMAIL';
  return domain.toUpperCase();
};

const parseLocationPayload = (
  raw: string | null
): { lat: number | null; long: number | null; city: string | null; country: string | null; source: string | null } => {
  if (!raw) return { lat: null, long: null, city: null, country: null, source: null };
  try {
    const parsed = JSON.parse(raw) as {
      lat?: number;
      long?: number;
      city?: string;
      country?: string;
      source?: string;
    };

    const lat = typeof parsed.lat === 'number' && Number.isFinite(parsed.lat) ? parsed.lat : null;
    const long = typeof parsed.long === 'number' && Number.isFinite(parsed.long) ? parsed.long : null;
    const city = typeof parsed.city === 'string' ? parsed.city : null;
    const country = typeof parsed.country === 'string' ? parsed.country : null;
    const source = typeof parsed.source === 'string' ? parsed.source : null;

    return { lat, long, city, country, source };
  } catch {
    return { lat: null, long: null, city: null, country: null, source: null };
  }
};

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

const haversineDistanceKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const queueKey = (gender: string, preference: string, topic?: string): string => {
  const base = `matchq:${gender}:${preference}`;
  return topic ? `${base}:${topic}` : base;
};

const buildQueueKeysForCandidate = (candidate: QueueCandidate): string[] => {
  const keys: string[] = [];
  if (candidate.topics.length > 0) {
    for (const topic of candidate.topics) {
      keys.push(queueKey(candidate.gender, candidate.preference, topic));
    }
  }
  keys.push(queueKey(candidate.gender, candidate.preference));
  return [...new Set(keys)];
};

const isValidPreference = (value: unknown): value is 'male' | 'female' | 'everyone' => {
  return value === 'male' || value === 'female' || value === 'everyone';
};

const normalizeQueueCandidate = (
  raw: string | null,
  fallbackUserId: string,
  fallbackGender: string
): QueueCandidate => {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<QueueCandidate>;
      const preference = isValidPreference(parsed.preference) ? parsed.preference : 'everyone';
      const topics = Array.isArray(parsed.topics)
        ? parsed.topics.filter((topic): topic is string => typeof topic === 'string')
        : [];
      return {
        userId: typeof parsed.userId === 'string' ? parsed.userId : fallbackUserId,
        gender: typeof parsed.gender === 'string' ? parsed.gender : fallbackGender,
        preference,
        topics,
        enqueuedAt: typeof parsed.enqueuedAt === 'number' ? parsed.enqueuedAt : Date.now(),
      };
    } catch {
      // fall through to default payload
    }
  }

  return {
    userId: fallbackUserId,
    gender: fallbackGender,
    preference: 'everyone',
    topics: [],
    enqueuedAt: Date.now(),
  };
};

const scanKeys = async (pub: any, patterns: string[]): Promise<string[]> => {
  const found = new Set<string>();
  for (const pattern of patterns) {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await pub.scan(cursor, 'MATCH', pattern, 'COUNT', 250);
      cursor = nextCursor;
      for (const key of keys) {
        found.add(key);
      }
    } while (cursor !== '0');
  }
  return [...found];
};

const scanPatterns = (basePattern: string, keyPrefix: string): string[] => {
  if (!keyPrefix) return [basePattern];
  return [`${keyPrefix}${basePattern}`, basePattern];
};

const listQueueBucketKeys = async (pub: any, keyPrefix: string): Promise<string[]> => {
  const rawKeys = await scanKeys(pub, scanPatterns('matchq:*', keyPrefix));
  const listKeys: string[] = [];

  for (const rawKey of rawKeys) {
    const logicalKey = stripRedisPrefix(rawKey, keyPrefix);
    if (
      logicalKey.startsWith('matchq:heartbeat:') ||
      logicalKey.startsWith('matchq:counter:') ||
      logicalKey.startsWith('matchq:lock:') ||
      logicalKey.startsWith('matchq:metrics:') ||
      logicalKey === 'matchq:stream'
    ) {
      continue;
    }

    try {
      const keyType = await pub.type(logicalKey);
      if (keyType === 'list') {
        listKeys.push(logicalKey);
      }
    } catch {
      // ignore invalid keys
    }
  }

  return [...new Set(listKeys)];
};

const safeDecrementQueueCounter = async (pub: any): Promise<void> => {
  const currentRaw = await pub.get('matchq:counter:queue');
  const current = Number(currentRaw || '0');
  if (Number.isFinite(current) && current > 0) {
    await pub.decr('matchq:counter:queue');
  }
};

const purgeQueueCopiesByUserId = async (pub: any, userId: string, queueBucketKeys: string[]): Promise<number> => {
  if (!userId || queueBucketKeys.length === 0) return 0;

  let removedTotal = 0;

  for (const key of queueBucketKeys) {
    let entries: string[] = [];
    try {
      entries = await pub.lrange(key, 0, -1);
    } catch {
      continue;
    }

    const matchingPayloads = new Set<string>();
    for (const entry of entries) {
      try {
        const parsed = JSON.parse(entry) as { userId?: string };
        if (parsed.userId === userId) {
          matchingPayloads.add(entry);
        }
      } catch {
        // ignore malformed queue entry
      }
    }

    if (matchingPayloads.size === 0) continue;

    const pipeline = pub.pipeline();
    for (const payload of matchingPayloads) {
      pipeline.lrem(key, 0, payload);
    }
    const results = await pipeline.exec();
    for (const [, value] of results || []) {
      if (typeof value === 'number') {
        removedTotal += value;
      }
    }
  }

  return removedTotal;
};

const buildMatchmakingDebugSnapshot = async (filters: QueueDebugFilters) => {
  const pub = redis.getClient();
  const keyPrefix = ((pub as any).options?.keyPrefix as string) || '';

  const [
    dbUsersResult,
    onlineUserIds,
    userRoomMap,
    heartbeatRawKeys,
    lockRawKeys,
    queueBucketKeys,
  ] = await Promise.all([
    database.query<DbUserRow>(
      `SELECT id, email, username, name, status, last_seen as "lastSeen", gender
       FROM users
       ORDER BY created_at DESC`
    ),
    pub.smembers('presence:online_users'),
    pub.hgetall('random:user_rooms'),
    scanKeys(pub, scanPatterns('matchq:heartbeat:*', keyPrefix)),
    scanKeys(pub, scanPatterns('matchq:lock:*', keyPrefix)),
    listQueueBucketKeys(pub, keyPrefix),
  ]);

  const dbUsers = dbUsersResult.rows;
  const dbUserMap = new Map<string, DbUserRow>(dbUsers.map((user) => [user.id, user]));
  const onlineSet = new Set<string>(onlineUserIds);

  const heartbeatUserIds = heartbeatRawKeys
    .map((rawKey) => stripRedisPrefix(rawKey, keyPrefix))
    .map((logicalKey) => logicalKey.replace(/^matchq:heartbeat:/, ''))
    .filter((userId) => Boolean(userId));

  const lockUserIds = lockRawKeys
    .map((rawKey) => stripRedisPrefix(rawKey, keyPrefix))
    .map((logicalKey) => logicalKey.replace(/^matchq:lock:/, ''))
    .filter((userId) => Boolean(userId));

  const heartbeatPipeline = pub.pipeline();
  for (const userId of heartbeatUserIds) {
    heartbeatPipeline.ttl(`matchq:heartbeat:${userId}`);
    heartbeatPipeline.get(`matchq:heartbeat:${userId}`);
  }
  const heartbeatResults = await heartbeatPipeline.exec();

  const heartbeatMap = new Map<string, {
    ttl: number;
    payload: string | null;
    joinedAtIso: string | null;
    lastPingIso: string | null;
  }>();

  heartbeatUserIds.forEach((userId, index) => {
    const ttlRaw = heartbeatResults?.[index * 2]?.[1];
    const payloadRaw = heartbeatResults?.[index * 2 + 1]?.[1];

    const ttl = typeof ttlRaw === 'number' ? ttlRaw : -2;
    const payload = typeof payloadRaw === 'string' ? payloadRaw : null;

    let joinedAtIso: string | null = null;
    if (payload) {
      try {
        const parsed = JSON.parse(payload) as { enqueuedAt?: number };
        if (typeof parsed.enqueuedAt === 'number') {
          joinedAtIso = new Date(parsed.enqueuedAt).toISOString();
        }
      } catch {
        // ignore parse issue
      }
    }

    const lastPingIso = ttl > 0
      ? new Date(Date.now() - Math.max(0, DEFAULT_QUEUE_HEARTBEAT_TTL - ttl) * 1000).toISOString()
      : null;

    heartbeatMap.set(userId, {
      ttl,
      payload,
      joinedAtIso,
      lastPingIso,
    });
  });

  const lockPipeline = pub.pipeline();
  for (const userId of lockUserIds) {
    lockPipeline.ttl(`matchq:lock:${userId}`);
  }
  const lockResults = await lockPipeline.exec();
  const lockTtlMap = new Map<string, number>();
  lockUserIds.forEach((userId, index) => {
    const ttlRaw = lockResults?.[index]?.[1];
    lockTtlMap.set(userId, typeof ttlRaw === 'number' ? ttlRaw : -2);
  });

  const bucketMembershipMap = new Map<string, Set<string>>();
  const bucketJoinedAtMap = new Map<string, number>();

  for (const bucketKey of queueBucketKeys) {
    let entries: string[] = [];
    try {
      entries = await pub.lrange(bucketKey, 0, -1);
    } catch {
      continue;
    }

    for (const entry of entries) {
      try {
        const parsed = JSON.parse(entry) as { userId?: string; enqueuedAt?: number };
        if (!parsed.userId) continue;

        if (!bucketMembershipMap.has(parsed.userId)) {
          bucketMembershipMap.set(parsed.userId, new Set());
        }
        bucketMembershipMap.get(parsed.userId)!.add(bucketKey);

        if (typeof parsed.enqueuedAt === 'number') {
          const existing = bucketJoinedAtMap.get(parsed.userId);
          if (!existing || parsed.enqueuedAt < existing) {
            bucketJoinedAtMap.set(parsed.userId, parsed.enqueuedAt);
          }
        }
      } catch {
        // ignore malformed queue entry
      }
    }
  }

  const allUserIds = new Set<string>([
    ...dbUsers.map((user) => user.id),
    ...onlineUserIds,
    ...Object.keys(userRoomMap),
    ...heartbeatUserIds,
    ...lockUserIds,
    ...bucketMembershipMap.keys(),
  ]);

  const locationPipeline = pub.pipeline();
  const userIdList = [...allUserIds];
  for (const userId of userIdList) {
    locationPipeline.hget(`user:${userId}:meta`, 'location');
  }
  const locationResults = await locationPipeline.exec();

  const locationMap = new Map<string, ReturnType<typeof parseLocationPayload>>();
  userIdList.forEach((userId, index) => {
    const raw = locationResults?.[index]?.[1];
    const locationRaw = typeof raw === 'string' ? raw : null;
    locationMap.set(userId, parseLocationPayload(locationRaw));
  });

  const hasRadiusFilter =
    typeof filters.radiusKm === 'number' && filters.radiusKm > 0 &&
    typeof filters.centerLat === 'number' &&
    typeof filters.centerLong === 'number';

  const stateRank: Record<Exclude<QueueStateFilter, 'all'>, number> = {
    in_queue: 0,
    in_active_room: 1,
    online: 2,
    offline: 3,
  };

  const rows = userIdList.map((userId) => {
    const dbUser = dbUserMap.get(userId);
    const heartbeat = heartbeatMap.get(userId);
    const lockTtl = lockTtlMap.get(userId) ?? -2;
    const location = locationMap.get(userId) || { lat: null, long: null, city: null, country: null, source: null };

    const queued = Boolean(heartbeat && heartbeat.ttl > 0);
    const inActiveRoom = Boolean(userRoomMap[userId]);
    const online = onlineSet.has(userId);

    let state: Exclude<QueueStateFilter, 'all'> = 'offline';
    if (inActiveRoom) {
      state = 'in_active_room';
    } else if (queued) {
      state = 'in_queue';
    } else if (online) {
      state = 'online';
    }

    const campus = normalizeCampusFromEmail(dbUser?.email || null);

    const joinedAtIso =
      heartbeat?.joinedAtIso ||
      (bucketJoinedAtMap.has(userId) ? new Date(bucketJoinedAtMap.get(userId)!).toISOString() : null);

    let distanceKm: number | null = null;
    if (
      hasRadiusFilter &&
      location.lat !== null &&
      location.long !== null &&
      typeof filters.centerLat === 'number' &&
      typeof filters.centerLong === 'number'
    ) {
      distanceKm = haversineDistanceKm(filters.centerLat, filters.centerLong, location.lat, location.long);
    }

    return {
      userId,
      name: dbUser?.name || 'Unknown',
      username: dbUser?.username || null,
      email: dbUser?.email || null,
      gender: dbUser?.gender || null,
      state,
      online,
      queued,
      inActiveRoom,
      activeRoomId: userRoomMap[userId] || null,
      heartbeatKey: `matchq:heartbeat:${userId}`,
      heartbeatTtl: heartbeat?.ttl ?? -2,
      lockKey: `matchq:lock:${userId}`,
      lockTtl,
      hasLock: lockTtl > 0,
      queueBuckets: [...(bucketMembershipMap.get(userId) || new Set())],
      joinedAt: joinedAtIso,
      lastPingAt: heartbeat?.lastPingIso || null,
      city: location.city,
      country: location.country,
      locationSource: location.source,
      lat: location.lat,
      long: location.long,
      campus,
      distanceKm,
      lastSeen: dbUser?.lastSeen || null,
    };
  });

  const cityFilter = filters.city?.trim().toLowerCase();
  const campusFilter = filters.campus?.trim().toLowerCase();

  const filteredRows = rows.filter((row) => {
    if (filters.state !== 'all' && row.state !== filters.state) return false;

    if (cityFilter) {
      const cityText = (row.city || '').toLowerCase();
      if (!cityText.includes(cityFilter)) return false;
    }

    if (campusFilter) {
      const campusText = (row.campus || '').toLowerCase();
      if (!campusText.includes(campusFilter)) return false;
    }

    if (hasRadiusFilter) {
      if (row.distanceKm === null) return false;
      if (typeof filters.radiusKm === 'number' && row.distanceKm > filters.radiusKm) return false;
    }

    return true;
  });

  filteredRows.sort((a, b) => {
    const rankDiff = stateRank[a.state] - stateRank[b.state];
    if (rankDiff !== 0) return rankDiff;

    const aJoin = a.joinedAt ? new Date(a.joinedAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bJoin = b.joinedAt ? new Date(b.joinedAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (aJoin !== bJoin) return aJoin - bJoin;

    return a.userId.localeCompare(b.userId);
  });

  const limitedRows = filteredRows.slice(0, filters.limit);

  const counts = {
    totalUsers: rows.length,
    filteredUsers: filteredRows.length,
    inQueue: rows.filter((row) => row.state === 'in_queue').length,
    inActiveRoom: rows.filter((row) => row.state === 'in_active_room').length,
    online: rows.filter((row) => row.state === 'online').length,
    offline: rows.filter((row) => row.state === 'offline').length,
  };

  return {
    timestamp: new Date().toISOString(),
    filters: {
      state: filters.state,
      city: filters.city || null,
      campus: filters.campus || null,
      centerLat: filters.centerLat ?? null,
      centerLong: filters.centerLong ?? null,
      radiusKm: filters.radiusKm ?? null,
      limit: filters.limit,
    },
    counts,
    users: limitedRows,
  };
};

/**
 * @route   GET /api/v1/admin/stats/live
 * @desc    Get live server stats from Redis and Memory
 * @access  Admin
 */
router.get('/stats/live', async (_req: any, res: any) => {
  try {
    // Get online count from Redis set
    const onlineCount = await redis.getClient().scard('presence:online_users');

    // In a real scenario, we might have more complex socket room tracking
    const activeSessionsResult = await database.query(
      'SELECT COUNT(*) as count FROM sessions WHERE is_active = true AND access_expires_at > CURRENT_TIMESTAMP'
    );

    res.json({
      onlineUsers: onlineCount,
      activeSessions: parseInt(activeSessionsResult.rows[0].count, 10),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error fetching live stats:', error);
    res.status(500).json({ error: 'Failed to fetch live stats' });
  }
});

/**
 * @route   GET /api/v1/admin/stats/growth
 * @desc    Get user growth metrics
 * @access  Admin
 */
router.get('/stats/growth', async (_req: any, res: any) => {
  try {
    const totalUsersResult = await database.query('SELECT COUNT(*) as count FROM users');
    const newUsersTodayResult = await database.query(
      'SELECT COUNT(*) as count FROM users WHERE created_at >= CURRENT_DATE'
    );
    const topVibesResult = await database.query(
      'SELECT bio as vibe, COUNT(*) as count FROM users WHERE bio IS NOT NULL GROUP BY bio ORDER BY count DESC LIMIT 5'
    );

    res.json({
      totalUsers: parseInt(totalUsersResult.rows[0].count, 10),
      newUsersToday: parseInt(newUsersTodayResult.rows[0].count, 10),
      topVibes: topVibesResult.rows,
    });
  } catch (error) {
    logger.error('Error fetching growth stats:', error);
    res.status(500).json({ error: 'Failed to fetch growth stats' });
  }
});

/**
 * @route   GET /api/v1/admin/matchmaking-stats
 * @desc    Get real-time matchmaking telemetry
 * @access  Admin
 */
router.get('/matchmaking-stats', async (_req: any, res: any) => {
  try {
    const stats = await matchmakingTelemetryService.getMatchmakingStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching matchmaking stats:', error);
    // Return safe defaults so the admin dashboard doesn't crash
    res.json({
      timestamp: new Date().toISOString(),
      queues: { totalUsers: 0, bucketCounts: {} },
      metrics: { avgLatencyMs: 0, recentSampleCount: 0, totalMatchedSinceStart: 0, activeRooms: 0, userLocations: [] },
      health: { redisMemoryUsed: 'unknown' },
      error: 'Failed to fetch matchmaking telemetry',
    });
  }
});

/**
 * @route   GET /api/v1/admin/matchmaking-debug
 * @desc    Get per-user live queue diagnostics with filters
 * @access  Admin
 */
router.get('/matchmaking-debug', async (req: any, res: any) => {
  try {
    const rawState = (firstQueryString(req.query.state) || 'all') as QueueStateFilter;
    const state: QueueStateFilter = ['all', 'online', 'in_queue', 'in_active_room', 'offline'].includes(rawState)
      ? rawState
      : 'all';

    const limitRaw = parseOptionalNumber(req.query.limit);
    const limit = Math.max(1, Math.min(500, Math.trunc(limitRaw || 200)));

    const filters: QueueDebugFilters = {
      state,
      city: firstQueryString(req.query.city),
      campus: firstQueryString(req.query.campus),
      centerLat: parseOptionalNumber(req.query.centerLat),
      centerLong: parseOptionalNumber(req.query.centerLong),
      radiusKm: parseOptionalNumber(req.query.radiusKm),
      limit,
    };

    const snapshot = await buildMatchmakingDebugSnapshot(filters);
    res.json(snapshot);
  } catch (error) {
    logger.error('Error fetching matchmaking debug snapshot:', error);
    res.status(500).json({ error: 'Failed to fetch matchmaking debug snapshot' });
  }
});

/**
 * @route   POST /api/v1/admin/matchmaking-actions
 * @desc    Execute queue control actions for live incidents
 * @access  Admin
 */
router.post('/matchmaking-actions', async (req: any, res: any) => {
  try {
    const action = typeof req.body?.action === 'string' ? req.body.action : '';
    const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';

    const allowedActions = ['force_dequeue', 'clear_stale_heartbeat', 'clear_lock', 'force_rematch'];
    if (!allowedActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const pub = redis.getClient();
    const keyPrefix = ((pub as any).options?.keyPrefix as string) || '';

    const heartbeatKey = `matchq:heartbeat:${userId}`;
    const lockKey = `matchq:lock:${userId}`;

    const queueBucketKeys = await listQueueBucketKeys(pub, keyPrefix);
    const heartbeatPayload = await pub.get(heartbeatKey);

    const outcome: Record<string, unknown> = {
      action,
      userId,
      removedHeartbeat: false,
      removedLock: false,
      removedQueueCopies: 0,
      removedRoom: false,
      requeued: false,
    };

    if (action === 'clear_lock') {
      const removedLock = await pub.del(lockKey);
      outcome.removedLock = removedLock > 0;
    }

    if (action === 'clear_stale_heartbeat' || action === 'force_dequeue' || action === 'force_rematch') {
      const removedHeartbeat = await pub.del(heartbeatKey);
      outcome.removedHeartbeat = removedHeartbeat > 0;
      if (removedHeartbeat > 0) {
        await safeDecrementQueueCounter(pub);
      }

      const removedQueueCopies = await purgeQueueCopiesByUserId(pub, userId, queueBucketKeys);
      outcome.removedQueueCopies = removedQueueCopies;
    }

    if (action === 'force_dequeue' || action === 'force_rematch') {
      const removedLock = await pub.del(lockKey);
      outcome.removedLock = Number(outcome.removedLock) > 0 || removedLock > 0;
    }

    if (action === 'force_rematch') {
      const roomId = await pub.hget('random:user_rooms', userId);
      if (roomId) {
        const roomRaw = await pub.hget('random:rooms', roomId);
        const pipeline = pub.pipeline();
        pipeline.hdel('random:user_rooms', userId);

        if (roomRaw) {
          try {
            const room = JSON.parse(roomRaw) as { users?: string[] };
            const otherUserId = Array.isArray(room.users)
              ? room.users.find((id) => id !== userId)
              : undefined;
            if (otherUserId) {
              pipeline.hdel('random:user_rooms', otherUserId);
            }
          } catch {
            // ignore malformed room payload
          }
        }

        pipeline.hdel('random:rooms', roomId);
        await pipeline.exec();
        outcome.removedRoom = true;

        const matchedCounterRaw = await pub.get('matchq:counter:matched');
        const matchedCounter = Number(matchedCounterRaw || '0');
        if (Number.isFinite(matchedCounter) && matchedCounter > 0) {
          await pub.decr('matchq:counter:matched');
        }
      }

      const dbUserResult = await database.query<{ id: string; gender: string | null }>(
        'SELECT id, gender FROM users WHERE id = $1 LIMIT 1',
        [userId]
      );
      if (dbUserResult.rowCount === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const fallbackGender = dbUserResult.rows[0].gender || 'prefer_not_to_say';
      const candidate = normalizeQueueCandidate(heartbeatPayload, userId, fallbackGender);
      const candidatePayload = JSON.stringify({
        ...candidate,
        enqueuedAt: Date.now(),
      });

      const candidateQueueKeys = buildQueueKeysForCandidate(candidate);
      const pipeline = pub.pipeline();
      pipeline.set(heartbeatKey, candidatePayload, 'EX', DEFAULT_QUEUE_HEARTBEAT_TTL);
      for (const bucketKey of candidateQueueKeys) {
        pipeline.lpush(bucketKey, candidatePayload);
        pipeline.expire(bucketKey, 120);
      }
      pipeline.incr('matchq:counter:queue');
      pipeline.xadd('matchq:stream', 'MAXLEN', '~', '2000', '*', 'userData', candidatePayload);
      await pipeline.exec();
      outcome.requeued = true;
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      outcome,
    });
  } catch (error) {
    logger.error('Error executing matchmaking action:', error);
    res.status(500).json({ error: 'Failed to execute matchmaking action' });
  }
});

/**
 * @route   GET /api/v1/admin/reports
 * @desc    Get all reports
 * @access  Admin
 */
router.get('/reports', async (req: any, res: any) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const offset = parseInt(req.query.offset as string, 10) || 0;
    const result = await reportService.getAllReports(limit, offset);
    res.json(result);
  } catch (error) {
    logger.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

/**
 * @route   PATCH /api/v1/admin/reports/:id
 * @desc    Update report status
 * @access  Admin
 */
router.patch('/reports/:id', async (req: any, res: any) => {
  try {
    const { status } = req.body;
    if (!['resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const report = await reportService.updateReportStatus(req.params.id, status);
    res.json(report);
  } catch (error) {
    logger.error('Error updating report:', error);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

/**
 * @route   POST /api/v1/admin/users/:id/ban
 * @desc    Ban a user (deactivate)
 * @access  Admin
 */
router.post('/users/:id/ban', async (req: any, res: any) => {
  try {
    const userId = req.params.id;
    // In this project, deactivate is equivalent to ban
    await database.query('UPDATE users SET is_active = false WHERE id = $1', [userId]);

    // Also kill their sessions
    await database.query('UPDATE sessions SET is_active = false WHERE user_id = $1', [userId]);

    logger.info(`User ${userId} banned by admin ${req.user.id}`);
    res.json({ message: 'User banned' });
  } catch (error) {
    logger.error('Error banning user:', error);
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

export default router;
