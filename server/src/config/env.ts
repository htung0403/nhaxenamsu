import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const envSchema = z.object({
  PORT: z.string().default('3000').transform(Number),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_BACKUP_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_BACKUP_API_KEY: z.string().optional(),
  CLOUDINARY_BACKUP_API_SECRET: z.string().optional(),
  CLOUDINARY_UPLOAD_TARGET: z.enum(['primary', 'backup']).optional().default('backup'),
  ZALO_ENABLE_SENDS: z.string().optional().default('false'),
  CLIENT_URL: z.string().url().optional().default('http://localhost:5173'),
  DRIVER_LOCATION_MIN_INTERVAL_SECONDS: z.string().optional().default('10').transform(Number),
  DRIVER_LOCATION_MIN_DISTANCE_METERS: z.string().optional().default('20').transform(Number),
  DRIVER_OFFLINE_AFTER_SECONDS: z.string().optional().default('60').transform(Number),
  DRIVER_LOCATION_RETENTION_DAYS: z.string().optional().default('7').transform(Number),
  DRIVER_MAP_REALTIME_ENABLED: z.string().optional().default('true'),
  DRIVER_MAP_EGRESS_PERCENT: z.string().optional().default('0').transform(Number),
  DRIVER_MAP_AVERAGE_SPEED_KMH: z.string().optional().default('22').transform(Number),
  ROUTING_PROVIDER: z.enum(['osrm']).optional().default('osrm'),
  OSRM_BASE_URL: z.string().url().optional().default('https://router.project-osrm.org'),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  const missingVars = _env.error.issues.map(i => i.path.join('.')).join(', ');
  console.error(`❌ Missing or invalid environment variables: ${missingVars}`);
  console.error('Please ensure all required environment variables are set in your .env file or Vercel project settings.');
  // In production (Vercel), we shouldn't exit as it kills the function, but instead return an error or handle it
  if (process.env.NODE_ENV === 'production') {
    console.error('SERVER STARTUP FAILED DUE TO MISSING ENV VARS');
  } else {
    process.exit(1);
  }
}

export const env = _env.data;
