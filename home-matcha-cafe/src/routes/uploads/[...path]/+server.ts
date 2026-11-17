import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';

const MIME_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
};

export const GET: RequestHandler = async ({ params }) => {
    const rawSubPath = params.path;
    if (!rawSubPath) {
        return new Response('Not Found', { status: 404 });
    }

    // ป้องกัน Path Traversal
    const safeSubPath = path.normalize(rawSubPath).replace(/^(\.\.[\/\\])+/, '');
    const uploadsBase = path.resolve(process.cwd(), 'static', 'uploads');
    const filePath = path.join(uploadsBase, safeSubPath);

    // ตรวจสอบว่าไฟล์อยู่ภายใน static/uploads จริงหรือไม่
    if (!filePath.startsWith(uploadsBase)) {
        return new Response('Forbidden', { status: 403 });
    }

    if (!fs.existsSync(filePath)) {
        return new Response('File Not Found', { status: 404 });
    }

    try {
        const fileBuffer = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        return new Response(fileBuffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400',
                'Content-Length': String(fileBuffer.length)
            }
        });
    } catch (e) {
        console.error('Error serving upload file:', e);
        return new Response('Internal Server Error', { status: 500 });
    }
};
