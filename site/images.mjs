export const MAX_IMAGES_PER_MESSAGE = 4;
export const MAX_IMAGE_DATA_URL_LENGTH = 750_000;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const TARGET_BYTES = 384 * 1024;
const MAX_EDGE = 2048;

export function isSafeImageDataUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_IMAGE_DATA_URL_LENGTH) return false;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return false;
  let header;
  try { header = atob(match[2].slice(0, 24)); } catch { return false; }
  if (match[1] === 'jpeg') return header.startsWith('\xff\xd8\xff');
  if (match[1] === 'png') return header.startsWith('\x89PNG\r\n\x1a\n');
  return header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
}

export function isValidImageAttachment(value) {
  return Boolean(value) && typeof value === 'object'
    && typeof value.name === 'string' && value.name.length <= 240
    && isSafeImageDataUrl(value.dataUrl);
}

function blobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('读取图片失败，请重新选择。'));
    reader.readAsDataURL(blob);
  });
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* Try the browser image decoder too. */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('无法读取这张图片，请换成 JPG、PNG 或截图后重试。'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function prepareImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    throw new Error('请选择 JPG、PNG、WebP 或 GIF 图片。');
  }
  if (!file.size || file.size > MAX_SOURCE_BYTES) throw new Error('原图需小于 20 MB，请压缩或截图后重试。');
  const image = await decodeImage(file);
  const canvas = document.createElement('canvas');
  try {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error('图片内容为空，请重新选择。');
    let scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    for (let attempt = 0; attempt < 6; attempt += 1) {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('浏览器无法处理图片，请更新浏览器后重试。');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const quality = attempt === 0 ? .86 : attempt === 1 ? .72 : .58;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) throw new Error('图片处理失败，请重新选择。');
      if (blob.size <= TARGET_BYTES) {
        const dataUrl = await blobDataUrl(blob);
        if (!isSafeImageDataUrl(dataUrl)) throw new Error('图片格式无效，请重新选择。');
        return { name: file.name.slice(0, 240), dataUrl };
      }
      if (attempt >= 2) scale *= .75;
    }
    throw new Error('图片压缩后仍然过大，请裁剪或截图后重试。');
  } finally {
    image.close?.();
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function prepareImages(files, existingCount = 0) {
  if (files.length + existingCount > MAX_IMAGES_PER_MESSAGE) throw new Error('每条消息最多上传 4 张图片。');
  const images = [];
  // Decode one photo at a time to limit memory use on phones.
  for (const file of files) images.push(await prepareImage(file));
  return images;
}
