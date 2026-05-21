import { v2 as cloudinary } from 'cloudinary';
import { env } from './env';

export type CloudinaryUploadTarget = 'primary' | 'backup';

type CloudinaryUploadConfig = {
  cloud_name: string;
  api_key: string;
  api_secret: string;
};

const primaryCloudinaryConfig: CloudinaryUploadConfig = {
  cloud_name: env.CLOUDINARY_CLOUD_NAME || 'diwmkhk0g',
  api_key: env.CLOUDINARY_API_KEY || '679633132267696',
  api_secret: env.CLOUDINARY_API_SECRET || 'QZ9pGYa6eX4SeJbKm4u7ApKTMHc'
};

const backupCloudinaryConfig =
  env.CLOUDINARY_BACKUP_CLOUD_NAME &&
  env.CLOUDINARY_BACKUP_API_KEY &&
  env.CLOUDINARY_BACKUP_API_SECRET
    ? {
        cloud_name: env.CLOUDINARY_BACKUP_CLOUD_NAME,
        api_key: env.CLOUDINARY_BACKUP_API_KEY,
        api_secret: env.CLOUDINARY_BACKUP_API_SECRET
      }
    : null;

cloudinary.config({
  ...primaryCloudinaryConfig
});

export function getCloudinaryUploadConfig(): CloudinaryUploadConfig & { target: CloudinaryUploadTarget } {
  if (env.CLOUDINARY_UPLOAD_TARGET === 'backup' && backupCloudinaryConfig) {
    return {
      ...backupCloudinaryConfig,
      target: 'backup'
    };
  }

  return {
    ...primaryCloudinaryConfig,
    target: 'primary'
  };
}

export default cloudinary;
