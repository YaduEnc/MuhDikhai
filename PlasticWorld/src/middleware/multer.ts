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

// File filter
const fileFilter = (_req: any, file: any, cb: any) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new AppError('Invalid file type. Only JPEG, PNG, WEBP, and GIF are allowed.', 400, 'INVALID_FILE_TYPE'), false);
    }
};

// Export upload middleware
export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
});
