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
import logger from '../utils/logger';
import { createAdapter } from '@socket.io/redis-adapter';
import redisClient from './redis';
import { ExtendedError } from 'socket.io/dist/namespace';

interface SocketUser {
  userId: string;
  deviceId: string;
  username?: string;
  name: string;
  profilePictureUrl?: string;
  gender: 'male' | 'female' | 'non-binary' | 'other' | 'prefer_not_to_say';
}

interface AuthenticatedSocket extends Socket {
  user?: SocketUser;
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
 * Format: `matchq:<gender>:<preference>[:<topic>]`
 * e.g. `matchq:male:female:anime`  or  `matchq:female:everyone`
 */
function queueKey(gender: string, preference: string, topic?: string): string {
  const base = `matchq:${gender}:${preference}`;
  return topic ? `${base}:${topic}` : base;
}

/**
 * Given a user's gender + preference, return the inverse queue key(s)
 * we should try to pop from.
 *
 * For example: A *male* seeking *female* should pop from a queue where
 * a *female* is seeking *male* (or *everyone*).
 */
function inverseQueueKeys(gender: string, preference: string, topic?: string): string[] {
  const keys: string[] = [];

  if (preference === 'everyone') {
    // Accept anyone whose preference is 'everyone' or who specifically seeks my gender
    if (topic) {
      keys.push(queueKey('male', 'everyone', topic));
      keys.push(queueKey('female', 'everyone', topic));
      keys.push(queueKey('non-binary', 'everyone', topic));
      keys.push(queueKey('other', 'everyone', topic));
      keys.push(queueKey('prefer_not_to_say', 'everyone', topic));
      // Also those specifically seeking my gender with this topic
      keys.push(queueKey('male', gender, topic));
      keys.push(queueKey('female', gender, topic));
      keys.push(queueKey('non-binary', gender, topic));
      keys.push(queueKey('other', gender, topic));
      keys.push(queueKey('prefer_not_to_say', gender, topic));
    }
    // Without topic (broader)
    keys.push(queueKey('male', 'everyone'));
    keys.push(queueKey('female', 'everyone'));
    keys.push(queueKey('non-binary', 'everyone'));
    keys.push(queueKey('other', 'everyone'));
    keys.push(queueKey('prefer_not_to_say', 'everyone'));
    keys.push(queueKey('male', gender));
    keys.push(queueKey('female', gender));
    keys.push(queueKey('non-binary', gender));
    keys.push(queueKey('other', gender));
    keys.push(queueKey('prefer_not_to_say', gender));
  } else {
    // Specific preference (e.g. male seeking female)
    // Pop from queues where the desired gender is waiting and they want me or everyone
    if (topic) {
      keys.push(queueKey(preference, gender, topic));
      keys.push(queueKey(preference, 'everyone', topic));
    }
    keys.push(queueKey(preference, gender));
    keys.push(queueKey(preference, 'everyone'));
  }

  // Return unique keys (we DO NOT filter out myKey because users can match with others in the same bucket)
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

/**
 * Emit stats about the matching system to all connected users
 */
async function emitMatchingStats(io: any) {
  try {
    const pub = redisClient.getClient();
    // Use a simple counter key instead of scanning all queues
    const queueLen = parseInt(await pub.get('matchq:counter:queue') || '0');
    const matchedLen = parseInt(await pub.get('matchq:counter:matched') || '0');
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
 * Try to instantly match a user by popping from inverse queues. O(1).
 * Returns the matched partner's QueuedUser data if found, null otherwise.
 */
async function tryInstantMatch(
  pub: any,
  user: QueuedUser
): Promise<{ partner: QueuedUser; topic: string } | null> {
  const { gender, preference, topics } = user;

  const tryMatchOnKeys = async (keys: string[], getSharedTopic: (p: QueuedUser) => string) => {
    for (const key of keys) {
      const poppedToPutBack: string[] = [];
      let matchedPartner: QueuedUser | null = null;

      while (true) {
        const popped = await pub.rpop(key);
        if (!popped) break; // Queue is empty

        const partner: QueuedUser = JSON.parse(popped);

        // Don't match with ourselves! Save to put back and keep looking.
        if (partner.userId === user.userId) {
          poppedToPutBack.push(popped);
          continue;
        }

        const lockPartner = await pub.set(`matchq:lock:${partner.userId}`, '1', 'EX', 5, 'NX');
        if (!lockPartner) {
          poppedToPutBack.push(popped);
          continue;
        }

        const alreadyMatched = await pub.hget('random:user_rooms', partner.userId);
        if (alreadyMatched) {
          await pub.del(`matchq:lock:${partner.userId}`);
          continue; // Ghost user, skip entirely (already matched)
        }

        const heartbeat = await pub.get(`matchq:heartbeat:${partner.userId}`);
        if (!heartbeat) {
          await pub.del(`matchq:lock:${partner.userId}`);
          continue; // Ghost user, skip entirely (disconnected)
        }

        // Match found!
        matchedPartner = partner;
        await pub.decr('matchq:counter:queue'); // Partner left queue
        break;
      }

      // Restore users we popped but shouldn't have (in reverse order to maintain queue LIFO/FIFO)
      // Since rpop takes from the right, to put them back at the right end maintaining their order, 
      // we must rpush them in the reverse order they were popped.
      if (poppedToPutBack.length > 0) {
        for (let i = poppedToPutBack.length - 1; i >= 0; i--) {
          await pub.rpush(key, poppedToPutBack[i]);
        }
      }

      if (matchedPartner) {
        return { partner: matchedPartner, topic: getSharedTopic(matchedPartner) };
      }
    }
    return null;
  };

  // Phase 1: Try topic-specific queues first (best match quality)
  if (topics && topics.length > 0) {
    for (const topic of topics) {
      const keys = inverseQueueKeys(gender, preference, topic);
      const result = await tryMatchOnKeys(keys, () => topic);
      if (result) return result;
    }
  }

  // Phase 2: Try generic (no topic) queues
  const genericKeys = inverseQueueKeys(gender, preference);
  const result = await tryMatchOnKeys(genericKeys, (partner) => {
    const shared = partner.topics?.filter((t: string) => topics?.includes(t)) || [];
    return shared[0] || '';
  });

  return result;
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
  io.to(`user:${userA.userId}`).emit('random:matched', { roomId, partner: profileB, topic });
  io.to(`user:${userB.userId}`).emit('random:matched', { roomId, partner: profileA, topic });

  // Fire-and-forget DB recording (non-blocking)
  Promise.all([
    userService.incrementRoomsEntered(userA.userId),
    userService.incrementRoomsEntered(userB.userId),
    matchService.recordMatch(userA.userId, userB.userId, roomId, topic || undefined),
  ]).catch(err => logger.error('Failed to record match in DB', err));

  emitMatchingStats(io);
}

/**
 * Background sweep: try to match any two compatible users already sitting in queues.
 * This catches the case where two users joined at nearly the same time and both
 * ended up in separate queue buckets without finding each other.
 */
async function sweepAndMatch(io: SocketIOServer, pub: any): Promise<void> {
  try {
    const bucketKeys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, keys] = await pub.scan(cursor, 'MATCH', 'matchq:*', 'COUNT', 100);
      cursor = nextCursor;
      
      const filtered = keys.filter((k: string) =>
        !k.startsWith('matchq:heartbeat:') &&
        !k.startsWith('matchq:counter:') &&
        !k.startsWith('matchq:lock:') &&
        !k.startsWith('matchq:metrics:')
      );
      bucketKeys.push(...filtered);
    } while (cursor !== '0');

    if (bucketKeys.length === 0) return;

    for (const key of bucketKeys) {
      const poppedStr = await pub.rpop(key);
      if (!poppedStr) continue;

      let candidate: QueuedUser;
      try {
        candidate = JSON.parse(poppedStr);
      } catch { continue; }

      const lockMe = await pub.set(`matchq:lock:${candidate.userId}`, '1', 'EX', 5, 'NX');
      if (!lockMe) {
        await pub.rpush(key, poppedStr);
        continue;
      }

      try {
        const heartbeat = await pub.get(`matchq:heartbeat:${candidate.userId}`);
        if (!heartbeat) continue;

        const alreadyMatched = await pub.hget('random:user_rooms', candidate.userId);
        if (alreadyMatched) continue;

        const matchResult = await tryInstantMatch(pub, candidate);
        if (matchResult) {
          for (const otherKey of bucketKeys) {
            if (otherKey !== key) {
              await pub.lrem(otherKey, 0, poppedStr);
            }
          }
          await pub.decr('matchq:counter:queue');
          logger.info('Background sweep matched users', {
            userA: candidate.userId,
            userB: matchResult.partner.userId,
            topic: matchResult.topic
          });
          await finalizeMatch(io, pub, candidate, matchResult.partner, matchResult.topic);
        } else {
          await pub.rpush(key, poppedStr);
        }
      } finally {
        await pub.del(`matchq:lock:${candidate.userId}`);
      }
    }
  } catch (error) {
    logger.error('Matchmaker sweep error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Background worker: emits stats, runs periodic match sweep, cleans up ghost entries.
 */
export function startMatchmakerWorker(io: SocketIOServer, pubClient: any) {
  // Emit stats every 5s
  setInterval(() => emitMatchingStats(io), 5000);

  // Run match sweep every 3s to catch users who missed instant matching
  setInterval(() => sweepAndMatch(io, pubClient), 3000);

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

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Notify everyone that user is online and total count
    io.emit('user:online', { userId, name });
    io.emit('presence:count', { count: activeUsers.size });

    /**
     * Random chat: join the gentle queue
     */
    socket.on('random:join', async (payload?: { topics?: string[]; preference?: 'male' | 'female' | 'everyone' }) => {
      let lockMeAcquired = false;
      const pub = redisClient.getClient();
      try {
        const userTopics = payload?.topics || [];
        const preference = payload?.preference || 'everyone';
        const userGender = socket.user?.gender || 'prefer_not_to_say';

        // 1. If user already has an active room, rejoin it
        const existingRoomId = await pub.hget('random:user_rooms', userId);
        if (existingRoomId) {
          const roomStr = await pub.hget('random:rooms', existingRoomId);
          if (roomStr) {
            const room = JSON.parse(roomStr);
            const partnerId = room.users.find((id: string) => id !== userId);
            const partner = partnerId ? await userService.getPublicUserProfile(partnerId) : null;
            socket.join(existingRoomId);
            socket.emit('random:matched', { roomId: existingRoomId, partner, topic: room.topic });
            return;
          }
          // Stale room pointer, clean it
          await pub.hdel('random:user_rooms', userId);
        }

        const lockMe = await pub.set(`matchq:lock:${userId}`, '1', 'EX', 5, 'NX');
        if (!lockMe) {
          socket.emit('random:waiting');
          return;
        }
        lockMeAcquired = true;

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
          topics: userTopics, 
          gender: userGender, 
          preference,
          enqueuedAt: Date.now()
        };

        // 3. Try O(1) instant match by popping from inverse queues
        const matchResult = await tryInstantMatch(pub, me);

        if (matchResult) {
          // INSTANT MATCH FOUND! Finalize it.
          await finalizeMatch(io, pub, me, matchResult.partner, matchResult.topic);
        } else {
          // 4. No match found — push me into my queue bucket
          await pub.set(`matchq:heartbeat:${userId}`, JSON.stringify(me), 'EX', 30);

          if (userTopics.length > 0) {
            for (const topic of userTopics) {
              const key = queueKey(userGender, preference, topic);
              await pub.lpush(key, JSON.stringify(me));
            }
          }
          const genericKey = queueKey(userGender, preference);
          await pub.lpush(genericKey, JSON.stringify(me));

          await pub.incr('matchq:counter:queue');
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
    socket.on('random:leave', async () => {
      let lockMeAcquired = false;
      const pub = redisClient.getClient();
      try {
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

        const roomId = await pub.hget('random:user_rooms', userId);
        if (!roomId) {
          socket.emit('random:ended');
          emitMatchingStats(io);
          return;
        }

        const roomStr = await pub.hget('random:rooms', roomId);
        if (roomStr) {
          const room = JSON.parse(roomStr);
          const otherUserId = room.users.find((id: string) => id !== userId);

          io.to(roomId).emit('random:left', { roomId, userId });

          const pipeline = pub.pipeline();
          pipeline.hdel('random:user_rooms', userId);
          pipeline.hdel('random:rooms', roomId);
          pipeline.decr('matchq:counter:matched');
          if (otherUserId) {
            pipeline.hdel('random:user_rooms', otherUserId);
          }
          await pipeline.exec();

          cleanupRoomMedia(roomId);
        }

        socket.leave(roomId);
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
    socket.on('typing:start', async (data: { recipientId: string }) => {
      try {
        const conversationId = [userId, data.recipientId].sort().join(':');

        if (!typingUsers.has(conversationId)) {
          typingUsers.set(conversationId, new Set());
        }
        typingUsers.get(conversationId)!.add(userId);

        // Notify recipient
        io.to(`user:${data.recipientId}`).emit('typing:start', {
          userId,
          name,
        });

        // Auto-stop typing after 3 seconds
        setTimeout(() => {
          socket.emit('typing:stop', { recipientId: data.recipientId });
        }, 3000);
      } catch (error) {
        logger.error('Failed to handle typing start', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
        });
      }
    });

    socket.on('typing:stop', (data: { recipientId: string }) => {
      try {
        const conversationId = [userId, data.recipientId].sort().join(':');
        typingUsers.get(conversationId)?.delete(userId);

        // Notify recipient
        io.to(`user:${data.recipientId}`).emit('typing:stop', { userId });
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
                  const roomStr = await pub.hget('random:rooms', roomId);
                  if (roomStr) {
                    const room = JSON.parse(roomStr);
                    const otherUserId = room.users.find((id: string) => id !== userId);

                    // Notify the room that somebody left/disconnected
                    io.to(roomId).emit('random:left', {
                      roomId,
                      userId,
                    });

                    const pipeline = pub.pipeline();
                    pipeline.hdel('random:user_rooms', userId);
                    pipeline.hdel('random:rooms', roomId);
                    pipeline.decr('matchq:counter:matched');
                    if (otherUserId) {
                      pipeline.hdel('random:user_rooms', otherUserId);
                    }
                    await pipeline.exec();

                    if (otherUserId) {
                      const otherSockets = activeUsers.get(otherUserId) ?? new Set<string>();
                      for (const id of otherSockets) {
                        const s = io.sockets.sockets.get(id);
                        if (s) s.leave(roomId);
                      }
                    }

                    // Trigger ephemeral media cleanup
                    cleanupRoomMedia(roomId);
                  } else {
                    await pub.hdel('random:user_rooms', userId);
                  }
                }

                // User is no longer online
                activeUsers.delete(userId);
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
