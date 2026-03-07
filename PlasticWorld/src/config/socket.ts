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
  auraPoints?: number;
}

export interface PartyMember {
  id: string;
  name: string;
  profilePictureUrl?: string;
  auraPoints?: number;
}

export interface PartyRoom {
  id: string;
  name: string;
  hostId: string;
  hostName: string;
  capacity: number;
  members: PartyMember[];
  requests: PartyMember[];
  isLocked: boolean;
  createdAt: number;
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

// Random chat state (ephemeral, in-memory)
interface RandomRoom {
  id: string;
  users: [string, string]; // userIds
  topic?: string;
}

interface QueuedUser {
  userId: string;
  topics: string[];
  gender: string;
  preference: 'male' | 'female' | 'everyone';
}

// Queue of users waiting for a random partner
// const randomQueue: QueuedUser[] = [];

// Map userId -> current random roomId (if any)
// const userToRandomRoom = new Map<string, string>();

// Map roomId -> room metadata
// const randomRooms = new Map<string, RandomRoom>();

// Ephemeral media tracking (roomId -> Set of filenames)
const roomMedia = new Map<string, Set<string>>();

/**
 * Emit stats about the matching system to all connected users
 */

async function emitMatchingStats(io: any) {
  try {
    const pubClient = redisClient.getClient();
    const queueLen = await pubClient.hlen('random:queue');
    const matchedLen = await pubClient.hlen('random:user_rooms');
    const stats = {
      online: activeUsers.size,
      inQueue: queueLen,
      matched: Math.floor(matchedLen / 2),
    };
    io.emit('random:stats', stats);
  } catch (e) { /* ignore */ }
}

export async function emitActiveParties(io: any) {
  try {
    const pubClient = redisClient.getClient();
    const roomsStr = await pubClient.hgetall('party:rooms');
    const activeParties = Object.values(roomsStr).map(str => JSON.parse(str));
    io.emit('party:list', activeParties);
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
      auraPoints: user.auraPoints,
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

export function startMatchmakerWorker(io: SocketIOServer, pubClient: any) {
  setInterval(async () => {
    try {
      const lock = await pubClient.set('matchmaker:lock', '1', 'EX', 2, 'NX');
      if (!lock) return;
      const queueMap = await pubClient.hgetall('random:queue');
      const queueIds = Object.keys(queueMap);
      if (queueIds.length < 2) return;
      const queue: QueuedUser[] = queueIds.map((id: string) => JSON.parse(queueMap[id]));
      const activeRooms = await pubClient.hgetall('random:user_rooms');
      const validQueue = queue.filter((q: QueuedUser) => !activeRooms[q.userId]);
      const matchedPairs = [];
      const toRemove = new Set<string>();
      for (let i = 0; i < validQueue.length; i++) {
        const userA = validQueue[i];
        if (toRemove.has(userA.userId)) continue;
        for (let j = i + 1; j < validQueue.length; j++) {
          const userB = validQueue[j];
          if (toRemove.has(userB.userId)) continue;
          const aPrefSatisfied = userA.preference === 'everyone' || userA.preference === userB.gender;
          const bPrefSatisfied = userB.preference === 'everyone' || userB.preference === userA.gender;
          if (aPrefSatisfied && bPrefSatisfied) {
            const shared = userB.topics.filter((t: string) => userA.topics.includes(t));
            matchedPairs.push({ u1: userA, u2: userB, topic: shared[0] || '' });
            toRemove.add(userA.userId);
            toRemove.add(userB.userId);
            break;
          }
        }
      }
      for (const match of matchedPairs) {
        const roomId = `random:${[match.u1.userId, match.u2.userId].sort().join(':')}:${Date.now()}`;
        await pubClient.hset('random:user_rooms', match.u1.userId, roomId);
        await pubClient.hset('random:user_rooms', match.u2.userId, roomId);
        await pubClient.hdel('random:queue', match.u1.userId, match.u2.userId);
        const room: RandomRoom = { id: roomId, users: [match.u1.userId, match.u2.userId], topic: match.topic || undefined };
        await pubClient.hset('random:rooms', roomId, JSON.stringify(room));
        const [profileA, profileB] = await Promise.all([
          userService.getPublicUserProfile(match.u1.userId),
          userService.getPublicUserProfile(match.u2.userId)
        ]);
        io.in(`user:${match.u1.userId}`).socketsJoin(roomId);
        io.in(`user:${match.u2.userId}`).socketsJoin(roomId);
        io.to(`user:${match.u1.userId}`).emit('random:matched', { roomId, partner: profileB, topic: match.topic });
        io.to(`user:${match.u2.userId}`).emit('random:matched', { roomId, partner: profileA, topic: match.topic });
        await Promise.all([
          userService.incrementRoomsEntered(match.u1.userId),
          userService.incrementRoomsEntered(match.u2.userId),
          matchService.recordMatch(match.u1.userId, match.u2.userId, roomId, match.topic || undefined)
        ]);
      }
      if (matchedPairs.length > 0) emitMatchingStats(io);
    } catch (err) {
      logger.error('Matchmaker error', err);
    }
  }, 2000);
}

export function initializeSocket(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || [
        'http://localhost:3000',
        'http://localhost:8080',
        'http://localhost:8081',
        'http://localhost:8082',
        'http://localhost:8083', // For messaging test page
        'http://localhost:5173',
        'https://yaduraj.me',
        'https://muhdikhai.yaduraj.me',
        'https://batchit.yaduraj.me',
      ],
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
      try {
        const pubClient = redisClient.getClient();
        emitMatchingStats(io);
        const userTopics = payload?.topics || [];
        const preference = payload?.preference || 'everyone';
        const userGender = socket.user?.gender || 'prefer_not_to_say';

        const existingRoomId = await pubClient.hget('random:user_rooms', userId);
        if (existingRoomId) {
          const roomStr = await pubClient.hget('random:rooms', existingRoomId);
          if (roomStr) {
            const room = JSON.parse(roomStr);
            const partnerId = room.users.find((id: string) => id !== userId);
            const partner = partnerId ? await userService.getPublicUserProfile(partnerId) : null;
            socket.join(existingRoomId);
            socket.emit('random:matched', { roomId: existingRoomId, partner, topic: room.topic });
            return;
          }
        }

        const isQueued = await pubClient.hexists('random:queue', userId);
        if (isQueued) {
          socket.emit('random:waiting');
          return;
        }

        await pubClient.hset('random:queue', userId, JSON.stringify({
          userId, topics: userTopics, gender: userGender, preference
        }));

        socket.emit('random:waiting');
        emitMatchingStats(io);
      } catch (error) {
        logger.error('Failed to join random chat queue', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
        });
        socket.emit('random:error', {
          error: 'Could not join random chat. Please try again.',
        });
      }
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
      try {
        const pubClient = redisClient.getClient();
        await pubClient.hdel('random:queue', userId);

        const roomId = await pubClient.hget('random:user_rooms', userId);
        if (!roomId) {
          socket.emit('random:ended');
          emitMatchingStats(io);
          return;
        }

        const roomStr = await pubClient.hget('random:rooms', roomId);
        if (roomStr) {
          const room = JSON.parse(roomStr);
          const otherUserId = room.users.find((id: string) => id !== userId);

          io.to(roomId).emit('random:left', { roomId, userId });

          await pubClient.hdel('random:user_rooms', userId);
          await pubClient.hdel('random:rooms', roomId);

          if (otherUserId) {
            await pubClient.hdel('random:user_rooms', otherUserId);
          }
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
     * PARTY ROOMS (Group Chat)
     */
    socket.on('party:create', async (data: { name: string; capacity: number; isLocked: boolean }) => {
      try {
        const pubClient = redisClient.getClient();

        // Ensure user isn't already in a party
        const existingPartyId = await pubClient.hget('party:user_rooms', userId);
        if (existingPartyId) {
          // Already in a party, they should leave first
          socket.emit('party:error', { error: 'You are already in a party' });
          return;
        }

        const partyId = `party:${uuidv4()}`;
        const newParty: PartyRoom = {
          id: partyId,
          name: data.name || 'Chill Vibes Only',
          hostId: userId,
          hostName: name,
          capacity: data.capacity || 5,
          members: [{ id: userId, name, profilePictureUrl: socket.user?.profilePictureUrl, auraPoints: socket.user?.auraPoints }],
          requests: [],
          isLocked: data.isLocked || false,
          createdAt: Date.now()
        };

        await pubClient.hset('party:rooms', partyId, JSON.stringify(newParty));
        await pubClient.hset('party:user_rooms', userId, partyId);

        socket.join(partyId);
        socket.emit('party:created', newParty);
        emitActiveParties(io);
      } catch (e) {
        logger.error('Failed to create party', { error: e });
      }
    });

    socket.on('party:list', async () => {
      emitActiveParties(io);
    });

    socket.on('party:request_join', async (data: { partyId: string }) => {
      try {
        const pubClient = redisClient.getClient();

        const existingPartyId = await pubClient.hget('party:user_rooms', userId);
        if (existingPartyId) {
          socket.emit('party:error', { error: 'You are already in a party' });
          return;
        }

        const partyStr = await pubClient.hget('party:rooms', data.partyId);
        if (!partyStr) {
          socket.emit('party:error', { error: 'Party not found' });
          return;
        }

        const party: PartyRoom = JSON.parse(partyStr);

        if (party.members.length >= party.capacity) {
          socket.emit('party:error', { error: 'Party is full' });
          return;
        }

        const requester: PartyMember = {
          id: userId,
          name,
          profilePictureUrl: socket.user?.profilePictureUrl,
          auraPoints: socket.user?.auraPoints
        };

        if (party.isLocked) {
          // Bouncer Mode: Add to requests queue
          if (!party.requests.find(r => r.id === userId)) {
            party.requests.push(requester);
            await pubClient.hset('party:rooms', data.partyId, JSON.stringify(party));
            // Notify host
            io.to(`user:${party.hostId}`).emit('party:join_requested', { partyId: data.partyId, requester });
            socket.emit('party:waiting_approval');
          }
        } else {
          // Open Door Mode: Auto-join
          party.members.push(requester);
          await pubClient.hset('party:rooms', data.partyId, JSON.stringify(party));
          await pubClient.hset('party:user_rooms', userId, data.partyId);
          socket.join(data.partyId);
          io.to(data.partyId).emit('party:updated', party);
          emitActiveParties(io);
        }
      } catch (e) {
        logger.error('Failed to request join party', { error: e });
      }
    });

    socket.on('party:action', async (data: { partyId: string; targetUserId: string; action: 'accept' | 'decline' }) => {
      try {
        const pubClient = redisClient.getClient();
        const partyStr = await pubClient.hget('party:rooms', data.partyId);
        if (!partyStr) return;

        const party: PartyRoom = JSON.parse(partyStr);
        if (party.hostId !== userId) return; // Only host can do this

        const requestIndex = party.requests.findIndex(r => r.id === data.targetUserId);
        if (requestIndex === -1) return;

        const requester = party.requests[requestIndex];
        party.requests.splice(requestIndex, 1);

        if (data.action === 'accept') {
          if (party.members.length < party.capacity) {
            party.members.push(requester);
            const targetSockets = activeUsers.get(data.targetUserId);
            if (targetSockets) {
              for (const sId of targetSockets) {
                const s = io.sockets.sockets.get(sId);
                if (s) s.join(data.partyId);
              }
            }
            await pubClient.hset('party:user_rooms', data.targetUserId, data.partyId);
            io.to(`user:${data.targetUserId}`).emit('party:accepted', party);
          } else {
            io.to(`user:${data.targetUserId}`).emit('party:error', { error: 'Party is fully at capacity now' });
          }
        } else {
          io.to(`user:${data.targetUserId}`).emit('party:declined', { partyId: data.partyId });
        }

        await pubClient.hset('party:rooms', data.partyId, JSON.stringify(party));
        io.to(data.partyId).emit('party:updated', party);
      } catch (e) { }
    });

    socket.on('party:leave', async (data: { partyId: string }) => {
      try {
        const pubClient = redisClient.getClient();
        const partyStr = await pubClient.hget('party:rooms', data.partyId);
        if (!partyStr) return;

        const party: PartyRoom = JSON.parse(partyStr);
        await pubClient.hdel('party:user_rooms', userId);
        socket.leave(data.partyId);

        if (party.hostId === userId) {
          // Host left! Destroy party
          party.members.forEach(async (m) => {
            await pubClient.hdel('party:user_rooms', m.id);
          });
          io.to(data.partyId).emit('party:destroyed');
          await pubClient.hdel('party:rooms', data.partyId);
          emitActiveParties(io);
        } else {
          // Normal member left
          party.members = party.members.filter(m => m.id !== userId);
          party.requests = party.requests.filter(m => m.id !== userId);
          await pubClient.hset('party:rooms', data.partyId, JSON.stringify(party));
          io.to(data.partyId).emit('party:updated', party);
          emitActiveParties(io);
        }
      } catch (e) { }
    });

    socket.on('party:kick', async (data: { partyId: string; targetUserId: string }) => {
      try {
        const pubClient = redisClient.getClient();
        const partyStr = await pubClient.hget('party:rooms', data.partyId);
        if (!partyStr) return;

        const party: PartyRoom = JSON.parse(partyStr);
        if (party.hostId !== userId || userId === data.targetUserId) return;

        party.members = party.members.filter(m => m.id !== data.targetUserId);
        await pubClient.hdel('party:user_rooms', data.targetUserId);

        await pubClient.hset('party:rooms', data.partyId, JSON.stringify(party));
        io.to(data.partyId).emit('party:updated', party);

        const targetSockets = activeUsers.get(data.targetUserId);
        if (targetSockets) {
          for (const sId of targetSockets) {
            const s = io.sockets.sockets.get(sId);
            if (s) {
              s.emit('party:kicked');
              s.leave(data.partyId);
            }
          }
        }
        emitActiveParties(io);
      } catch (e) { }
    });

    socket.on('party:message', (data: { partyId: string; content: string }) => {
      io.to(data.partyId).emit('party:message', {
        id: uuidv4(),
        partyId: data.partyId,
        fromUserId: userId,
        fromName: name,
        fromProfilePictureUrl: socket.user?.profilePictureUrl,
        content: data.content,
        sentAt: new Date().toISOString()
      });
    });

    // WebRTC signaling for parties (Audio Mesh)
    socket.on('party:audio:signal', (data: { partyId: string; targetUserId: string; signal: any }) => {
      io.to(`user:${data.targetUserId}`).emit('party:audio:signal', {
        fromUserId: userId,
        partyId: data.partyId,
        signal: data.signal
      });
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
            // ONLY clean up state if this was the last active socket for this user
            // Implementing gracefully delay of 5 seconds to support connection recovery/drops
            logger.info('Last user socket disconnected, starting 5s grace period', { userId });

            const timeout = setTimeout(async () => {
              disconnectTimeouts.delete(userId);
              logger.info('Grace period expired, cleaning up session permanently', { userId });

              try {
                const pubClient = redisClient.getClient();

                // Clean up random queue
                await pubClient.hdel('random:queue', userId);

                // Clean up random room
                const roomId = await pubClient.hget('random:user_rooms', userId);
                if (roomId) {
                  const roomStr = await pubClient.hget('random:rooms', roomId);
                  if (roomStr) {
                    const room = JSON.parse(roomStr);
                    const otherUserId = room.users.find((id: string) => id !== userId);

                    // Notify the room that somebody left/disconnected
                    io.to(roomId).emit('random:left', {
                      roomId,
                      userId,
                    });

                    await pubClient.hdel('random:user_rooms', userId);
                    await pubClient.hdel('random:rooms', roomId);

                    if (otherUserId) {
                      await pubClient.hdel('random:user_rooms', otherUserId);
                      const otherSockets = activeUsers.get(otherUserId) ?? new Set<string>();
                      for (const id of otherSockets) {
                        const s = io.sockets.sockets.get(id);
                        if (s) s.leave(roomId);
                      }
                    }

                    // Trigger ephemeral media cleanup
                    cleanupRoomMedia(roomId);
                  } else {
                    await pubClient.hdel('random:user_rooms', userId);
                  }
                }

                // Clean up party room
                const userPartyId = await pubClient.hget('party:user_rooms', userId);
                if (userPartyId) {
                  const partyStr = await pubClient.hget('party:rooms', userPartyId);
                  if (partyStr) {
                    const party: PartyRoom = JSON.parse(partyStr);
                    await pubClient.hdel('party:user_rooms', userId);

                    if (party.hostId === userId) {
                      party.members.forEach(async (m) => {
                        await pubClient.hdel('party:user_rooms', m.id);
                      });
                      io.to(userPartyId).emit('party:destroyed');
                      await pubClient.hdel('party:rooms', userPartyId);
                    } else {
                      party.members = party.members.filter(m => m.id !== userId);
                      party.requests = party.requests.filter(m => m.id !== userId);
                      await pubClient.hset('party:rooms', userPartyId, JSON.stringify(party));
                      io.to(userPartyId).emit('party:updated', party);
                    }
                    emitActiveParties(io);
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
