import { z } from 'zod';

/**
 * Validation schemas for authentication endpoints
 */

// Google Sign-In
export const googleSignInSchema = z.object({
  idToken: z.string().min(1, 'ID token is required'),
});

// Complete Profile
export const completeProfileSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{1,14}$/, 'Phone number must be in E.164 format (e.g., +1234567890)')
    .optional(),
  age: z.number().int().min(13, 'Age must be at least 13').max(120, 'Age must be at most 120'),
});

// Refresh Token
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// Device Info (for device creation)
export const deviceInfoSchema = z.object({
  deviceName: z.string().min(1, 'Device name is required').max(100, 'Device name too long'),
  deviceType: z.enum(['ios', 'android', 'web', 'desktop'], {
    errorMap: () => ({ message: 'Device type must be ios, android, web, or desktop' }),
  }),
  deviceToken: z.string().optional(),
});

/**
 * Validation schemas for user endpoints
 */

// Update Profile
export const updateProfileSchema = z.object({
  username: z
    .union([
      z.string()
        .min(3, 'Username must be at least 3 characters')
        .max(30, 'Username must be at most 30 characters')
        .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
      z.literal('').transform(() => undefined),
    ])
    .optional(),
  phoneNumber: z
    .union([
      z.string().regex(/^\+91\d{10}$/, 'Phone number must be +91 followed by 10 digits (e.g., +911234567890)'),
      z.literal('').transform(() => undefined),
    ])
    .optional(),
  name: z
    .union([
      z.string()
        .min(1, 'Name must be at least 1 character')
        .max(100, 'Name must be at most 100 characters'),
      z.literal('').transform(() => undefined),
    ])
    .optional(),
  bio: z
    .union([
      z.string().max(500, 'Bio must be at most 500 characters'),
      z.literal('').transform(() => undefined),
    ])
    .optional(),
  profilePictureUrl: z
    .union([
      z.string().url('Profile picture URL must be a valid URL'),
      z.literal('').transform(() => undefined),
    ])
    .optional(),
  gender: z
    .enum(['male', 'female', 'non-binary', 'other', 'prefer_not_to_say'], {
      errorMap: () => ({ message: 'Invalid gender value' }),
    })
    .optional(),
});

// Update Status
export const updateStatusSchema = z.object({
  status: z.enum(['online', 'away', 'offline'], {
    errorMap: () => ({ message: 'Status must be online, away, or offline' }),
  }),
});

/**
 * Validation schemas for friendship endpoints
 */

// Send Friend Request
export const sendFriendRequestSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
});

// Block User
export const blockUserSchema = z.object({
  reason: z.string().max(500, 'Reason must be at most 500 characters').optional(),
});

// Friendship Query Parameters
export const friendshipQuerySchema = z
  .object({
    status: z.enum(['accepted', 'pending', 'denied', 'blocked']).optional(),
    limit: z.string().optional(),
    offset: z.string().optional(),
  })
  .transform((data) => ({
    status: data.status as 'accepted' | 'pending' | 'denied' | 'blocked' | undefined,
    limit: data.limit ? parseInt(data.limit, 10) : 50,
    offset: data.offset ? parseInt(data.offset, 10) : 0,
  }))
  .pipe(
    z.object({
      status: z.enum(['accepted', 'pending', 'denied', 'blocked']).optional(),
      limit: z.number().int().min(1).max(100),
      offset: z.number().int().min(0),
    })
  );

// Search Users Query Parameters
export const searchUsersQuerySchema = z
  .object({
    q: z.string().min(1, 'Search query is required').max(100, 'Search query too long'),
    type: z.enum(['username', 'email', 'phone', 'all']).optional(),
    limit: z.string().optional(),
    offset: z.string().optional(),
  })
  .transform((data) => ({
    q: data.q,
    type: (data.type || 'all') as 'username' | 'email' | 'phone' | 'all',
    limit: data.limit ? parseInt(data.limit, 10) : 20,
    offset: data.offset ? parseInt(data.offset, 10) : 0,
  }))
  .pipe(
    z.object({
      q: z.string(),
      type: z.enum(['username', 'email', 'phone', 'all']),
      limit: z.number().int().min(1).max(100),
      offset: z.number().int().min(0),
    })
  );

/**
 * Validate request body against schema
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: errors,
          },
        });
      }
      next(error);
    }
  };
}

/**
 * Validation schemas for message endpoints
 */

// Send Message
export const sendMessageSchema = z.object({
  recipientId: z.string().uuid('Invalid recipient ID format'),
  encryptedContent: z.string().min(1, 'Encrypted content is required'), // Base64 encoded
  encryptedKey: z.string().min(1, 'Encrypted key is required'), // Base64 encoded
  messageType: z.enum(['text', 'image', 'video', 'audio', 'file', 'system'], {
    errorMap: () => ({ message: 'Message type must be text, image, video, audio, file, or system' }),
  }),
  mediaUrl: z.string().url('Media URL must be a valid URL').optional(),
  mediaSizeBytes: z.number().int().positive('Media size must be positive').optional(),
  replyToMessageId: z.string().uuid('Invalid reply-to message ID format').optional(),
});

// Edit Message
export const editMessageSchema = z.object({
  encryptedContent: z.string().min(1, 'Encrypted content is required').optional(), // Base64 encoded
  encryptedKey: z.string().min(1, 'Encrypted key is required').optional(), // Base64 encoded
});

// Conversation Query Parameters
export const conversationQuerySchema = z
  .object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    beforeMessageId: z.string().uuid('Invalid message ID format').optional(),
  })
  .transform((data) => ({
    limit: data.limit ? parseInt(data.limit, 10) : 50,
    offset: data.offset ? parseInt(data.offset, 10) : 0,
    beforeMessageId: data.beforeMessageId,
  }))
  .pipe(
    z.object({
      limit: z.number().int().min(1).max(100),
      offset: z.number().int().min(0),
      beforeMessageId: z.string().uuid().optional(),
    })
  );

/**
 * Validate request query parameters against schema
 */
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        return res.status(400).json({
          success: false,
          error: {
            message: 'Query validation failed',
            code: 'VALIDATION_ERROR',
            details: errors,
          },
        });
      }
      next(error);
    }
  };
}
