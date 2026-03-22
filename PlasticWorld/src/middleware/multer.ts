import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from './errorHandler';

// Define storage
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, path.join(__dirname, '../../public/uploads'));
    },
    filename: (_req, file, cb) => {
        // Generate unique filename: uuid + extension
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    },
});

const MEDIA_ALLOWED_TYPES = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
];

const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const mediaFileFilter = (_req: any, file: any, cb: any) => {
    if (MEDIA_ALLOWED_TYPES.includes(file.mimetype)) {
        cb(null, true);
        return;
    }
    cb(new AppError('Invalid file type. Only standard images and videos (MP4, WEBM) are allowed.', 400, 'INVALID_FILE_TYPE'), false);
};

const avatarFileFilter = (_req: any, file: any, cb: any) => {
    if (AVATAR_ALLOWED_TYPES.includes(file.mimetype)) {
        cb(null, true);
        return;
    }
    cb(new AppError('Invalid avatar type. Only JPEG, PNG, WEBP, or GIF images are allowed.', 400, 'INVALID_AVATAR_TYPE'), false);
};

// General media upload middleware (chat media, etc.)
export const upload = multer({
    storage,
    fileFilter: mediaFileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit for media/video
    },
});

// Dedicated avatar upload middleware
export const avatarUpload = multer({
    storage,
    fileFilter: avatarFileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max avatar image
    },
});
