import axiosClient from './axiosClient';

export interface UploadResponse {
  url: string;
  path: string;
}

interface UploadSignatureResponse {
  cloudName: string;
  apiKey: string;
  folder: string;
  timestamp: number;
  signature: string;
}

interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
}

const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.78;

const shouldResizeImage = (file: File) =>
  file.type.startsWith('image/') && file.type !== 'image/gif' && file.type !== 'image/svg+xml';

const getImageSize = (image: HTMLImageElement) => ({
  width: image.naturalWidth || image.width,
  height: image.naturalHeight || image.height,
});

const calculateImageSize = (width: number, height: number) => {
  const largestSide = Math.max(width, height);
  if (largestSide <= MAX_IMAGE_DIMENSION) return { width, height };

  const scale = MAX_IMAGE_DIMENSION / largestSide;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
};

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Không đọc được ảnh tải lên'));
    };
    image.src = objectUrl;
  });

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Không nén được ảnh tải lên'));
    }, type, quality);
  });

const resizeImageForUpload = async (file: File) => {
  if (!shouldResizeImage(file) || typeof document === 'undefined') return file;

  try {
    const image = await loadImage(file);
    const { width, height } = getImageSize(image);
    const targetSize = calculateImageSize(width, height);

    if (targetSize.width === width && targetSize.height === height && file.size <= 900 * 1024) {
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetSize.width;
    canvas.height = targetSize.height;

    const context = canvas.getContext('2d');
    if (!context) return file;

    context.drawImage(image, 0, 0, targetSize.width, targetSize.height);
    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await canvasToBlob(canvas, outputType, IMAGE_QUALITY);

    if (blob.size >= file.size) return file;

    const extension = outputType === 'image/png' ? 'png' : 'jpg';
    const fileName = file.name.replace(/\.[^.]+$/, '') || 'upload';
    return new File([blob], `${fileName}.${extension}`, {
      type: outputType,
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn('[uploadApi] Falling back to original image:', error);
    return file;
  }
};

export const uploadApi = {
  uploadFile: async (file: File, bucket = 'avatars', folder = 'user-avatars') => {
    const preparedFile = await resizeImageForUpload(file);
    const { data: signature } = await axiosClient.post<UploadSignatureResponse>('/upload/signature', {
      bucket,
      folder,
    });

    const formData = new FormData();
    formData.append('file', preparedFile);
    formData.append('api_key', signature.apiKey);
    formData.append('timestamp', String(signature.timestamp));
    formData.append('signature', signature.signature);
    formData.append('folder', signature.folder);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Upload ảnh lên Cloudinary thất bại');
    }

    const data = await response.json() as CloudinaryUploadResponse;
    return {
      url: data.secure_url,
      path: data.public_id,
    } satisfies UploadResponse;
  },
};
