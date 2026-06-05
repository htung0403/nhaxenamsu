import fs from 'fs/promises';
import path from 'path';
import cloudinary, { getCloudinaryUploadConfig } from '../src/config/cloudinary';
import { supabaseService } from '../src/config/supabase';

type ColumnKind = 'scalar' | 'array';

type ImageColumn = {
  table: string;
  idColumn: string;
  column: string;
  kind: ColumnKind;
};

type UrlReference = {
  table: string;
  idColumn: string;
  rowId: string;
  column: string;
  kind: ColumnKind;
  url: string;
};

type AssetRecord = {
  sourceUrl: string;
  sourceFetchUrl: string;
  sourcePublicId: string;
  sourceVersion?: string;
  backupPublicId: string;
  references: UrlReference[];
};

type MappingRecord = AssetRecord & {
  status: 'copied' | 'failed' | 'skipped';
  backupUrl?: string;
  error?: string;
};

const PRIMARY_CLOUD_NAME = process.env.CLOUDINARY_PRIMARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || 'diwmkhk0g';
const BACKUP_CLOUD_NAME = process.env.CLOUDINARY_BACKUP_CLOUD_NAME || 'dk7iecqxs';
const PRIMARY_HOST_MARKER = `res.cloudinary.com/${PRIMARY_CLOUD_NAME}/`;
const OUT_DIR = path.join(process.cwd(), 'tmp', 'cloudinary-migration');
const INVENTORY_FILE = path.join(OUT_DIR, 'inventory.json');
const MAPPING_FILE = path.join(OUT_DIR, 'mapping.json');
const DB_UPDATES_FILE = path.join(OUT_DIR, 'db-updates.json');
const CLEANUP_UPDATES_FILE = path.join(OUT_DIR, 'cleanup-updates.json');

const IMAGE_COLUMNS: ImageColumn[] = [
  { table: 'profiles', idColumn: 'id', column: 'avatar_url', kind: 'scalar' },
  { table: 'products', idColumn: 'id', column: 'image_url', kind: 'scalar' },
  { table: 'import_orders', idColumn: 'id', column: 'receipt_image_url', kind: 'scalar' },
  { table: 'import_orders', idColumn: 'id', column: 'receipt_image_urls', kind: 'array' },
  { table: 'vegetable_orders', idColumn: 'id', column: 'receipt_image_url', kind: 'scalar' },
  { table: 'vegetable_orders', idColumn: 'id', column: 'receipt_image_urls', kind: 'array' },
  { table: 'import_order_items', idColumn: 'id', column: 'image_url', kind: 'scalar' },
  { table: 'import_order_items', idColumn: 'id', column: 'image_urls', kind: 'array' },
  { table: 'vegetable_order_items', idColumn: 'id', column: 'image_url', kind: 'scalar' },
  { table: 'vegetable_order_items', idColumn: 'id', column: 'image_urls', kind: 'array' },
  { table: 'delivery_orders', idColumn: 'id', column: 'image_url', kind: 'scalar' },
  { table: 'delivery_orders', idColumn: 'id', column: 'image_urls', kind: 'array' },
  { table: 'delivery_vehicles', idColumn: 'id', column: 'image_urls', kind: 'array' },
  { table: 'export_orders', idColumn: 'id', column: 'image_url', kind: 'scalar' },
  { table: 'export_orders', idColumn: 'id', column: 'image_urls', kind: 'array' },
  { table: 'payment_collections', idColumn: 'id', column: 'image_url', kind: 'scalar' },
  { table: 'expenses', idColumn: 'id', column: 'image_urls', kind: 'array' },
];

function getArgValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function isPrimaryCloudinaryUrl(value: unknown): value is string {
  return typeof value === 'string' && value.includes(PRIMARY_HOST_MARKER);
}

function isTransformationSegment(segment: string): boolean {
  return (segment.includes('_') || segment.includes(',')) && !/^v\d+$/.test(segment);
}

function parseCloudinaryUrl(url: string) {
  const parsed = new URL(url);
  const uploadIndex = parsed.pathname.indexOf('/upload/');
  if (uploadIndex === -1) {
    throw new Error(`URL missing /upload/: ${url}`);
  }

  const afterUpload = parsed.pathname.slice(uploadIndex + '/upload/'.length);
  const segments = afterUpload.split('/').filter(Boolean);

  if (segments[0] && isTransformationSegment(segments[0])) {
    segments.shift();
  }

  let version: string | undefined;
  if (segments[0] && /^v\d+$/.test(segments[0])) {
    version = segments.shift();
  }

  const publicIdWithExtension = decodeURIComponent(segments.join('/'));
  const publicId = publicIdWithExtension.replace(/\.[a-z0-9]+$/i, '');
  const sourcePath = [version, publicIdWithExtension].filter(Boolean).join('/');
  const sourceFetchUrl = `https://res.cloudinary.com/${PRIMARY_CLOUD_NAME}/image/upload/${sourcePath}`;

  return {
    publicId,
    version,
    sourceFetchUrl,
  };
}

async function ensureOutDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

async function writeJson(filePath: string, data: unknown) {
  await ensureOutDir();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function fetchColumnReferences(config: ImageColumn): Promise<UrlReference[]> {
  const references: UrlReference[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabaseService
      .from(config.table)
      .select(`${config.idColumn}, ${config.column}`)
      .range(from, to);

    if (error) {
      console.warn(`Skipping ${config.table}.${config.column}: ${error.message}`);
      return references;
    }

    if (!data || data.length === 0) {
      return references;
    }

    for (const row of data as Record<string, unknown>[]) {
      const rowId = String(row[config.idColumn]);
      const value = row[config.column];

      if (config.kind === 'array' && Array.isArray(value)) {
        for (const url of value) {
          if (isPrimaryCloudinaryUrl(url)) {
            references.push({ ...config, rowId, url });
          }
        }
      }

      if (config.kind === 'scalar' && isPrimaryCloudinaryUrl(value)) {
        references.push({ ...config, rowId, url: value });
      }
    }

    if (data.length < pageSize) {
      return references;
    }

    from += pageSize;
  }
}

async function buildInventory(): Promise<AssetRecord[]> {
  const references: UrlReference[] = [];

  for (const config of IMAGE_COLUMNS) {
    references.push(...await fetchColumnReferences(config));
  }

  const assets = new Map<string, AssetRecord>();

  for (const reference of references) {
    const parsed = parseCloudinaryUrl(reference.url);
    const key = parsed.publicId;
    const existing = assets.get(key);

    if (existing) {
      existing.references.push(reference);
      continue;
    }

    assets.set(key, {
      sourceUrl: reference.url,
      sourceFetchUrl: parsed.sourceFetchUrl,
      sourcePublicId: parsed.publicId,
      sourceVersion: parsed.version,
      backupPublicId: parsed.publicId,
      references: [reference],
    });
  }

  return Array.from(assets.values()).sort((a, b) => a.sourcePublicId.localeCompare(b.sourcePublicId));
}

function printInventorySummary(assets: AssetRecord[]) {
  const referenceCount = assets.reduce((sum, asset) => sum + asset.references.length, 0);
  const byColumn = new Map<string, number>();

  for (const asset of assets) {
    for (const reference of asset.references) {
      const key = `${reference.table}.${reference.column}`;
      byColumn.set(key, (byColumn.get(key) || 0) + 1);
    }
  }

  console.log(`Primary cloud: ${PRIMARY_CLOUD_NAME}`);
  console.log(`Backup cloud: ${BACKUP_CLOUD_NAME}`);
  console.log(`Unique assets: ${assets.length}`);
  console.log(`DB URL references: ${referenceCount}`);
  console.log('References by column:');
  for (const [key, count] of Array.from(byColumn.entries()).sort()) {
    console.log(`- ${key}: ${count}`);
  }
}

async function copyAssets(limit?: number, concurrency = 4): Promise<MappingRecord[]> {
  const uploadConfig = getCloudinaryUploadConfig();
  if (uploadConfig.target !== 'backup') {
    throw new Error('Backup Cloudinary credentials are not active. Check CLOUDINARY_BACKUP_* and CLOUDINARY_UPLOAD_TARGET=backup.');
  }

  const inventory = await readJson<AssetRecord[]>(INVENTORY_FILE);
  const existingMapping = await readExistingMapping();
  const records = new Map(existingMapping.map((record) => [record.sourcePublicId, record]));
  const pending = inventory.filter((asset) => records.get(asset.sourcePublicId)?.status !== 'copied');
  const selected = typeof limit === 'number' ? pending.slice(0, limit) : pending;

  console.log(`Copying ${selected.length} of ${pending.length} pending assets to ${uploadConfig.cloud_name}`);
  console.log(`Concurrency: ${concurrency}`);

  for (let start = 0; start < selected.length; start += concurrency) {
    const batch = selected.slice(start, start + concurrency);
    const results = await Promise.all(batch.map(async (asset): Promise<MappingRecord> => {
      try {
        const result = await cloudinary.uploader.upload(asset.sourceFetchUrl, {
          cloud_name: uploadConfig.cloud_name,
          api_key: uploadConfig.api_key,
          api_secret: uploadConfig.api_secret,
          public_id: asset.backupPublicId,
          overwrite: false,
          resource_type: 'image',
          format: 'webp',
          quality: 'auto',
        });

        console.log(`copied ${asset.sourcePublicId}`);
        return {
          ...asset,
          status: 'copied',
          backupUrl: result.secure_url,
        };
      } catch (error: any) {
        console.error(`failed ${asset.sourcePublicId}: ${error?.message || error}`);
        return {
          ...asset,
          status: 'failed',
          error: error?.message || String(error),
        };
      }
    }));

    for (const result of results) {
      records.set(result.sourcePublicId, result);
    }
    await writeJson(MAPPING_FILE, Array.from(records.values()));
    console.log(`Progress: ${Math.min(start + batch.length, selected.length)}/${selected.length}`);
  }

  return Array.from(records.values());
}

async function readExistingMapping(): Promise<MappingRecord[]> {
  try {
    return await readJson<MappingRecord[]>(MAPPING_FILE);
  } catch {
    return [];
  }
}

async function verifyMapping(limit = 30) {
  const mapping = await readJson<MappingRecord[]>(MAPPING_FILE);
  const copied = mapping.filter((record) => record.status === 'copied' && record.backupUrl);
  const sample = copied.slice(0, limit);
  let ok = 0;

  for (const record of sample) {
    const response = await fetch(record.backupUrl!, { method: 'HEAD' });
    if (response.ok) {
      ok += 1;
      console.log(`ok ${record.backupUrl}`);
    } else {
      console.error(`bad ${response.status} ${record.backupUrl}`);
    }
  }

  console.log(`Verified ${ok}/${sample.length} copied backup URLs`);
}

async function applyDbUpdates() {
  if (!hasFlag('--apply-db')) {
    throw new Error('DB update requires explicit --apply-db flag.');
  }

  const mapping = await readJson<MappingRecord[]>(MAPPING_FILE);
  const urlMap = new Map<string, string>();
  for (const record of mapping) {
    if (record.status === 'copied' && record.backupUrl) {
      for (const reference of record.references) {
        urlMap.set(reference.url, record.backupUrl);
      }
    }
  }

  const updates: unknown[] = [];
  const grouped = new Map<string, UrlReference[]>();
  for (const record of mapping) {
    if (record.status !== 'copied') continue;
    for (const reference of record.references) {
      const key = `${reference.table}:${reference.column}:${reference.rowId}`;
      const refs = grouped.get(key) || [];
      refs.push(reference);
      grouped.set(key, refs);
    }
  }

  for (const refs of grouped.values()) {
    const first = refs[0];
    const { data, error } = await supabaseService
      .from(first.table)
      .select(`${first.idColumn}, ${first.column}`)
      .eq(first.idColumn, first.rowId)
      .single();

    if (error) {
      throw new Error(`Fetch failed for ${first.table}.${first.column}.${first.rowId}: ${error.message}`);
    }

    const current = (data as Record<string, unknown>)[first.column];
    const nextValue = first.kind === 'array'
      ? (Array.isArray(current) ? current.map((url) => urlMap.get(String(url)) || url) : current)
      : urlMap.get(String(current)) || current;

    const { error: updateError } = await supabaseService
      .from(first.table)
      .update({ [first.column]: nextValue })
      .eq(first.idColumn, first.rowId);

    if (updateError) {
      throw new Error(`Update failed for ${first.table}.${first.column}.${first.rowId}: ${updateError.message}`);
    }

    updates.push({
      table: first.table,
      column: first.column,
      rowId: first.rowId,
      oldValue: current,
      newValue: nextValue,
    });
    await writeJson(DB_UPDATES_FILE, updates);
    console.log(`updated ${first.table}.${first.column}.${first.rowId}`);
  }

  console.log(`DB updates written: ${updates.length}`);
}

async function cleanupRemainingPrimaryUrls() {
  if (!hasFlag('--cleanup-remaining-primary')) {
    throw new Error('Cleanup requires explicit --cleanup-remaining-primary flag.');
  }

  const inventory = await buildInventory();
  const updates: unknown[] = [];
  const grouped = new Map<string, UrlReference[]>();

  for (const asset of inventory) {
    for (const reference of asset.references) {
      const key = `${reference.table}:${reference.column}:${reference.rowId}`;
      const refs = grouped.get(key) || [];
      refs.push(reference);
      grouped.set(key, refs);
    }
  }

  for (const refs of grouped.values()) {
    const first = refs[0];
    const { data, error } = await supabaseService
      .from(first.table)
      .select(`${first.idColumn}, ${first.column}`)
      .eq(first.idColumn, first.rowId)
      .single();

    if (error) {
      throw new Error(`Fetch failed for ${first.table}.${first.column}.${first.rowId}: ${error.message}`);
    }

    const current = (data as Record<string, unknown>)[first.column];
    const nextValue = first.kind === 'array'
      ? (Array.isArray(current) ? current.filter((url) => !isPrimaryCloudinaryUrl(url)) : current)
      : null;

    const { error: updateError } = await supabaseService
      .from(first.table)
      .update({ [first.column]: nextValue })
      .eq(first.idColumn, first.rowId);

    if (updateError) {
      throw new Error(`Cleanup failed for ${first.table}.${first.column}.${first.rowId}: ${updateError.message}`);
    }

    updates.push({
      table: first.table,
      column: first.column,
      rowId: first.rowId,
      oldValue: current,
      newValue: nextValue,
      reason: 'remaining primary Cloudinary URL after copy failures',
    });
    await writeJson(CLEANUP_UPDATES_FILE, updates);
    console.log(`cleaned ${first.table}.${first.column}.${first.rowId}`);
  }

  console.log(`Cleanup updates written: ${updates.length}`);
}

async function main() {
  const limitArg = getArgValue('--limit');
  const limit = limitArg ? Number(limitArg) : undefined;
  const concurrencyArg = getArgValue('--concurrency');
  const concurrency = Math.max(1, Math.min(Number(concurrencyArg || 4), 8));

  if (hasFlag('--inventory')) {
    const inventory = await buildInventory();
    await writeJson(INVENTORY_FILE, inventory);
    printInventorySummary(inventory);
    console.log(`Inventory written to ${INVENTORY_FILE}`);
    return;
  }

  if (hasFlag('--copy')) {
    await copyAssets(limit, concurrency);
    return;
  }

  if (hasFlag('--verify')) {
    await verifyMapping(limit || 30);
    return;
  }

  if (hasFlag('--apply-db')) {
    await applyDbUpdates();
    return;
  }

  if (hasFlag('--cleanup-remaining-primary')) {
    await cleanupRemainingPrimaryUrls();
    return;
  }

  console.log('Usage:');
  console.log('  ts-node-dev --transpile-only scripts/migrateCloudinaryToBackup.ts --inventory');
  console.log('  ts-node-dev --transpile-only scripts/migrateCloudinaryToBackup.ts --copy --limit=5 --concurrency=4');
  console.log('  ts-node-dev --transpile-only scripts/migrateCloudinaryToBackup.ts --verify --limit=30');
  console.log('  ts-node-dev --transpile-only scripts/migrateCloudinaryToBackup.ts --apply-db');
  console.log('  ts-node-dev --transpile-only scripts/migrateCloudinaryToBackup.ts --cleanup-remaining-primary');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
