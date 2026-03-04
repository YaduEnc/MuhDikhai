import database from '../config/database';
import logger from '../utils/logger';
import friendshipService from './friendship.service';

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  encryptedContent: Buffer;
  encryptedKey: Buffer;
  messageType: 'text' | 'image' | 'video' | 'audio' | 'file' | 'system';
  mediaUrl?: string;
  mediaSizeBytes?: number;
  status: 'sent' | 'delivered' | 'read';
  sentAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
  replyToMessageId?: string;
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  // Joined data
  sender?: {
    id: string;
    username?: string;
    name: string;
    profilePictureUrl?: string;
  };
  recipient?: {
    id: string;
    username?: string;
    name: string;
    profilePictureUrl?: string;
  };
  replyTo?: {
    id: string;
    messageType: string;
    encryptedContent: Buffer;
  };
}

export interface CreateMessageData {
  recipientId: string;
  encryptedContent: Buffer;
  encryptedKey: Buffer;
  messageType: 'text' | 'image' | 'video' | 'audio' | 'file' | 'system';
  mediaUrl?: string;
  mediaSizeBytes?: number;
  replyToMessageId?: string;
}

export interface UpdateMessageData {
  encryptedContent?: Buffer;
  encryptedKey?: Buffer;
}

export interface MessageReceipt {
  id: string;
  messageId: string;
  userId: string;
  receiptType: 'delivered' | 'read' | 'played';
  receivedAt: Date;
  createdAt: Date;
}

class MessageService {
  /**
   * Send a message
   */
  async sendMessage(senderId: string, data: CreateMessageData): Promise<Message> {
    try {
      // Prevent self-messaging
      if (senderId === data.recipientId) {
        throw new Error('Cannot send message to yourself');
      }

      // Check if users are friends
      const areFriends = await friendshipService.areFriends(senderId, data.recipientId);
      if (!areFriends) {
        throw new Error('Can only send messages to friends');
      }

      // Check if sender is blocked
      const isBlocked = await friendshipService.isBlocked(data.recipientId, senderId);
      if (isBlocked) {
        throw new Error('Cannot send message to user who blocked you');
      }

      // Check if recipient is blocked
      const isRecipientBlocked = await friendshipService.isBlocked(senderId, data.recipientId);
      if (isRecipientBlocked) {
        throw new Error('Cannot send message to blocked user');
      }

      // Validate reply-to message exists and belongs to conversation
      if (data.replyToMessageId) {
        const replyToMessage = await this.getMessageById(data.replyToMessageId);
        if (!replyToMessage) {
          throw new Error('Reply-to message not found');
        }
        // Ensure reply-to message is part of this conversation
        const isPartOfConversation =
          (replyToMessage.senderId === senderId && replyToMessage.recipientId === data.recipientId) ||
          (replyToMessage.senderId === data.recipientId && replyToMessage.recipientId === senderId);
        if (!isPartOfConversation) {
          throw new Error('Reply-to message is not part of this conversation');
        }
      }

      // Validate media fields
      if (data.messageType !== 'text' && data.messageType !== 'system') {
        if (!data.mediaUrl) {
          throw new Error('Media URL is required for non-text messages');
        }
        if (!data.mediaSizeBytes || data.mediaSizeBytes <= 0) {
          throw new Error('Media size must be greater than 0');
        }
      }

      const result = await database.query<Message>(
        `INSERT INTO messages (
          sender_id, recipient_id, encrypted_content, encrypted_key,
          message_type, media_url, media_size_bytes, status, reply_to_message_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING 
          id, sender_id as "senderId", recipient_id as "recipientId",
          encrypted_content as "encryptedContent", encrypted_key as "encryptedKey",
          message_type as "messageType", media_url as "mediaUrl",
          media_size_bytes as "mediaSizeBytes", status,
          sent_at as "sentAt", delivered_at as "deliveredAt", read_at as "readAt",
          reply_to_message_id as "replyToMessageId", is_edited as "isEdited",
          edited_at as "editedAt", is_deleted as "isDeleted", deleted_at as "deletedAt",
          created_at as "createdAt"`,
        [
          senderId,
          data.recipientId,
          data.encryptedContent,
          data.encryptedKey,
          data.messageType,
          data.mediaUrl || null,
          data.mediaSizeBytes || null,
          'sent',
          data.replyToMessageId || null,
        ]
      );

      const message = result.rows[0];

      logger.info('Message sent successfully', {
        messageId: message.id,
        senderId,
        recipientId: data.recipientId,
        messageType: data.messageType,
      });

      return message;
    } catch (error) {
      logger.error('Failed to send message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        senderId,
        recipientId: data.recipientId,
      });
      throw error;
    }
  }

  /**
   * Get message by ID
   */
  async getMessageById(messageId: string): Promise<Message | null> {
    try {
      const result = await database.query<Message>(
        `SELECT 
          id, sender_id as "senderId", recipient_id as "recipientId",
          encrypted_content as "encryptedContent", encrypted_key as "encryptedKey",
          message_type as "messageType", media_url as "mediaUrl",
          media_size_bytes as "mediaSizeBytes", status,
          sent_at as "sentAt", delivered_at as "deliveredAt", read_at as "readAt",
          reply_to_message_id as "replyToMessageId", is_edited as "isEdited",
          edited_at as "editedAt", is_deleted as "isDeleted", deleted_at as "deletedAt",
          created_at as "createdAt"
        FROM messages
        WHERE id = $1 AND is_deleted = false
        LIMIT 1`,
        [messageId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get message by ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId,
      });
      throw error;
    }
  }

  /**
   * Get conversation between two users
   * Returns messages with encryptedContent and encryptedKey as base64 strings for API serialization
   */
  async getConversation(
    userId1: string,
    userId2: string,
    limit: number = 50,
    offset: number = 0,
    beforeMessageId?: string
  ): Promise<{ 
    messages: Array<Omit<Message, 'encryptedContent' | 'encryptedKey'> & {
      encryptedContent: string | null;
      encryptedKey: string | null;
    }>; 
    total: number 
  }> {
    try {
      // Build WHERE clause
      let whereClause = `(
        (sender_id = $1 AND recipient_id = $2) OR 
        (sender_id = $2 AND recipient_id = $1)
      ) AND is_deleted = false`;
      
      const queryParams: any[] = [userId1, userId2];
      let paramIndex = 3;

      // Add beforeMessageId filter if provided (for pagination)
      if (beforeMessageId) {
        whereClause += ` AND id < $${paramIndex}`;
        queryParams.push(beforeMessageId);
        paramIndex++;
      }

      // Get total count
      const countResult = await database.query<{ count: string }>(
        `SELECT COUNT(*) as count
        FROM messages
        WHERE ${whereClause}`,
        queryParams.slice(0, paramIndex - (beforeMessageId ? 1 : 0))
      );
      const total = parseInt(countResult.rows[0].count, 10);

      // Get messages with sender/recipient info
      queryParams.push(limit, offset);
      const messagesResult = await database.query<Message & {
        'sender.id': string;
        'sender.username': string;
        'sender.name': string;
        'sender.profilePictureUrl': string;
        'recipient.id': string;
        'recipient.username': string;
        'recipient.name': string;
        'recipient.profilePictureUrl': string;
      }>(
        `SELECT 
          m.id, m.sender_id as "senderId", m.recipient_id as "recipientId",
          m.encrypted_content as "encryptedContent", m.encrypted_key as "encryptedKey",
          m.message_type as "messageType", m.media_url as "mediaUrl",
          m.media_size_bytes as "mediaSizeBytes", m.status,
          m.sent_at as "sentAt", m.delivered_at as "deliveredAt", m.read_at as "readAt",
          m.reply_to_message_id as "replyToMessageId", m.is_edited as "isEdited",
          m.edited_at as "editedAt", m.is_deleted as "isDeleted", m.deleted_at as "deletedAt",
          m.created_at as "createdAt",
          
          -- Sender info
          s.id as "sender.id",
          s.username as "sender.username",
          s.name as "sender.name",
          s.profile_picture_url as "sender.profilePictureUrl",
          
          -- Recipient info
          r.id as "recipient.id",
          r.username as "recipient.username",
          r.name as "recipient.name",
          r.profile_picture_url as "recipient.profilePictureUrl"
        FROM messages m
        JOIN users s ON m.sender_id = s.id
        JOIN users r ON m.recipient_id = r.id
        WHERE ${whereClause}
        ORDER BY m.sent_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        queryParams
      );

      // Format messages
      const messages = messagesResult.rows.map((row) => ({
        id: row.id,
        senderId: row.senderId,
        recipientId: row.recipientId,
        // Convert Buffer to base64 string for JSON serialization
        encryptedContent: row.encryptedContent 
          ? row.encryptedContent.toString('base64')
          : null,
        encryptedKey: row.encryptedKey
          ? row.encryptedKey.toString('base64')
          : null,
        messageType: row.messageType,
        mediaUrl: row.mediaUrl,
        mediaSizeBytes: row.mediaSizeBytes,
        status: row.status,
        sentAt: row.sentAt,
        deliveredAt: row.deliveredAt,
        readAt: row.readAt,
        replyToMessageId: row.replyToMessageId,
        isEdited: row.isEdited,
        editedAt: row.editedAt,
        isDeleted: row.isDeleted,
        deletedAt: row.deletedAt,
        createdAt: row.createdAt,
        sender: {
          id: row['sender.id'],
          username: row['sender.username'],
          name: row['sender.name'],
          profilePictureUrl: row['sender.profilePictureUrl'],
        },
        recipient: {
          id: row['recipient.id'],
          username: row['recipient.username'],
          name: row['recipient.name'],
          profilePictureUrl: row['recipient.profilePictureUrl'],
        },
      }));

      return { messages, total };
    } catch (error) {
      logger.error('Failed to get conversation', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId1,
        userId2,
      });
      throw error;
    }
  }

  /**
   * Edit a message
   */
  async editMessage(messageId: string, userId: string, data: UpdateMessageData): Promise<Message> {
    try {
      // Get message
      const message = await this.getMessageById(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      // Verify user is the sender
      if (message.senderId !== userId) {
        throw new Error('Only the sender can edit the message');
      }

      // Check if message is too old (e.g., 15 minutes)
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      if (message.sentAt < fifteenMinutesAgo) {
        throw new Error('Message is too old to edit');
      }

      // Update message
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (data.encryptedContent !== undefined) {
        updates.push(`encrypted_content = $${paramIndex}`);
        values.push(data.encryptedContent);
        paramIndex++;
      }

      if (data.encryptedKey !== undefined) {
        updates.push(`encrypted_key = $${paramIndex}`);
        values.push(data.encryptedKey);
        paramIndex++;
      }

      if (updates.length === 0) {
        return message;
      }

      updates.push(`is_edited = true`);
      values.push(messageId);

      const result = await database.query<Message>(
        `UPDATE messages 
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex} AND is_deleted = false
        RETURNING 
          id, sender_id as "senderId", recipient_id as "recipientId",
          encrypted_content as "encryptedContent", encrypted_key as "encryptedKey",
          message_type as "messageType", media_url as "mediaUrl",
          media_size_bytes as "mediaSizeBytes", status,
          sent_at as "sentAt", delivered_at as "deliveredAt", read_at as "readAt",
          reply_to_message_id as "replyToMessageId", is_edited as "isEdited",
          edited_at as "editedAt", is_deleted as "isDeleted", deleted_at as "deletedAt",
          created_at as "createdAt"`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error('Message not found or already deleted');
      }

      logger.info('Message edited successfully', { messageId, userId });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to edit message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Delete a message (soft delete)
   */
  async deleteMessage(messageId: string, userId: string): Promise<void> {
    try {
      // Get message
      const message = await this.getMessageById(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      // Verify user is the sender or recipient
      if (message.senderId !== userId && message.recipientId !== userId) {
        throw new Error('You can only delete your own messages');
      }

      // Soft delete
      await database.query(
        `UPDATE messages 
        SET is_deleted = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
        [messageId]
      );

      logger.info('Message deleted successfully', { messageId, userId });
    } catch (error) {
      logger.error('Failed to delete message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Mark message as delivered
   */
  async markAsDelivered(messageId: string, userId: string): Promise<void> {
    try {
      // Get message
      const message = await this.getMessageById(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      // Verify user is the recipient
      if (message.recipientId !== userId) {
        throw new Error('Only the recipient can mark message as delivered');
      }

      // Update status if not already delivered or read
      if (message.status === 'sent') {
        await database.query(
          `UPDATE messages 
          SET status = 'delivered', updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
          [messageId]
        );

        // Create receipt
        await this.createReceipt(messageId, userId, 'delivered');

        logger.info('Message marked as delivered', { messageId, userId });
      }
    } catch (error) {
      logger.error('Failed to mark message as delivered', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId: string, userId: string): Promise<void> {
    try {
      // Get message
      const message = await this.getMessageById(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      // Verify user is the recipient
      if (message.recipientId !== userId) {
        throw new Error('Only the recipient can mark message as read');
      }

      // Update status if not already read
      if (message.status !== 'read') {
        await database.query(
          `UPDATE messages 
          SET status = 'read', updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
          [messageId]
        );

        // Create receipt
        await this.createReceipt(messageId, userId, 'read');

        logger.info('Message marked as read', { messageId, userId });
      }
    } catch (error) {
      logger.error('Failed to mark message as read', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Mark multiple messages as read
   */
  async markMultipleAsRead(messageIds: string[], userId: string): Promise<void> {
    try {
      if (messageIds.length === 0) {
        return;
      }

      // Verify all messages belong to user and update them
      await database.query(
        `UPDATE messages 
        SET status = 'read', updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1::uuid[]) 
        AND recipient_id = $2 
        AND status != 'read'
        AND is_deleted = false`,
        [messageIds, userId]
      );

      // Create receipts for all messages
      for (const messageId of messageIds) {
        await this.createReceipt(messageId, userId, 'read');
      }

      logger.info('Multiple messages marked as read', {
        count: messageIds.length,
        userId,
      });
    } catch (error) {
      logger.error('Failed to mark multiple messages as read', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageIds,
        userId,
      });
      throw error;
    }
  }

  /**
   * Create a receipt
   */
  private async createReceipt(
    messageId: string,
    userId: string,
    receiptType: 'delivered' | 'read' | 'played'
  ): Promise<MessageReceipt> {
    try {
      const result = await database.query<MessageReceipt>(
        `INSERT INTO message_receipts (message_id, user_id, receipt_type)
        VALUES ($1, $2, $3)
        ON CONFLICT (message_id, user_id, receipt_type) DO NOTHING
        RETURNING 
          id, message_id as "messageId", user_id as "userId",
          receipt_type as "receiptType", received_at as "receivedAt",
          created_at as "createdAt"`,
        [messageId, userId, receiptType]
      );

      return result.rows[0] || {
        id: '',
        messageId,
        userId,
        receiptType,
        receivedAt: new Date(),
        createdAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to create receipt', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId,
        userId,
        receiptType,
      });
      throw error;
    }
  }

  /**
   * Get unread message count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const result = await database.query<{ count: string }>(
        `SELECT COUNT(*) as count
        FROM messages
        WHERE recipient_id = $1 
        AND status != 'read'
        AND is_deleted = false`,
        [userId]
      );

      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Failed to get unread count', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw error;
    }
  }

  /**
   * Get unread count per conversation
   */
  async getUnreadCountPerConversation(userId: string): Promise<{ [userId: string]: number }> {
    try {
      const result = await database.query<{ senderId: string; count: string }>(
        `SELECT sender_id as "senderId", COUNT(*) as count
        FROM messages
        WHERE recipient_id = $1 
        AND status != 'read'
        AND is_deleted = false
        GROUP BY sender_id`,
        [userId]
      );

      const counts: { [userId: string]: number } = {};
      for (const row of result.rows) {
        counts[row.senderId] = parseInt(row.count, 10);
      }

      return counts;
    } catch (error) {
      logger.error('Failed to get unread count per conversation', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw error;
    }
  }

  /**
   * Get all conversations for a user (list of users they've messaged or been messaged by)
   */
  async getConversations(userId: string): Promise<Array<{
    userId: string;
    username?: string;
    name: string;
    profilePictureUrl?: string;
    lastMessage?: {
      id: string;
      messageType: string;
      encryptedContent: string | null;
      sentAt: Date;
      status: string;
    };
    unreadCount: number;
  }>> {
    try {
      const result = await database.query<{
        otherUserId: string;
        otherUsername: string;
        otherName: string;
        otherProfilePictureUrl: string;
        lastMessageId: string;
        lastMessageType: string;
        lastMessageEncryptedContent: Buffer | null;
        lastMessageSentAt: Date;
        lastMessageStatus: string;
        unreadCount: string;
      }>(
        `WITH conversation_partners AS (
          SELECT DISTINCT
            CASE 
              WHEN sender_id = $1 THEN recipient_id
              ELSE sender_id
            END as other_user_id
          FROM messages
          WHERE (sender_id = $1 OR recipient_id = $1) AND is_deleted = false
        ),
        last_messages AS (
          SELECT DISTINCT ON (cp.other_user_id)
            cp.other_user_id,
            m.id as last_message_id,
            m.message_type as last_message_type,
            m.encrypted_content as last_message_encrypted_content,
            m.sent_at as last_message_sent_at,
            m.status as last_message_status
          FROM conversation_partners cp
          JOIN messages m ON (
            (m.sender_id = $1 AND m.recipient_id = cp.other_user_id) OR
            (m.sender_id = cp.other_user_id AND m.recipient_id = $1)
          )
          WHERE m.is_deleted = false
          ORDER BY cp.other_user_id, m.sent_at DESC
        ),
        unread_counts AS (
          SELECT 
            sender_id,
            COUNT(*) as unread_count
          FROM messages
          WHERE recipient_id = $1 
          AND status != 'read'
          AND is_deleted = false
          GROUP BY sender_id
        )
        SELECT 
          u.id as "otherUserId",
          u.username as "otherUsername",
          u.name as "otherName",
          u.profile_picture_url as "otherProfilePictureUrl",
          lm.last_message_id as "lastMessageId",
          lm.last_message_type as "lastMessageType",
          lm.last_message_encrypted_content as "lastMessageEncryptedContent",
          lm.last_message_sent_at as "lastMessageSentAt",
          lm.last_message_status as "lastMessageStatus",
          COALESCE(uc.unread_count, 0)::text as "unreadCount"
        FROM conversation_partners cp
        JOIN users u ON u.id = cp.other_user_id
        LEFT JOIN last_messages lm ON lm.other_user_id = cp.other_user_id
        LEFT JOIN unread_counts uc ON uc.sender_id = cp.other_user_id
        WHERE u.is_active = true
        ORDER BY lm.last_message_sent_at DESC NULLS LAST`,
        [userId]
      );

      return result.rows.map((row) => {
        // Convert Buffer to base64 string for encryptedContent
        const encryptedContent = row.lastMessageEncryptedContent
          ? row.lastMessageEncryptedContent.toString('base64')
          : null;

        return {
          userId: row.otherUserId,
          username: row.otherUsername,
          name: row.otherName,
          profilePictureUrl: row.otherProfilePictureUrl,
          lastMessage: row.lastMessageId ? {
            id: row.lastMessageId,
            messageType: row.lastMessageType,
            encryptedContent,
            sentAt: row.lastMessageSentAt,
            status: row.lastMessageStatus,
          } : undefined,
          unreadCount: parseInt(row.unreadCount, 10),
        };
      });
    } catch (error) {
      logger.error('Failed to get conversations', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw error;
    }
  }
}

const messageService = new MessageService();
export default messageService;
