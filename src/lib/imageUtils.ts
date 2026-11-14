const MAX_DIMENSION = 720;
const MAX_DATA_URL_LENGTH = 240000;

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read the selected image file.'));
    img.src = url;
  });
}

function encodeSourceToCompressedDataUrl(
  source: HTMLImageElement | HTMLVideoElement,
  sourceWidth: number,
  sourceHeight: number
): string {
  if (!sourceWidth || !sourceHeight) {
    throw new Error('Could not read image dimensions.');
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to process this photo in your browser.');
  }

  ctx.drawImage(source, 0, 0, width, height);

  let dataUrl = canvas.toDataURL('image/jpeg', 0.72);
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.5);
  }

  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error('Photo is still too large after compression. Please pick a smaller image.');
  }

  return dataUrl;
}

export async function compressImageFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (JPG, PNG, or WebP).');
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Image file is too large. Please choose a photo under 15 MB.');
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await loadImageFromUrl(objectUrl);
    return encodeSourceToCompressedDataUrl(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function captureVideoFrameToDataUrl(video: HTMLVideoElement): string {
  return encodeSourceToCompressedDataUrl(video, video.videoWidth, video.videoHeight);
}
