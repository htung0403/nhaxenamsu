import { Request, Response } from 'express';
import { successResponse, errorResponse } from '../../utils/response';
import cloudinary from '../../config/cloudinary';
import { getCloudinaryUploadConfig } from '../../config/cloudinary';

export class UploadController {
  static async createUploadSignature(req: Request, res: Response) {
    try {
      const folderPath = typeof req.body.folder === 'string' && req.body.folder.trim()
        ? req.body.folder.trim()
        : 'import-orders';
      const uploadConfig = getCloudinaryUploadConfig();
      const timestamp = Math.round(Date.now() / 1000);
      const paramsToSign = {
        folder: folderPath,
        timestamp,
      };

      const signature = cloudinary.utils.api_sign_request(paramsToSign, uploadConfig.api_secret);

      return res.status(200).json(successResponse({
        cloudName: uploadConfig.cloud_name,
        apiKey: uploadConfig.api_key,
        folder: folderPath,
        timestamp,
        signature,
      }, 'Tạo chữ ký upload thành công'));
    } catch (err: any) {
      console.error('Upload signature catch error:', err);
      return res.status(500).json(errorResponse(err.message || 'Lỗi server khi tạo chữ ký upload'));
    }
  }

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
