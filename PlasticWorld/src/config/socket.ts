import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwtService from '../services/jwt.service';
import sessionService from '../services/session.service';
import userService from '../services/user.service';
import messageService from '../services/message.service';
import logger from '../utils/logger';
import { ExtendedError } from 'socket.io/dist/namespace';

interface SocketUser {
  userId: string;
  deviceId: string;
  username?: string;
  name: string;
}

interface AuthenticatedSocket extends Socket {
  user?: SocketUser;
}

// Store active users (userId -> Set of socketIds)
const activeUsers = new Map<string, Set<string>>();

// Store typing indicators (conversationId -> Set of userIds)
const typingUsers = new Map<string, Set<string>>();

// Random chat state (ephemeral, in-memory)
interface RandomRoom {
  id: string;
  users: [string, string]; // userIds
}

// FIFO queue of userIds waiting for a random partner
const randomQueue: string[] = [];

// Map userId -> current random roomId (if any)
const userToRandomRoom = new Map<string, string>();

// Map roomId -> room metadata
const randomRooms = new Map<string, RandomRoom>();

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
  io.use(socketAuth);

  io.on('connection', (socket: AuthenticatedSocket) => {
    if (!socket.user) {
      socket.disconnect();
      return;
    }

    const { userId, name } = socket.user;

    logger.info('Socket connected', { userId, socketId: socket.id });

    // Add user to active users
    if (!activeUsers.has(userId)) {
      activeUsers.set(userId, new Set());
    }
    activeUsers.get(userId)!.add(socket.id);

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Notify friends that user is online
    io.emit('user:online', { userId, name });

    /**
     * Random chat: join the gentle queue
     */
    socket.on('random:join', async () => {
      try {
        // If user is already in a room, just echo back state
        const existingRoomId = userToRandomRoom.get(userId);
        if (existingRoomId) {
          const room = randomRooms.get(existingRoomId);
          if (room) {
            const partnerId = room.users.find((id) => id !== userId);
            const partner = partnerId ? await userService.getPublicUserProfile(partnerId) : null;
            socket.join(existingRoomId);
            socket.emit('random:matched', {
              roomId: existingRoomId,
              partner,
            });
            return;
          }
        }

        // If already queued, do nothing
        if (randomQueue.includes(userId)) {
          socket.emit('random:waiting');
          return;
        }

        // Try to find a partner from the queue
        while (randomQueue.length > 0) {
          const candidateId = randomQueue.shift();
          if (!candidateId || candidateId === userId) {
            continue;
          }

          // Ensure candidate is still online and not already in a room
          if (!activeUsers.has(candidateId) || userToRandomRoom.has(candidateId)) {
            continue;
          }

          const roomId = `random:${[userId, candidateId].sort().join(':')}:${Date.now()}`;
          const room: RandomRoom = {
            id: roomId,
            users: [userId, candidateId],
          };
          randomRooms.set(roomId, room);
          userToRandomRoom.set(userId, roomId);
          userToRandomRoom.set(candidateId, roomId);

          // Fetch partner profiles (public view)
          const [selfProfile, partnerProfile] = await Promise.all([
            userService.getPublicUserProfile(userId),
            userService.getPublicUserProfile(candidateId),
          ]);

          // Join all sockets for both users to the room
          const thisSockets = activeUsers.get(userId) ?? new Set<string>();
          const partnerSockets = activeUsers.get(candidateId) ?? new Set<string>();

          for (const id of thisSockets) {
            const s = io.sockets.sockets.get(id);
            if (s) {
              s.join(roomId);
              s.emit('random:matched', {
                roomId,
                partner: partnerProfile,
              });
            }
          }

          for (const id of partnerSockets) {
            const s = io.sockets.sockets.get(id);
            if (s) {
              s.join(roomId);
              s.emit('random:matched', {
                roomId,
                partner: selfProfile,
              });
            }
          }

          logger.info('Random chat match created', {
            roomId,
            userA: userId,
            userB: candidateId,
          });

          return;
        }

        // No partner yet; enqueue user
        randomQueue.push(userId);
        socket.emit('random:waiting');
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
    socket.on('random:message', (data: { roomId: string; content: string }) => {
      try {
        const currentRoomId = userToRandomRoom.get(userId);
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
          roomId: currentRoomId,
          fromUserId: userId,
          fromName: name,
          content: trimmed,
          sentAt: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Failed to relay random chat message', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
        });
      }
    });

    /**
     * Random chat: leave current room / queue
     */
    socket.on('random:leave', () => {
      try {
        // Remove from queue if waiting
        const queueIndex = randomQueue.indexOf(userId);
        if (queueIndex !== -1) {
          randomQueue.splice(queueIndex, 1);
        }

        const roomId = userToRandomRoom.get(userId);
        if (!roomId) {
          socket.emit('random:ended');
          return;
        }

        const room = randomRooms.get(roomId);
        userToRandomRoom.delete(userId);

        if (room) {
          const otherUserId = room.users.find((id) => id !== userId);
          randomRooms.delete(roomId);

          if (otherUserId) {
            userToRandomRoom.delete(otherUserId);
            const otherSockets = activeUsers.get(otherUserId) ?? new Set<string>();
            for (const id of otherSockets) {
              const s = io.sockets.sockets.get(id);
              if (s) {
                s.leave(roomId);
                s.emit('random:left', {
                  roomId,
                  userId,
                });
              }
            }
          }
        }

        socket.leave(roomId);
        socket.emit('random:ended', { roomId });
      } catch (error) {
        logger.error('Failed to leave random chat', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
        });
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

        // Clean up random queue / rooms
        const queueIndex = randomQueue.indexOf(userId);
        if (queueIndex !== -1) {
          randomQueue.splice(queueIndex, 1);
        }

        const roomId = userToRandomRoom.get(userId);
        if (roomId) {
          const room = randomRooms.get(roomId);
          userToRandomRoom.delete(userId);
          randomRooms.delete(roomId);

          if (room) {
            const otherUserId = room.users.find((id) => id !== userId);
            if (otherUserId) {
              userToRandomRoom.delete(otherUserId);
              const otherSockets = activeUsers.get(otherUserId) ?? new Set<string>();
              for (const id of otherSockets) {
                const s = io.sockets.sockets.get(id);
                if (s) {
                  s.leave(roomId);
                  s.emit('random:left', {
                    roomId,
                    userId,
                  });
                }
              }
            }
          }
        }

        // Remove socket from active users
        const userSockets = activeUsers.get(userId);
        if (userSockets) {
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            // User is no longer online
            activeUsers.delete(userId);
            await userService.updateStatus(userId, 'offline');
            io.emit('user:offline', { userId, name });
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
