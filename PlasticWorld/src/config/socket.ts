import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwtService from '../services/jwt.service';
import sessionService from '../services/session.service';
import userService from '../services/user.service';
import messageService from '../services/message.service';
import matchService from '../services/match.service';
import haveliService from '../services/haveli.service';
import logger from '../utils/logger';
import { createAdapter } from '@socket.io/redis-adapter';
import redisClient from './redis';
import geoip from 'geoip-lite';
import { ExtendedError } from 'socket.io/dist/namespace';

interface SocketUser {
  userId: string;
  deviceId: string;
  username?: string;
  name: string;
  profilePictureUrl?: string;
  bio?: string | null;
  gender: 'male' | 'female' | 'non-binary' | 'other' | 'prefer_not_to_say';
}

interface AuthenticatedSocket extends Socket {
  user?: SocketUser;
}

function parseHeaderNumber(value?: string | string[]): number | null {
  const raw = firstHeaderValue(value);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function isValidLatLong(lat: number, long: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(long) &&
    lat >= -90 &&
    lat <= 90 &&
    long >= -180 &&
    long <= 180
  );
}

function firstHeaderValue(value?: string | string[]): string | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] || null) : value;
}

function normalizeIp(rawIp?: string | null): string | null {
  if (!rawIp) return null;
  const first = rawIp.split(',')[0]?.trim();
  if (!first) return null;

  // Handle IPv6 in brackets + optional port: [::1]:12345
  const bracketMatch = first.match(/^\[(.*)\](?::\d+)?$/);
  let ip = bracketMatch ? bracketMatch[1] : first;

  // Handle IPv4 with port: 1.2.3.4:5678
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) {
    ip = ip.split(':')[0];
  }

  // Handle IPv6-mapped IPv4: ::ffff:1.2.3.4
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }

  return ip;
}

function isPrivateOrLoopbackIp(ip?: string | null): boolean {
  if (!ip) return true;

  // IPv6 local ranges
  if (
    ip === '::1' ||
    ip === '::' ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    ip.startsWith('fe80:')
  ) {
    return true;
  }

  // IPv4 private + loopback + link-local
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function resolveClientIp(socket: AuthenticatedSocket): string | null {
  const headers = socket.handshake.headers || {};
  const candidates = [
    firstHeaderValue(headers['cf-connecting-ip'] as string | string[]),
    firstHeaderValue(headers['x-real-ip'] as string | string[]),
    firstHeaderValue(headers['true-client-ip'] as string | string[]),
    firstHeaderValue(headers['x-forwarded-for'] as string | string[]),
    socket.handshake.address,
  ]
    .map((ip) => normalizeIp(ip))
    .filter((ip): ip is string => Boolean(ip));

  if (candidates.length === 0) return null;

  // Prefer the first public IP, fall back to first candidate.
  return candidates.find((ip) => !isPrivateOrLoopbackIp(ip)) || candidates[0];
}

function resolveEdgeGeo(socket: AuthenticatedSocket): { lat: number; long: number } | null {
  const headers = socket.handshake.headers || {};
  const lat = parseHeaderNumber(headers['x-vercel-ip-latitude'] as string | string[]);
  const long = parseHeaderNumber(headers['x-vercel-ip-longitude'] as string | string[]);
  if (lat === null || long === null) return null;
  if (!isValidLatLong(lat, long)) return null;
  return { lat, long };
}

// Store active users (userId -> Set of socketIds)
const activeUsers = new Map<string, Set<string>>();

// Store typing indicators (conversationId -> Set of userIds)
const typingUsers = new Map<string, Set<string>>();

// Store disconnect timeouts for connection state recovery
const disconnectTimeouts = new Map<string, NodeJS.Timeout>();

// Random chat queue entry

interface QueuedUser {
  userId: string;
  mode: 'text' | 'video';
  topics: string[];
  gender: string;
  preference: 'male' | 'female' | 'everyone';
  enqueuedAt?: number;
}

// Queue of users waiting for a random partner
// const randomQueue: QueuedUser[] = [];

// Map userId -> current random roomId (if any)
// const userToRandomRoom = new Map<string, string>();

// Map roomId -> room metadata
// const randomRooms = new Map<string, RandomRoom>();

// Ephemeral media tracking (roomId -> Set of filenames)
const roomMedia = new Map<string, Set<string>>();

// ─── Partitioned Queue Helpers ───────────────────────────────────────

/**
 * Build the Redis list key for a partitioned queue bucket.
 * Format: `matchq:<mode>:<gender>:<preference>[:<topic>]`
 * e.g. `matchq:video:male:female:anime` or `matchq:text:female:everyone`
 */
function queueKey(mode: 'text' | 'video', gender: string, preference: string, topic?: string): string {
  const base = `matchq:${mode}:${gender}:${preference}`;
  return topic ? `${base}:${topic}` : base;
}

/**
 * Given a user's gender + preference, return the inverse queue key(s)
 * we should try to pop from.
 */
function inverseQueueKeys(mode: 'text' | 'video', gender: string, preference: string, topic?: string): string[] {
  const keys: string[] = [];

  if (preference === 'everyone') {
    if (topic) {
      keys.push(queueKey(mode, 'male', 'everyone', topic));
      keys.push(queueKey(mode, 'female', 'everyone', topic));
      keys.push(queueKey(mode, 'non-binary', 'everyone', topic));
      keys.push(queueKey(mode, 'other', 'everyone', topic));
      keys.push(queueKey(mode, 'prefer_not_to_say', 'everyone', topic));
      keys.push(queueKey(mode, 'male', gender, topic));
      keys.push(queueKey(mode, 'female', gender, topic));
      keys.push(queueKey(mode, 'non-binary', gender, topic));
      keys.push(queueKey(mode, 'other', gender, topic));
      keys.push(queueKey(mode, 'prefer_not_to_say', gender, topic));
    }
    keys.push(queueKey(mode, 'male', 'everyone'));
    keys.push(queueKey(mode, 'female', 'everyone'));
    keys.push(queueKey(mode, 'non-binary', 'everyone'));
    keys.push(queueKey(mode, 'other', 'everyone'));
    keys.push(queueKey(mode, 'prefer_not_to_say', 'everyone'));
    keys.push(queueKey(mode, 'male', gender));
    keys.push(queueKey(mode, 'female', gender));
    keys.push(queueKey(mode, 'non-binary', gender));
    keys.push(queueKey(mode, 'other', gender));
    keys.push(queueKey(mode, 'prefer_not_to_say', gender));
  } else {
    if (topic) {
      keys.push(queueKey(mode, preference, gender, topic));
    }
    keys.push(queueKey(mode, preference, gender));
  }

  return [...new Set(keys)];
}

/**
 * Helper to acquire a match lock with retries
 */
async function acquireMatchLock(pub: any, userId: string, retries = 10, delayMs = 150): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    const lock = await pub.set(`matchq:lock:${userId}`, '1', 'EX', 5, 'NX');
    if (lock) return true;
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return false;
}

const CLEANUP_RANDOM_ROOM_LUA = `
-- KEYS[1] = random:user_rooms hash
-- KEYS[2] = random:rooms hash
-- ARGV[1] = roomId
-- ARGV[2] = primaryUserId
-- ARGV[3] = otherUserId (optional)

local roomId = ARGV[1]
local primaryUserId = ARGV[2]
local otherUserId = ARGV[3]

local removedPrimary = 0
if redis.call('HGET', KEYS[1], primaryUserId) == roomId then
  redis.call('HDEL', KEYS[1], primaryUserId)
  removedPrimary = 1
end

local removedOther = 0
if otherUserId ~= '' and redis.call('HGET', KEYS[1], otherUserId) == roomId then
  redis.call('HDEL', KEYS[1], otherUserId)
  removedOther = 1
end

local removedRoom = 0
if redis.call('HGET', KEYS[2], roomId) then
  redis.call('HDEL', KEYS[2], roomId)
  removedRoom = 1
end

return { removedPrimary, removedOther, removedRoom }
`;

async function cleanupRandomRoomState(pub: any, roomId: string, primaryUserId: string, otherUserId?: string): Promise<{
  removedPrimary: boolean;
  removedOther: boolean;
  removedRoom: boolean;
}> {
  const result = await pub.eval(
    CLEANUP_RANDOM_ROOM_LUA,
    2,
    'random:user_rooms',
    'random:rooms',
    roomId,
    primaryUserId,
    otherUserId || ''
  ) as [number, number, number];

  return {
    removedPrimary: Number(result?.[0] || 0) === 1,
    removedOther: Number(result?.[1] || 0) === 1,
    removedRoom: Number(result?.[2] || 0) === 1,
  };
}

async function resolveOtherUserIdForRoom(
  pub: any,
  io: SocketIOServer,
  roomId: string,
  currentUserId: string
): Promise<string | undefined> {
  try {
    const roomRaw = await pub.hget('random:rooms', roomId);
    if (roomRaw) {
      const parsed = JSON.parse(roomRaw) as { users?: string[] };
      if (Array.isArray(parsed.users)) {
        const otherUserId = parsed.users.find((id) => id !== currentUserId);
        if (otherUserId) return otherUserId;
      }
    }
  } catch {
    // fall through to socket-room lookup
  }

  const socketsInRoom = await io.in(roomId).fetchSockets();
  for (const s of socketsInRoom) {
    const roomUserId = (s.data as { userId?: string } | undefined)?.userId;
    if (roomUserId && roomUserId !== currentUserId) {
      return roomUserId;
    }
  }

  return undefined;
}

// ─── Atomic Lua Script for Match-or-Enqueue ─────────────────────────
// This script atomically: checks inverse queues for a valid partner,
// validates heartbeat, acquires lock, and either matches or enqueues.
// Eliminates ALL race conditions from the previous multi-roundtrip approach.
//
// IMPORTANT: ioredis adds keyPrefix to KEYS[] automatically, but NOT to
// hardcoded key strings inside Lua. We pass the prefix as ARGV[8] and
// prepend it to all dynamic key references.
const MATCH_OR_ENQUEUE_LUA = `
-- KEYS: [1..N] = inverse queue keys to check, [N+1..M] = my enqueue keys
-- ARGV: [1] = my userId, [2] = my JSON data, [3] = number of inverse keys,
--       [4] = heartbeat key, [5] = heartbeat TTL, [6] = user_rooms hash key,
--       [7] = queue counter key, [8] = key prefix (e.g. 'plasticworld:'),
--       [9] = allow enqueue fallback (1 = enqueue on miss, 0 = match-only)

local myUserId = ARGV[1]
local myData = ARGV[2]
local numInverseKeys = tonumber(ARGV[3])
local heartbeatKey = ARGV[4]
local heartbeatTTL = tonumber(ARGV[5])
local userRoomsKey = ARGV[6]
local queueCounterKey = ARGV[7]
local prefix = ARGV[8]
local allowEnqueueFallback = tonumber(ARGV[9]) == 1

-- Phase 1: Try to find a valid partner from inverse queues
for i = 1, numInverseKeys do
  local key = KEYS[i]
  local qLen = redis.call('LLEN', key)
  local skipList = {}

  for j = 1, qLen do
    local popped = redis.call('RPOP', key)
    if not popped then break end

    local partnerData = cjson.decode(popped)
    local partnerUserId = partnerData['userId']

    -- Skip self
    if partnerUserId == myUserId then
      skipList[#skipList + 1] = popped
    else
      -- Validate: check heartbeat exists (not a ghost)
      local partnerHB = redis.call('GET', prefix .. 'matchq:heartbeat:' .. partnerUserId)
      if not partnerHB then
        -- Ghost entry, discard silently (don't put back)
      else
        -- Validate: check not already matched
        local existingRoom = redis.call('HGET', prefix .. 'random:user_rooms', partnerUserId)
        if existingRoom then
          -- Already matched, discard
        else
          -- Try to lock the partner atomically
          local lockOk = redis.call('SET', prefix .. 'matchq:lock:' .. partnerUserId, '1', 'EX', 5, 'NX')
          if lockOk then
            -- MATCH FOUND! Put back any skipped users first
            for _, skipped in ipairs(skipList) do
              redis.call('RPUSH', key, skipped)
            end
            -- Decrement queue counter for partner leaving
            redis.call('DECR', prefix .. 'matchq:counter:queue')
            -- Delete partner heartbeat (they're matched now)
            redis.call('DEL', prefix .. 'matchq:heartbeat:' .. partnerUserId)
            -- Return partner data
            return {'MATCHED', popped}
          else
            -- Could not lock, put back
            skipList[#skipList + 1] = popped
          end
        end
      end
    end
  end

  -- Put back all skipped valid users (in reverse to maintain order)
  for k = #skipList, 1, -1 do
    redis.call('RPUSH', key, skipList[k])
  end
end

-- Existing queued users retried by the stream consumer should only probe for
-- a match. Re-enqueuing them here duplicates list entries and queue counters.
if not allowEnqueueFallback then
  return {'NO_MATCH', ''}
end

-- Phase 2: No match found — enqueue myself
-- Set heartbeat
redis.call('SET', prefix .. heartbeatKey, myData, 'EX', heartbeatTTL)

-- Push to all my queue keys (keys after the inverse keys)
for i = numInverseKeys + 1, #KEYS do
  redis.call('LPUSH', KEYS[i], myData)
  redis.call('EXPIRE', KEYS[i], 120) -- Auto-cleanup stale buckets after 2 min
end

-- Increment queue counter
redis.call('INCR', prefix .. 'matchq:counter:queue')

return {'QUEUED', ''}
`;


/**
 * Emit stats about the matching system to all connected users
 */
async function emitMatchingStats(io: any) {
  try {
    const pub = redisClient.getClient();
    const pipeline = pub.pipeline();
    pipeline.get('matchq:counter:queue');
    pipeline.get('matchq:counter:matched');
    const results = await pipeline.exec();
    const queueLen = parseInt((results?.[0]?.[1] as string) || '0');
    const matchedLen = parseInt((results?.[1]?.[1] as string) || '0');
    const stats = {
      online: activeUsers.size,
      inQueue: Math.max(0, queueLen),
      matched: Math.max(0, matchedLen),
    };
    io.emit('random:stats', stats);
  } catch (e) { /* ignore */ }
}

/**
 * Track a file uploaded to a specific room
 */
export function trackRoomMedia(roomId: string, filename: string) {
  if (!roomMedia.has(roomId)) {
    roomMedia.set(roomId, new Set());
  }
  roomMedia.get(roomId)!.add(filename);
}

/**
 * Clean up all media files for a room
 */
async function cleanupRoomMedia(roomId: string) {
  try {
    const files = roomMedia.get(roomId);
    if (!files || files.size === 0) return;

    logger.info(`Cleaning up ephemeral media for room ${roomId}`, { count: files.size });

    const uploadsDir = path.join(__dirname, '../../public/uploads');

    for (const filename of files) {
      const filePath = path.join(uploadsDir, filename);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    }

    roomMedia.delete(roomId);
  } catch (error) {
    logger.error(`Failed to cleanup room media for ${roomId}`, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Socket authentication middleware
 */
export const socketAuth = async (socket: AuthenticatedSocket, next: (err?: ExtendedError) => void) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    // Verify token
    const payload = jwtService.verifyAccessToken(token);

    // Get session
    const accessTokenHash = jwtService.hashToken(token);
    const session = await sessionService.getSessionByAccessToken(accessTokenHash);

    if (!session || !session.isActive) {
      return next(new Error('Invalid or inactive session'));
    }

    // Check if session is expired
    if (new Date() > new Date(session.accessExpiresAt)) {
      return next(new Error('Session expired'));
    }

    // Get user
    const user = await userService.getUserById(payload.userId);

    if (!user || !user.isActive) {
      return next(new Error('User not found or inactive'));
    }

    // Update session last used
    await sessionService.updateLastUsed(session.id);

    // Update user status to online
    await userService.updateStatus(user.id, 'online');

    // Attach user to socket
    socket.user = {
      userId: user.id,
      deviceId: payload.deviceId,
      username: user.username,
      name: user.name,
      profilePictureUrl: user.profilePictureUrl,
      bio: user.bio || null,
      gender: user.gender || 'prefer_not_to_say',
    };

    next();
  } catch (error) {
    logger.error('Socket authentication failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      socketId: socket.id,
    });
    next(new Error('Authentication failed'));
  }
};

/**
 * Initialize Socket.io server
 */

/**
 * Execute the atomic Lua match-or-enqueue script.
 * Returns { matched: true, partnerData: string } or { matched: false }.
 */
async function atomicMatchOrEnqueue(
  pub: any,
  user: QueuedUser,
  options?: { allowEnqueueFallback?: boolean }
): Promise<{ matched: true; partnerData: string } | { matched: false }> {
  const { userId, mode, gender, preference, topics } = user;
  const myData = JSON.stringify(user);
  const allowEnqueueFallback = options?.allowEnqueueFallback !== false;

  // Build inverse keys (where we look for a partner)
  const inverseKeys: string[] = [];
  if (topics && topics.length > 0) {
    for (const topic of topics) {
      inverseKeys.push(...inverseQueueKeys(mode, gender, preference, topic));
    }
  }
  inverseKeys.push(...inverseQueueKeys(mode, gender, preference));
  // Deduplicate
  const uniqueInverseKeys = [...new Set(inverseKeys)];

  // Build my enqueue keys (where I'll sit if no match)
  const myKeys: string[] = [];
  if (topics && topics.length > 0) {
    for (const topic of topics) {
      myKeys.push(queueKey(mode, gender, preference, topic));
    }
  }
  myKeys.push(queueKey(mode, gender, preference));
  const uniqueMyKeys = [...new Set(myKeys)];

  // All KEYS = inverse keys + my enqueue keys
  const allKeys = [...uniqueInverseKeys, ...uniqueMyKeys];

  // Get the key prefix from the Redis client options
  const keyPrefix = (pub.options?.keyPrefix) || '';

  const result = await pub.eval(
    MATCH_OR_ENQUEUE_LUA,
    allKeys.length,
    ...allKeys,
    userId,                          // ARGV[1]
    myData,                          // ARGV[2]
    uniqueInverseKeys.length.toString(), // ARGV[3]
    `matchq:heartbeat:${userId}`,    // ARGV[4]
    '30',                            // ARGV[5] heartbeat TTL
    'random:user_rooms',             // ARGV[6]
    'matchq:counter:queue',          // ARGV[7]
    keyPrefix,                       // ARGV[8] key prefix
    allowEnqueueFallback ? '1' : '0' // ARGV[9]
  );

  if (result && result[0] === 'MATCHED') {
    return { matched: true, partnerData: result[1] };
  }
  return { matched: false };
}

/**
 * Finalize a match: create room, notify both users, record in DB.
 */
async function finalizeMatch(
  io: SocketIOServer,
  pub: any,
  userA: QueuedUser,
  userB: QueuedUser,
  topic: string
): Promise<void> {
  const roomId = `random:${[userA.userId, userB.userId].sort().join(':')}:${Date.now()}`;

  // Calculate and record latencies for telemetry
  const now = Date.now();
  const pipeline = pub.pipeline();
  
  if (userA.enqueuedAt) {
    pipeline.lpush('matchq:metrics:latencies', (now - userA.enqueuedAt).toString());
  }
  if (userB.enqueuedAt) {
    pipeline.lpush('matchq:metrics:latencies', (now - userB.enqueuedAt).toString());
  }
  pipeline.ltrim('matchq:metrics:latencies', 0, 99); // Keep last 100

  pipeline.hset('random:user_rooms', userA.userId, roomId);
  pipeline.hset('random:user_rooms', userB.userId, roomId);
  pipeline.hset('random:rooms', roomId, JSON.stringify({
    id: roomId,
    users: [userA.userId, userB.userId],
    mode: userA.mode,
    topic: topic || undefined,
  }));
  // Remove heartbeats and explicit locks (they're matched now)
  pipeline.del(`matchq:heartbeat:${userA.userId}`);
  pipeline.del(`matchq:heartbeat:${userB.userId}`);
  pipeline.del(`matchq:lock:${userA.userId}`);
  pipeline.del(`matchq:lock:${userB.userId}`);
  pipeline.incr('matchq:counter:matched');
  await pipeline.exec();

  // Batch profile lookup (single Promise.all instead of sequential)
  const [profileA, profileB] = await Promise.all([
    userService.getPublicUserProfile(userA.userId),
    userService.getPublicUserProfile(userB.userId),
  ]);

  // Join socket rooms
  io.in(`user:${userA.userId}`).socketsJoin(roomId);
  io.in(`user:${userB.userId}`).socketsJoin(roomId);

  // Notify both users
  io.to(`user:${userA.userId}`).emit('random:matched', { roomId, partner: profileB, topic, mode: userA.mode });
  io.to(`user:${userB.userId}`).emit('random:matched', { roomId, partner: profileA, topic, mode: userB.mode });

  // Fire-and-forget DB recording (non-blocking)
  Promise.all([
    userService.incrementRoomsEntered(userA.userId),
    userService.incrementRoomsEntered(userB.userId),
    matchService.recordMatch(userA.userId, userB.userId, roomId, topic || undefined),
  ]).catch(err => logger.error('Failed to record match in DB', err));

  emitMatchingStats(io);
}

/**
 * Redis Streams-based background sweep via consumer groups.
 * Replaces the old SCAN-based sweep that blocked Redis at scale.
 *
 * When a user fails instant matching, they are added to a Redis Stream.
 * This consumer reads from the stream and retries matching them.
 * Multiple server instances can each run a consumer — Redis handles load balancing.
 */
async function streamSweepConsumer(
  io: SocketIOServer,
  pub: any,
  options?: { blockMs?: number; count?: number }
): Promise<void> {
  const streamKey = 'matchq:stream';
  const groupName = 'matchmaker';
  const consumerName = `worker-${process.pid}`;
  const blockMs = options?.blockMs ?? 1000;
  const count = options?.count ?? 10;

  try {
    // Read up to 10 pending match requests, block for 1s if none available
    const results = await pub.xreadgroup(
      'GROUP', groupName, consumerName,
      'COUNT', count, 'BLOCK', blockMs,
      'STREAMS', streamKey, '>'
    );

    if (!results || results.length === 0) return;

    const entries = results[0][1]; // [[id, [field, value, ...]], ...]

    for (const [entryId, fields] of entries) {
      try {
        // Parse fields array into object
        const data: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) {
          data[fields[i]] = fields[i + 1];
        }

        const candidate: QueuedUser = JSON.parse(data.userData);

        // Validate: heartbeat still alive? Not already matched?
        const pipeline = pub.pipeline();
        pipeline.get(`matchq:heartbeat:${candidate.userId}`);
        pipeline.hget('random:user_rooms', candidate.userId);
        const checks = await pipeline.exec();

        const heartbeat = checks?.[0]?.[1];
        const existingRoom = checks?.[1]?.[1];

        if (!heartbeat || existingRoom) {
          // Ghost or already matched, ACK and skip
          await pub.xack(streamKey, groupName, entryId);
          continue;
        }

        // Try atomic match without re-enqueuing: the candidate is already in
        // the queue from their original join request.
        const matchResult = await atomicMatchOrEnqueue(pub, candidate, {
          allowEnqueueFallback: false,
        });

        if (matchResult.matched) {
          const partner: QueuedUser = JSON.parse(matchResult.partnerData);
          const sharedTopics = candidate.topics?.filter((t: string) => partner.topics?.includes(t)) || [];
          const topic = sharedTopics[0] || '';

          // The Lua script already decremented the queue counter for the partner.
          // Now decrement for the candidate who also left the queue.
          await pub.decr('matchq:counter:queue');
          // Remove candidate's heartbeat (they're matched now)
          await pub.del(`matchq:heartbeat:${candidate.userId}`);

          logger.info('Stream consumer matched users', {
            userA: candidate.userId,
            userB: partner.userId,
            topic
          });

          await finalizeMatch(io, pub, candidate, partner, topic);
        }
        // If not matched, leave the existing queue entry untouched. The user
        // is already waiting in their queue buckets from the original join.

        // ACK the entry regardless
        await pub.xack(streamKey, groupName, entryId);

      } catch (entryErr) {
        logger.error('Stream consumer entry error', { entryId, error: entryErr });
        // ACK even on error to prevent infinite retries on bad data
        await pub.xack(streamKey, groupName, entryId).catch(() => {});
      }
    }
  } catch (error: any) {
    // Ignore NOGROUP error on first run (group not yet created)
    if (error?.message?.includes('NOGROUP')) return;
    logger.error('Stream sweep consumer error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Initialize the Redis Stream and consumer group for matchmaking.
 */
async function initMatchmakerStream(pub: any): Promise<void> {
  const streamKey = 'matchq:stream';
  try {
    // Create the consumer group. MKSTREAM creates the stream if it doesn't exist.
    await pub.xgroup('CREATE', streamKey, 'matchmaker', '0', 'MKSTREAM');
    logger.info('Matchmaker stream consumer group created');
  } catch (error: any) {
    // BUSYGROUP = group already exists, which is fine
    if (!error.message?.includes('BUSYGROUP')) {
      logger.error('Failed to create matchmaker stream group', { error });
    }
  }
}

/**
 * Background worker: emits stats, runs stream consumer, trims stream.
 */
export function startMatchmakerWorker(io: SocketIOServer, pubClient: any) {
  // Initialize stream & consumer group
  initMatchmakerStream(pubClient);

  // Emit stats every 5s
  setInterval(() => emitMatchingStats(io), 5000);

  // Run stream consumer every 2s (replaces the old SCAN-based sweep)
  setInterval(() => streamSweepConsumer(io, pubClient), 2000);

  // Trim the stream periodically to prevent memory leaks (~every 30s)
  setInterval(async () => {
    try {
      await pubClient.xtrim('matchq:stream', 'MAXLEN', '~', 1000);
    } catch (e) { /* ignore */ }
  }, 30000);

  // Initialize counters if not present
  pubClient.setnx('matchq:counter:queue', '0');
  pubClient.setnx('matchq:counter:matched', '0');
}

export function initializeSocket(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        const defaultOrigins = [
          'http://localhost:3000',
          'http://localhost:8080',
          'http://localhost:8081',
          'http://localhost:8082',
          'http://localhost:8083', // For messaging test page
          'http://localhost:5173',
          'https://yaduraj.me',
          'https://muhdikhai.yaduraj.me',
          'https://batchit.yaduraj.me',
        ];

        let allowedOrigins: string[] = defaultOrigins;
        if (process.env.CORS_ORIGIN) {
          const productionOrigins = process.env.CORS_ORIGIN.split(',').map((o: string) => o.trim());
          allowedOrigins = [...new Set([...defaultOrigins, ...productionOrigins])];
        }

        if (!origin) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin) || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware

  const pubClient = redisClient.getClient();
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  startMatchmakerWorker(io, pubClient);

  io.use(socketAuth);


  io.on('connection', (socket: AuthenticatedSocket) => {
    if (!socket.user) {
      socket.disconnect();
      return;
    }

    const { userId, name } = socket.user;
    socket.data.userId = userId;

    logger.info('Socket connected', { userId, socketId: socket.id });

    // Connection state recovery: Clear any pending disconnect timeout
    if (disconnectTimeouts.has(userId)) {
      clearTimeout(disconnectTimeouts.get(userId)!);
      disconnectTimeouts.delete(userId);
      logger.info('User reconnected within recovery window, canceling cleanup', { userId });
    }

    // Add user to active users
    if (!activeUsers.has(userId)) {
      activeUsers.set(userId, new Set());
      // Mark globally online in Redis for API visibility
      pubClient.sadd('presence:online_users', userId).catch(err => logger.error('Presence SADD failed', err));
    }
    activeUsers.get(userId)!.add(socket.id);
    
    // Geo telemetry priority:
    // 1) Edge headers (Vercel etc), 2) IP lookup, 3) optional browser update event later.
    const resolvedIp = resolveClientIp(socket);
    const edgeGeo = resolveEdgeGeo(socket);
    if (edgeGeo) {
      pubClient.geoadd('presence:geo', edgeGeo.long, edgeGeo.lat, userId).catch((err) => logger.warn('Geo telemetry GEOADD failed', { error: err }));
      pubClient
        .hset(
          `user:${userId}:meta`,
          'location',
          JSON.stringify({
            lat: edgeGeo.lat,
            long: edgeGeo.long,
            source: 'edge-header',
            ip: resolvedIp,
          })
        )
        .catch(() => {});
    } else {
      const lookupIp = !resolvedIp || resolvedIp === '::1' || resolvedIp === '127.0.0.1'
        ? '122.161.48.1' // Local/dev fallback to keep telemetry visible
        : resolvedIp;
      const geo = geoip.lookup(lookupIp);
      if (geo?.ll?.length === 2) {
        const [lat, long] = geo.ll;
        if (isValidLatLong(lat, long)) {
          pubClient.geoadd('presence:geo', long, lat, userId).catch((err) => logger.warn('Geo telemetry GEOADD failed', { error: err }));
          // Store user's last known location for API visibility
          pubClient.hset(`user:${userId}:meta`, 'location', JSON.stringify({ lat, long, city: geo.city, country: geo.country, source: 'geoip', ip: resolvedIp })).catch(() => {});
        }
      } else {
        logger.debug('Geo lookup unavailable for socket connection', { userId, ip: resolvedIp });
      }
    }

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Notify everyone that user is online and total count
    io.emit('user:online', { userId, name });
    io.emit('presence:count', { count: activeUsers.size });

    // Optional browser-provided geolocation fallback (when client has permission).
    socket.on('presence:geo:update', async (payload: { lat?: number; long?: number }) => {
      try {
        const lat = Number(payload?.lat);
        const long = Number(payload?.long);
        if (!isValidLatLong(lat, long)) return;

        await pubClient.geoadd('presence:geo', long, lat, userId);
        await pubClient.hset(
          `user:${userId}:meta`,
          'location',
          JSON.stringify({ lat, long, source: 'browser', ip: resolvedIp })
        );
      } catch (error) {
        logger.warn('Failed to process browser geo update', {
          error: error instanceof Error ? error.message : String(error),
          userId,
        });
      }
    });

    /**
     * Random chat: join the gentle queue
     */
    socket.on('random:join', async (payload?: { topics?: string[]; preference?: 'male' | 'female' | 'everyone'; mode?: 'text' | 'video' }) => {
      let lockMeAcquired = false;
      let queuedForDeferredMatch = false;
      const pub = redisClient.getClient();
      try {
        const freshUser = await userService.getUserById(userId);
        const hasGender = Boolean(freshUser?.gender);
        const hasBio = Boolean(freshUser?.bio && freshUser.bio.trim().length > 0);
        if (!freshUser || !freshUser.isActive || !hasGender || !hasBio) {
          socket.emit('random:error', {
            error: 'Please complete your profile (gender and bio) before matching.',
          });
          return;
        }

        // Refresh socket profile snapshot in case user updated onboarding data mid-session.
        if (socket.user) {
          socket.user.username = freshUser.username;
          socket.user.name = freshUser.name;
          socket.user.profilePictureUrl = freshUser.profilePictureUrl;
          socket.user.bio = freshUser.bio || null;
          socket.user.gender = freshUser.gender || 'prefer_not_to_say';
        }

        const userTopics = payload?.topics || [];
        const preference = payload?.preference || 'everyone';
        const mode = payload?.mode === 'text' ? 'text' : 'video';
        const userGender = freshUser.gender || 'prefer_not_to_say';

        // 1. If user already has an active room, rejoin it
        const existingRoomId = await pub.hget('random:user_rooms', userId);
        if (existingRoomId) {
          const roomStr = await pub.hget('random:rooms', existingRoomId);
          if (roomStr) {
            const room = JSON.parse(roomStr);
            if (!Array.isArray(room?.users) || !room.users.includes(userId)) {
              await pub.hdel('random:user_rooms', userId);
            } else {
              const partnerId = room.users.find((id: string) => id !== userId);
              const partner = partnerId ? await userService.getPublicUserProfile(partnerId) : null;
              socket.join(existingRoomId);
              socket.emit('random:matched', {
                roomId: existingRoomId,
                partner,
                topic: room.topic,
                mode: room.mode || mode,
              });
              return;
            }
          }
          // Stale room pointer, clean it
          await pub.hdel('random:user_rooms', userId);
        }

        const lockMe = await acquireMatchLock(pub, userId, 8, 120);
        if (!lockMe) {
          // Don't silently drop join requests just because lock contention happened.
          // We proceed in degraded mode and rely on downstream validation/atomic Lua.
          logger.warn('random:join lock timeout, proceeding without self-lock', { userId });
        } else {
          lockMeAcquired = true;
        }

        // 2. Check if already queued (heartbeat exists) — prevent double-queue
        const alreadyQueued = await pub.get(`matchq:heartbeat:${userId}`);
        if (alreadyQueued) {
          const hasRoom = await pub.hget('random:user_rooms', userId);
          if (hasRoom) {
            socket.emit('random:waiting');
            return;
          }
          logger.info('Clearing stale heartbeat for user, re-queuing', { userId });
          await pub.del(`matchq:heartbeat:${userId}`);
          await pub.decr('matchq:counter:queue');
        }

        const me: QueuedUser = { 
          userId, 
          mode,
          topics: userTopics, 
          gender: userGender, 
          preference,
          enqueuedAt: Date.now()
        };

        // 3. Atomic match-or-enqueue via Lua script (zero race conditions)
        const matchResult = await atomicMatchOrEnqueue(pub, me);

        if (matchResult.matched) {
          // INSTANT MATCH FOUND! Finalize it.
          const partner: QueuedUser = JSON.parse(matchResult.partnerData);
          const sharedTopics = me.topics?.filter((t: string) => partner.topics?.includes(t)) || [];
          const topic = sharedTopics[0] || '';
          await finalizeMatch(io, pub, me, partner, topic);
        } else {
          // No match found — Lua already enqueued us + set heartbeat.
          // Also add to Redis Stream for the background consumer group to retry.
          await pub.xadd(
            'matchq:stream', 'MAXLEN', '~', '2000', '*',
            'userData', JSON.stringify(me)
          );
          queuedForDeferredMatch = true;
          socket.emit('random:waiting');
          emitMatchingStats(io);
        }
      } catch (error) {
        logger.error('Failed to join random chat queue', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
        });
        socket.emit('random:error', {
          error: 'Could not join random chat. Please try again.',
        });
      } finally {
        if (lockMeAcquired) {
          await pub.del(`matchq:lock:${userId}`);
        }
        if (queuedForDeferredMatch) {
          // Kick one quick non-blocking sweep right after lock release to reduce
          // "stuck in queue until rejoin" scenarios under lock contention.
          void streamSweepConsumer(io, pub, { blockMs: 1, count: 20 });
        }
      }
    });

    /**
     * Heartbeat ping: iOS/web client should send this every 10s while in queue.
     * This refreshes the 30s TTL so the user isn't treated as a ghost.
     */
    socket.on('random:ping', async () => {
      try {
        const pub = redisClient.getClient();
        const heartbeat = await pub.get(`matchq:heartbeat:${userId}`);
        if (heartbeat) {
          await pub.expire(`matchq:heartbeat:${userId}`, 30);
        }
      } catch (e) { /* ignore */ }
    });

    /**
     * Random chat: send message within current room
     */
    socket.on('random:message', async (data: { roomId: string; content: string; replyToMessageId?: string; isVanish?: boolean }) => {
      try {
        const currentRoomId = await redisClient.getClient().hget('random:user_rooms', userId);
        if (!currentRoomId || currentRoomId !== data.roomId) {
          return;
        }

        if (!data.content || typeof data.content !== 'string') {
          return;
        }

        const trimmed = data.content.trim();
        if (!trimmed) {
          return;
        }

        io.to(currentRoomId).emit('random:message', {
          id: uuidv4(),
          roomId: currentRoomId,
          fromUserId: userId,
          fromName: name,
          fromProfilePictureUrl: socket.user?.profilePictureUrl,
          content: trimmed,
          type: (trimmed.startsWith('http') && trimmed.match(/\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i)) || trimmed.includes('giphy.com')
            ? 'image'
            : trimmed.startsWith('http') && trimmed.match(/\.(mp4|webm|mov)(\?.*)?$/i)
              ? 'video'
              : 'text',
          sentAt: new Date().toISOString(),
          replyToMessageId: data.replyToMessageId, // Support replies
          isVanish: data.isVanish, // Support vanish mode
        });
      } catch (error) {
        logger.error('Failed to relay random chat message', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
        });
      }
    });

    /**
     * Random chat: read receipt
     */
    socket.on('random:read', async (data: { roomId?: string; messageId?: string }) => {
      try {
        const messageId = typeof data?.messageId === 'string' ? data.messageId.trim() : '';
        if (!messageId || messageId.length > 128) {
          return;
        }

        const currentRoomId = await redisClient.getClient().hget('random:user_rooms', userId);
        if (!currentRoomId) {
          return;
        }

        // If client passed roomId, ensure it matches server-side room state.
        if (data?.roomId && data.roomId !== currentRoomId) {
          return;
        }

        socket.to(currentRoomId).emit('random:read', {
          roomId: currentRoomId,
          messageId,
          readByUserId: userId,
          readAt: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Failed to relay random chat read receipt', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
        });
      }
    });

    /**
     * Random chat: handle message reaction
     */
    socket.on('random:reaction', async (data: { roomId: string; messageId: string; emoji: string }) => {
      try {
        const currentRoomId = await redisClient.getClient().hget('random:user_rooms', userId);
        if (!currentRoomId || currentRoomId !== data.roomId) {
          return;
        }

        io.to(currentRoomId).emit('random:reaction', {
          roomId: currentRoomId,
          messageId: data.messageId,
          userId,
          emoji: data.emoji,
        });
      } catch (error) {
        logger.error('Failed to relay random chat reaction', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
        });
      }
    });

    /**
     * Random chat: Mutual Doodle Board (Scratch Pad)
     */
    socket.on('random:doodle:draw', async (data: { roomId: string; x1: number; y1: number; x2: number; y2: number; color: string; width: number }) => {
      try {
        const currentRoomId = await redisClient.getClient().hget('random:user_rooms', userId);
        if (!currentRoomId || currentRoomId !== data.roomId) return;

        // Relay drawing coordinates to the other partner
        socket.to(currentRoomId).emit('random:doodle:draw', {
          ...data,
          userId,
          name
        });
      } catch (error) {
        logger.error('Failed to relay doodle draw', { userId, error });
      }
    });

    socket.on('random:doodle:clear', async (data: { roomId: string }) => {
      try {
        const currentRoomId = await redisClient.getClient().hget('random:user_rooms', userId);
        if (!currentRoomId || currentRoomId !== data.roomId) return;

        io.to(currentRoomId).emit('random:doodle:clear', { roomId: currentRoomId });
      } catch (error) {
        logger.error('Failed to relay doodle clear', { userId, error });
      }
    });

    /**
     * Random chat: Delete message locally
     */
    socket.on('random:delete', async (data: { roomId: string; messageId: string }) => {
      try {
        const currentRoomId = await redisClient.getClient().hget('random:user_rooms', userId);
        if (!currentRoomId || currentRoomId !== data.roomId) return;
        io.to(currentRoomId).emit('random:deleted', { messageId: data.messageId, userId });
      } catch (err) {
        logger.error('Random delete failed', { userId, err });
      }
    });

    /**
     * Random chat: Edit message content
     */
    socket.on('random:edit', async (data: { roomId: string; messageId: string; content: string }) => {
      try {
        const currentRoomId = await redisClient.getClient().hget('random:user_rooms', userId);
        if (!currentRoomId || currentRoomId !== data.roomId) return;
        io.to(currentRoomId).emit('random:edited', {
          messageId: data.messageId,
          content: data.content,
          userId
        });
      } catch (err) {
        logger.error('Random edit failed', { userId, err });
      }
    });

    /**
     * Random chat: leave current room / queue
     */
    socket.on('random:leave', async (payload?: { roomId?: string }) => {
      let lockMeAcquired = false;
      const pub = redisClient.getClient();
      try {
        const requestedRoomId = typeof payload?.roomId === 'string' ? payload.roomId.trim() : '';

        const lockMe = await acquireMatchLock(pub, userId);
        if (lockMe) lockMeAcquired = true;
        else logger.warn('random:leave lock timeout, proceeding anyway', { userId });

        // Remove heartbeat & decrement queue counter if they were queued
        const wasQueued = await pub.del(`matchq:heartbeat:${userId}`);
        if (wasQueued) {
          await pub.decr('matchq:counter:queue');
        }
        // Note: We do NOT try to remove from list queues (O(N)). 
        // Instead, the pop logic validates heartbeat, so ghost entries are harmlessly skipped.

        const mappedRoomId = await pub.hget('random:user_rooms', userId);
        if (!lockMeAcquired && !requestedRoomId) {
          // Without a lock and without an explicit target room, cleanup can race and
          // accidentally tear down a brand-new rematch. Bail out safely.
          socket.emit('random:ended');
          emitMatchingStats(io);
          return;
        }

        if (requestedRoomId && mappedRoomId && mappedRoomId !== requestedRoomId) {
          // Stale leave for an old room after a rematch; do not touch current mapping.
          io.in(`user:${userId}`).socketsLeave(requestedRoomId);
          socket.emit('random:ended', { roomId: requestedRoomId });
          emitMatchingStats(io);
          return;
        }

        const roomId = requestedRoomId || mappedRoomId;
        if (!roomId) {
          socket.emit('random:ended');
          emitMatchingStats(io);
          return;
        }

        const otherUserId = await resolveOtherUserIdForRoom(pub, io, roomId, userId);
        io.to(roomId).emit('random:left', { roomId, userId, reason: 'leave' });
        if (otherUserId) {
          io.to(`user:${otherUserId}`).emit('random:ended', {
            roomId,
            reason: 'partner_left',
            userId,
          });
        }

        const cleanup = await cleanupRandomRoomState(pub, roomId, userId, otherUserId);
        if (cleanup.removedRoom) {
          await pub.decr('matchq:counter:matched');
          cleanupRoomMedia(roomId);
        }

        // Ensure no stale socket memberships survive across rematches.
        io.in(`user:${userId}`).socketsLeave(roomId);
        if (otherUserId) {
          io.in(`user:${otherUserId}`).socketsLeave(roomId);
        }

        socket.emit('random:ended', { roomId });
        emitMatchingStats(io);
      } catch (error) {
        logger.error('Failed to leave random chat', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
        });
      } finally {
        if (lockMeAcquired) await pub.del(`matchq:lock:${userId}`);
      }
    });

    /**
     * WebRTC: Signaling relay for P2P connection
     */
    socket.on('webrtc:signal', async (data: { roomId?: string; recipientId?: string; signal: any }) => {
      try {
        if (data.recipientId) {
          // Direct friend call signaling
          io.to(`user:${data.recipientId}`).emit('webrtc:signal', {
            fromUserId: userId,
            signal: data.signal
          });
          return;
        }

        const currentRoomId = await redisClient.getClient().hget('random:user_rooms', userId);
        if (!currentRoomId || currentRoomId !== data.roomId) return;

        // Relay to everyone else in the room
        socket.to(currentRoomId).emit('webrtc:signal', {
          fromUserId: userId,
          signal: data.signal
        });
      } catch (error) {
        logger.error('Failed to relay WebRTC signal', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId
        });
      }
    });

    /**
     * WebRTC: Call Request (Initiate a call)
     */
    socket.on('webrtc:call-request', async (data: { roomId?: string; recipientId?: string }) => {
      try {
        if (data.recipientId) {
          io.to(`user:${data.recipientId}`).emit('webrtc:call-request', {
            fromUserId: userId,
            recipientId: data.recipientId,
            caller: { id: userId, name: (socket as AuthenticatedSocket).user?.name }
          });
          return;
        }

        const currentRoomId = await redisClient.getClient().hget('random:user_rooms', userId);
        if (!currentRoomId || currentRoomId !== data.roomId) return;

        // Notify the partner of the incoming call
        socket.to(currentRoomId).emit('webrtc:call-request', {
          fromUserId: userId,
          roomId: currentRoomId,
          caller: { id: userId, name: (socket as AuthenticatedSocket).user?.name }
        });
      } catch (error) {
        logger.error('Failed to relay WebRTC call request', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId
        });
      }
    });

    /**
     * WebRTC: Call Response (Accept or Decline)
     */
    socket.on('webrtc:call-response', async (data: { roomId?: string; recipientId?: string; status: 'accepted' | 'declined' }) => {
      try {
        if (data.recipientId) {
          io.to(`user:${data.recipientId}`).emit('webrtc:call-response', {
            fromUserId: userId,
            status: data.status
          });
          return;
        }

        const currentRoomId = await redisClient.getClient().hget('random:user_rooms', userId);
        if (!currentRoomId || currentRoomId !== data.roomId) return;

        // Relay the response back to the caller
        socket.to(currentRoomId).emit('webrtc:call-response', {
          fromUserId: userId,
          status: data.status
        });
      } catch (error) {
        logger.error('Failed to relay WebRTC call response', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId
        });
      }
    });

    /**
     * WebRTC: Quality telemetry ingestion (optional)
     */
    socket.on('webrtc:telemetry', async (data: {
      roomId?: string;
      recipientId?: string;
      metrics?: {
        setupTimeMs?: number | null;
        avgRttMs?: number | null;
        packetLossPct?: number | null;
        reconnectCount?: number;
        connectionState?: string;
        qualityProfile?: 'high' | 'medium' | 'low' | string;
      };
      at?: string;
    }) => {
      try {
        if (data.roomId) {
          const currentRoomId = await redisClient.getClient().hget('random:user_rooms', userId);
          if (!currentRoomId || currentRoomId !== data.roomId) return;
        }

        const pub = redisClient.getClient();
        const key = data.roomId
          ? `webrtc:telemetry:room:${data.roomId}`
          : `webrtc:telemetry:user:${userId}`;

        const payload = {
          userId,
          recipientId: data.recipientId || null,
          at: data.at || new Date().toISOString(),
          metrics: {
            setupTimeMs: data.metrics?.setupTimeMs ?? null,
            avgRttMs: data.metrics?.avgRttMs ?? null,
            packetLossPct: data.metrics?.packetLossPct ?? null,
            reconnectCount: data.metrics?.reconnectCount ?? 0,
            connectionState: data.metrics?.connectionState ?? 'unknown',
            qualityProfile: data.metrics?.qualityProfile ?? 'high',
          },
        };

        await pub.hset(key, userId, JSON.stringify(payload));
        await pub.expire(key, 900);
      } catch (error) {
        logger.warn('Failed to ingest WebRTC telemetry', {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    /**
     * Friend Chat: Mutual Doodle Board (Scratch Pad)
     */
    socket.on('friend:doodle:draw', (data: { recipientId: string; x1: number; y1: number; x2: number; y2: number; color: string; width: number }) => {
      try {
        io.to(`user:${data.recipientId}`).emit('friend:doodle:draw', {
          ...data,
          userId,
          name
        });
      } catch (error) {
        logger.error('Failed to relay friend doodle draw', { userId, error });
      }
    });

    socket.on('friend:doodle:clear', (data: { recipientId: string }) => {
      try {
        io.to(`user:${data.recipientId}`).emit('friend:doodle:clear', { userId });
      } catch (error) {
        logger.error('Failed to relay friend doodle clear', { userId, error });
      }
    });

    /**
     * Handle sending messages
     */
    socket.on('message:send', async (data: {
      recipientId: string;
      encryptedContent: string; // Base64 encoded
      encryptedKey: string; // Base64 encoded
      messageType: 'text' | 'image' | 'video' | 'audio' | 'file' | 'system';
      mediaUrl?: string;
      mediaSizeBytes?: number;
      replyToMessageId?: string;
      isVanish?: boolean;
    }) => {
      try {
        // Convert base64 to Buffer
        const encryptedContent = Buffer.from(data.encryptedContent, 'base64');
        const encryptedKey = Buffer.from(data.encryptedKey, 'base64');

        // Create message
        const message = await messageService.sendMessage(userId, {
          recipientId: data.recipientId,
          encryptedContent,
          encryptedKey,
          messageType: data.messageType,
          mediaUrl: data.mediaUrl,
          mediaSizeBytes: data.mediaSizeBytes,
          replyToMessageId: data.replyToMessageId,
          isVanish: data.isVanish,
        });

        // Get full message with sender/recipient info
        const fullMessage = await messageService.getMessageById(message.id);
        if (!fullMessage) {
          socket.emit('message:error', { error: 'Failed to retrieve message' });
          return;
        }

        // Emit to sender (confirmation)
        socket.emit('message:sent', {
          message: {
            id: fullMessage.id,
            senderId: fullMessage.senderId,
            recipientId: fullMessage.recipientId,
            messageType: fullMessage.messageType,
            status: fullMessage.status,
            sentAt: fullMessage.sentAt,
            replyToMessageId: fullMessage.replyToMessageId,
            encryptedContent: fullMessage.encryptedContent ? fullMessage.encryptedContent.toString('base64') : undefined,
            encryptedKey: fullMessage.encryptedKey ? fullMessage.encryptedKey.toString('base64') : undefined,
            isVanish: fullMessage.isVanish,
          },
        });

        // Emit to recipient (if online)
        io.to(`user:${data.recipientId}`).emit('message:received', {
          message: {
            id: fullMessage.id,
            senderId: fullMessage.senderId,
            recipientId: fullMessage.recipientId,
            messageType: fullMessage.messageType,
            status: fullMessage.status,
            sentAt: fullMessage.sentAt,
            replyToMessageId: fullMessage.replyToMessageId,
            sender: fullMessage.sender,
            encryptedContent: fullMessage.encryptedContent ? fullMessage.encryptedContent.toString('base64') : undefined,
            encryptedKey: fullMessage.encryptedKey ? fullMessage.encryptedKey.toString('base64') : undefined,
            isVanish: fullMessage.isVanish,
          },
        });


        // Mark as delivered if recipient is online
        const recipientSockets = activeUsers.get(data.recipientId);
        if (recipientSockets && recipientSockets.size > 0) {
          await messageService.markAsDelivered(message.id, data.recipientId);

          // Notify sender that message was delivered
          socket.emit('message:delivered', {
            messageId: message.id,
            recipientId: data.recipientId,
          });
        }
      } catch (error) {
        logger.error('Failed to send message via socket', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
          recipientId: data.recipientId,
        });
        socket.emit('message:error', {
          error: error instanceof Error ? error.message : 'Failed to send message',
        });
      }
    });

    /**
     * Friend Chat: Delete message for everyone
     */
    socket.on('message:delete', async (data: { messageId: string; recipientId: string }) => {
      try {
        await messageService.deleteMessage(data.messageId, userId);

        // Notify both parties
        const payload = { messageId: data.messageId, userId };
        socket.emit('message:deleted', payload);
        io.to(`user:${data.recipientId}`).emit('message:deleted', payload);
      } catch (err) {
        logger.error('Delete failed', { userId, err });
      }
    });

    /**
     * Friend Chat: Edit message content
     */
    socket.on('message:edit', async (data: { messageId: string; content: string; recipientId: string }) => {
      try {
        const encryptedContent = Buffer.from(btoa(data.content), 'base64');
        await messageService.editMessage(data.messageId, userId, { encryptedContent });

        // Notify both parties
        const payload = { messageId: data.messageId, content: data.content, userId };
        socket.emit('message:edited', payload);
        io.to(`user:${data.recipientId}`).emit('message:edited', payload);
      } catch (err) {
        logger.error('Edit failed', { userId, err });
      }
    });

    /**
     * Handle typing indicators
     */
    socket.on('typing:start', async (data: { recipientId?: string; roomId?: string }) => {
      try {
        if (data.roomId) {
          const currentRoomId = await redisClient.getClient().hget('random:user_rooms', userId);
          if (currentRoomId && currentRoomId === data.roomId) {
            socket.to(data.roomId).emit('typing:start', { userId, name });
          }
        } else if (data.recipientId) {
          const conversationId = [userId, data.recipientId].sort().join(':');

          if (!typingUsers.has(conversationId)) {
            typingUsers.set(conversationId, new Set());
          }
          typingUsers.get(conversationId)!.add(userId);

          // Notify recipient
          io.to(`user:${data.recipientId}`).emit('typing:start', { userId, name });
        }
      } catch (error) {
        logger.error('Failed to handle typing start', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
        });
      }
    });

    socket.on('typing:stop', async (data: { recipientId?: string; roomId?: string }) => {
      try {
        if (data.roomId) {
          const currentRoomId = await redisClient.getClient().hget('random:user_rooms', userId);
          if (currentRoomId && currentRoomId === data.roomId) {
            socket.to(data.roomId).emit('typing:stop', { userId });
          }
        } else if (data.recipientId) {
          const conversationId = [userId, data.recipientId].sort().join(':');
          typingUsers.get(conversationId)?.delete(userId);

          // Notify recipient
          io.to(`user:${data.recipientId}`).emit('typing:stop', { userId });
        }
      } catch (error) {
        logger.error('Failed to handle typing stop', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
        });
      }
    });

    /**
     * Handle read receipts
     */
    socket.on('message:read', async (data: { messageId: string }) => {
      try {
        const message = await messageService.getMessageById(data.messageId);
        if (!message || message.recipientId !== userId) {
          return;
        }

        await messageService.markAsRead(data.messageId, userId);

        // Notify sender
        io.to(`user:${message.senderId}`).emit('message:read', {
          messageId: data.messageId,
          senderId: message.senderId,
          userId,
        });

        // Also notify the reader (current user) to update their unread count
        io.to(`user:${userId}`).emit('message:read', {
          messageId: data.messageId,
          senderId: message.senderId,
          userId,
        });
      } catch (error) {
        logger.error('Failed to mark message as read', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
          messageId: data.messageId,
        });
      }
    });

    /**
     * Handle marking multiple messages as read
     */
    socket.on('messages:read', async (data: { messageIds: string[]; senderId: string }) => {
      try {
        await messageService.markMultipleAsRead(data.messageIds, userId);

        // Notify sender
        io.to(`user:${data.senderId}`).emit('messages:read', {
          messageIds: data.messageIds,
          senderId: data.senderId,
          userId,
        });

        // Also notify the reader (current user) to update their unread count
        io.to(`user:${userId}`).emit('messages:read', {
          messageIds: data.messageIds,
          senderId: data.senderId,
          userId,
        });
      } catch (error) {
        logger.error('Failed to mark multiple messages as read', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
        });
      }
    });

    /**
     * Handle status updates
     */
    socket.on('status:update', async (data: { status: 'online' | 'away' | 'offline' }) => {
      try {
        await userService.updateStatus(userId, data.status);
        io.emit('user:status', { userId, status: data.status });
      } catch (error) {
        logger.error('Failed to update status', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
        });
      }
    });

    /**
     * Handle disconnection
     */
    socket.on('disconnect', async () => {
      try {
        logger.info('Socket disconnected', { userId, socketId: socket.id });

        // Remove socket from active users
        const userSockets = activeUsers.get(userId);
        if (userSockets) {
          userSockets.delete(socket.id);
          // Best effort stale-socket sweep. If a socket id no longer exists in
          // the adapter map, drop it so cleanup can run reliably.
          for (const trackedSocketId of [...userSockets]) {
            if (!io.sockets.sockets.has(trackedSocketId)) {
              userSockets.delete(trackedSocketId);
            }
          }
          if (userSockets.size === 0) {
            activeUsers.delete(userId);
            // Last socket closed - mark globally offline
            const pub = redisClient.getClient();
            pub.srem('presence:online_users', userId).catch(err => logger.error('Presence SREM failed', err));

            // ONLY clean up state if this was the last active socket for this user
            // Implementing gracefully delay of 5 seconds to support connection recovery/drops
            logger.info('Last user socket disconnected, starting 5s grace period', { userId });

            const timeout = setTimeout(async () => {
              disconnectTimeouts.delete(userId);
              logger.info('Grace period expired, cleaning up session permanently', { userId });

              let lockMeAcquired = false;
              const pub = redisClient.getClient();
              try {
                const lockMe = await acquireMatchLock(pub, userId);
                if (lockMe) lockMeAcquired = true;
                else logger.warn('disconnect cleanup lock timeout, proceeding anyway', { userId });

                // Clean up queue heartbeat
                const wasQueued = await pub.del(`matchq:heartbeat:${userId}`);
                if (wasQueued) {
                  await pub.decr('matchq:counter:queue');
                }

                // Clean up random room
                const roomId = await pub.hget('random:user_rooms', userId);
                if (roomId) {
                  const otherUserId = await resolveOtherUserIdForRoom(pub, io, roomId, userId);
                  io.to(roomId).emit('random:left', {
                    roomId,
                    userId,
                    reason: 'disconnect',
                  });
                  if (otherUserId) {
                    io.to(`user:${otherUserId}`).emit('random:ended', {
                      roomId,
                      reason: 'partner_disconnected',
                      userId,
                    });
                  }

                  const cleanup = await cleanupRandomRoomState(pub, roomId, userId, otherUserId);
                  if (cleanup.removedRoom) {
                    await pub.decr('matchq:counter:matched');
                    cleanupRoomMedia(roomId);
                  }

                  io.in(`user:${userId}`).socketsLeave(roomId);
                  if (otherUserId) {
                    io.in(`user:${otherUserId}`).socketsLeave(roomId);
                  }
                }

                // User is no longer online
                activeUsers.delete(userId);
                await pub.zrem('presence:geo', userId).catch(() => {});
                await userService.updateStatus(userId, 'offline');
                io.emit('user:offline', { userId, name });
                io.emit('presence:count', { count: activeUsers.size });
                emitMatchingStats(io);
              } catch (e) {
                logger.error('Failed to cleanup user session', { error: e });
              } finally {
                if (lockMeAcquired) await pub.del(`matchq:lock:${userId}`);
              }
            }, 5000);

            disconnectTimeouts.set(userId, timeout);
          }
        }

        // Clean up typing indicators
        for (const [conversationId, typingSet] of typingUsers.entries()) {
          typingSet.delete(userId);
          if (typingSet.size === 0) {
            typingUsers.delete(conversationId);
          }
        }
      } catch (error) {
        logger.error('Error handling socket disconnect', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
        });
      }
    });

    // ─── HAVELI (Group Rooms) Events ──────────────────────────────────

    /**
     * Haveli: Join a room and start receiving messages
     */
    socket.on('haveli:join', async (data: { haveliId: string }) => {
      try {
        if (!data?.haveliId) return;
        const membership = await haveliService.isMember(data.haveliId, userId);
        if (!membership.isMember) {
          socket.emit('haveli:error', { error: 'You are not a member of this Haveli' });
          return;
        }

        socket.join(`haveli:${data.haveliId}`);
        socket.data.currentHaveliId = data.haveliId;

        // Notify others in the room
        socket.to(`haveli:${data.haveliId}`).emit('haveli:member:online', {
          haveliId: data.haveliId,
          userId,
          name: socket.user?.name,
          profilePictureUrl: socket.user?.profilePictureUrl,
        });

        logger.info('User joined Haveli room', { userId, haveliId: data.haveliId });
      } catch (error) {
        logger.error('haveli:join error', { error, userId, haveliId: data?.haveliId });
      }
    });

    /**
     * Haveli: Leave a room
     */
    socket.on('haveli:leave', async (data: { haveliId: string }) => {
      try {
        if (!data?.haveliId) return;
        socket.leave(`haveli:${data.haveliId}`);
        if (socket.data.currentHaveliId === data.haveliId) {
          socket.data.currentHaveliId = undefined;
        }

        socket.to(`haveli:${data.haveliId}`).emit('haveli:member:offline', {
          haveliId: data.haveliId,
          userId,
        });
      } catch (error) {
        logger.error('haveli:leave error', { error, userId });
      }
    });

    /**
     * Haveli: Send a message
     */
    socket.on('haveli:message', async (data: { haveliId: string; content: string }) => {
      try {
        if (!data?.haveliId || !data?.content) return;

        const trimmed = data.content.trim();
        if (!trimmed || trimmed.length > 2000) return;

        const membership = await haveliService.isMember(data.haveliId, userId);
        if (!membership.isMember) return;

        // Detect message type
        let messageType = 'text';
        if ((trimmed.startsWith('http') && trimmed.match(/\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i)) || trimmed.includes('giphy.com')) {
          messageType = 'image';
        }

        // Store in DB
        const stored = await haveliService.storeMessage(data.haveliId, userId, trimmed, messageType);

        // Broadcast to room
        io.to(`haveli:${data.haveliId}`).emit('haveli:message', {
          id: stored.id,
          haveliId: data.haveliId,
          senderId: userId,
          content: trimmed,
          messageType,
          isSystem: false,
          createdAt: stored.createdAt,
          sender: {
            id: userId,
            name: socket.user?.name,
            username: socket.user?.username,
            profilePictureUrl: socket.user?.profilePictureUrl,
          },
        });
      } catch (error) {
        logger.error('haveli:message error', { error, userId, haveliId: data?.haveliId });
      }
    });

    /**
     * Haveli: Typing indicator
     */
    socket.on('haveli:typing:start', (data: { haveliId: string }) => {
      if (!data?.haveliId) return;
      socket.to(`haveli:${data.haveliId}`).emit('haveli:typing:start', {
        haveliId: data.haveliId,
        userId,
        name: socket.user?.name,
      });
    });

    socket.on('haveli:typing:stop', (data: { haveliId: string }) => {
      if (!data?.haveliId) return;
      socket.to(`haveli:${data.haveliId}`).emit('haveli:typing:stop', {
        haveliId: data.haveliId,
        userId,
      });
    });

    /**
     * Haveli: Admin kick member
     */
    socket.on('haveli:kick', async (data: { haveliId: string; targetUserId: string }) => {
      try {
        if (!data?.haveliId || !data?.targetUserId) return;

        const result = await haveliService.kickMember(data.haveliId, userId, data.targetUserId);
        if (!result.success) {
          socket.emit('haveli:error', { error: result.error });
          return;
        }

        // Notify kicked user
        io.to(`user:${data.targetUserId}`).emit('haveli:kicked', {
          haveliId: data.haveliId,
        });

        // Remove from socket room
        io.in(`user:${data.targetUserId}`).socketsLeave(`haveli:${data.haveliId}`);

        // System message
        const targetUser = await userService.getUserById(data.targetUserId);
        await haveliService.addSystemMessage(data.haveliId, `${targetUser?.name || 'A user'} was removed from the Haveli.`);

        // Notify room
        io.to(`haveli:${data.haveliId}`).emit('haveli:member:kicked', {
          haveliId: data.haveliId,
          targetUserId: data.targetUserId,
          kickedByName: socket.user?.name,
        });
      } catch (error) {
        logger.error('haveli:kick error', { error, userId });
      }
    });

    /**
     * Haveli: Admin update settings (theme, privacy, lock, name, etc.)
     */
    socket.on('haveli:settings:update', async (data: {
      haveliId: string;
      updates: { name?: string; description?: string; themeId?: string; privacyType?: 'public' | 'invite'; isLocked?: boolean; pinnedMessage?: string | null };
    }) => {
      try {
        if (!data?.haveliId || !data?.updates) return;

        const result = await haveliService.updateHaveli(data.haveliId, userId, data.updates);
        if (!result.success) {
          socket.emit('haveli:error', { error: result.error });
          return;
        }

        // Broadcast updated settings to everyone in room
        io.to(`haveli:${data.haveliId}`).emit('haveli:settings:updated', {
          haveliId: data.haveliId,
          haveli: result.haveli,
        });

        // System messages for noteworthy changes
        if (data.updates.themeId) {
          await haveliService.addSystemMessage(data.haveliId, `${socket.user?.name} changed the room theme.`);
        }
        if (data.updates.isLocked !== undefined) {
          await haveliService.addSystemMessage(
            data.haveliId,
            data.updates.isLocked ? '🔒 Room locked — no new members can join.' : '🔓 Room unlocked — new members can join.'
          );
        }
      } catch (error) {
        logger.error('haveli:settings:update error', { error, userId });
      }
    });

    /**
     * Haveli: Admin delete room
     */
    socket.on('haveli:delete', async (data: { haveliId: string }) => {
      try {
        if (!data?.haveliId) return;

        const result = await haveliService.deleteHaveli(data.haveliId, userId);
        if (!result.success) {
          socket.emit('haveli:error', { error: result.error });
          return;
        }

        // Notify everyone in the room
        io.to(`haveli:${data.haveliId}`).emit('haveli:deleted', {
          haveliId: data.haveliId,
        });

        // Force everyone to leave the socket room
        io.in(`haveli:${data.haveliId}`).socketsLeave(`haveli:${data.haveliId}`);
      } catch (error) {
        logger.error('haveli:delete error', { error, userId });
      }
    });
  });


  return io;
}

/**
 * Get active users count
 */
export function getActiveUsersCount(): number {
  return activeUsers.size;
}

/**
 * Check if user is online
 */
export function isUserOnline(userId: string): boolean {
  return activeUsers.has(userId) && (activeUsers.get(userId)?.size ?? 0) > 0;
}
