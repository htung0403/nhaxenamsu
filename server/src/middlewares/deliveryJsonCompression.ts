import type { RequestHandler } from 'express';
import { constants, gzip } from 'node:zlib';

const minimumBytes = 1024;

export const deliveryJsonCompression: RequestHandler = (req, res, next) => {
  if (req.method !== 'GET') return next();
  const send = res.send.bind(res);
  res.send = (body: unknown) => {
    const contentType = String(res.getHeader('Content-Type') || '');
    const cacheControl = String(res.getHeader('Cache-Control') || '');
    if (res.statusCode !== 200 || typeof body !== 'string'
      || !/^application\/(?:[\w.-]+\+)?json\b/i.test(contentType)
      || res.hasHeader('Content-Encoding') || /\bno-transform\b/i.test(cacheControl)
      || Buffer.byteLength(body, 'utf8') < minimumBytes) {
      return send(body);
    }

    res.vary('Accept-Encoding');
    if (req.acceptsEncodings('gzip', 'identity') !== 'gzip') return send(body);

    gzip(body, { level: constants.Z_BEST_SPEED }, (error, compressed) => {
      if (res.destroyed) return;
      if (error) return next(error);
      res.setHeader('Content-Encoding', 'gzip');
      res.removeHeader('Content-Length');
      send(compressed);
    });
    return res;
  };
  next();
};
