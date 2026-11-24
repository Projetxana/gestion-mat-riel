// Photo handling for the daily site report.
// Always capture a full-resolution still through the phone's native camera.
// Do not capture a reduced-resolution video frame or resize ordinary photos.
export const MAX_REPORT_PHOTO_BYTES = 16 * 1024 * 1024;
export const RECOMMENDED_IMAGE_EDGE = 1600;

export const getPhotoExtension = mime => {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    return 'jpg';
};

export const humanFileSize = bytes => {
    if (!Number.isFinite(Number(bytes))) return '—';
    return `${(Number(bytes) / (1024 * 1024)).toFixed(1)} Mo`;
};

export const photoResolutionWarning = (width, height) =>
    Math.max(Number(width) || 0, Number(height) || 0) < RECOMMENDED_IMAGE_EDGE
        ? 'Résolution faible : vérifiez les détails et reprenez la photo si nécessaire.'
        : '';

const decodeImage = (blob, url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(
        'Ce format de photo ne peut pas être lu. Choisissez une image JPEG ou PNG.'
    ));
    image.src = url;
});

const toJpeg = (image, width, height) => new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        reject(new Error('Conversion de photo impossible sur cet appareil.'));
        return;
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    canvas.toBlob(blob => {
        if (!blob) reject(new Error('Conversion JPEG impossible.'));
        else resolve(blob);
    }, 'image/jpeg', 0.96);
});

export async function prepareReportPhoto(file) {
    if (!file || !Number.isFinite(file.size) || file.size === 0) {
        throw new Error('Aucun fichier photo valide sélectionné.');
    }
    if (file.size > MAX_REPORT_PHOTO_BYTES) {
        throw new Error('Photo trop volumineuse (maximum 16 Mo).');
    }

    const mime = String(file.type || '').toLowerCase();
    const lowerName = String(file.name || '').toLowerCase();
    const jpeg = mime === 'image/jpeg' || mime === 'image/jpg' ||
        (!mime && /\.jpe?g$/.test(lowerName));
    const png = mime === 'image/png' || (!mime && /\.png$/.test(lowerName));
    const convertible = ['image/heic', 'image/heif', 'image/webp'].includes(mime) ||
        (!mime && /\.(heic|heif|webp)$/.test(lowerName));
    if (!jpeg && !png && !convertible) {
        throw new Error('Format non pris en charge. Utilisez une photo JPEG, PNG, HEIC ou WebP.');
    }

    const temporaryUrl = URL.createObjectURL(file);
    let keepUrl = false;
    try {
        const image = await decodeImage(file, temporaryUrl);
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        if (width < 1 || height < 1 || width * height > 30_000_000) {
            throw new Error('Dimensions de la photo non prises en charge.');
        }

        // JPEG/PNG bytes are preserved at the camera's original resolution.
        // Safari may supply HEIC/HEIF; convert it to a universally readable
        // JPEG without reducing either dimension.
        if (jpeg || png) {
            keepUrl = true;
            return {
                blob: file,
                previewUrl: temporaryUrl,
                width, height,
                mimeType: png ? 'image/png' : 'image/jpeg',
                extension: png ? 'png' : 'jpg',
            };
        }

        const converted = await toJpeg(image, width, height);
        if (converted.size > MAX_REPORT_PHOTO_BYTES) {
            throw new Error('Cette photo convertie dépasse 16 Mo.');
        }
        return {
            blob: converted,
            previewUrl: URL.createObjectURL(converted),
            width, height,
            mimeType: 'image/jpeg',
            extension: 'jpg',
        };
    } finally {
        if (!keepUrl) URL.revokeObjectURL(temporaryUrl);
    }
}
