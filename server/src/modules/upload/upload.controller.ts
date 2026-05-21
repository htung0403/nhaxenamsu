import { Request, Response } from 'express';
import { successResponse, errorResponse } from '../../utils/response';
import cloudinary from '../../config/cloudinary';
import { getCloudinaryUploadConfig } from '../../config/cloudinary';

export class UploadController {
  static async uploadFile(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json(errorResponse('Không tìm thấy file tải lên'));
      }

      const file = req.file;
      const folderPath = req.body.folder || 'import-orders';

      const b64 = Buffer.from(file.buffer).toString('base64');
      const dataURI = "data:" + file.mimetype + ";base64," + b64;
      const uploadConfig = getCloudinaryUploadConfig();

      const result = await cloudinary.uploader.upload(dataURI, {
        cloud_name: uploadConfig.cloud_name,
        api_key: uploadConfig.api_key,
        api_secret: uploadConfig.api_secret,
        folder: folderPath,
        format: 'webp',
        quality: 'auto'
      });

      return res.status(200).json(successResponse({
        url: result.secure_url,
        path: result.public_id
      }, 'Upload thành công'));
    } catch (err: any) {
      console.error('Upload catch error:', err);
      return res.status(500).json(errorResponse(err.message || 'Lỗi server khi upload ảnh'));
    }
  }
}
