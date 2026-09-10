import type { Env } from '../types';
import { all } from './db';

export function parseContentJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export async function hydrateQuestionMedia(env: Env, rows: any[]) {
  const ids = rows.map(row => String(row.id || row.question_id || '')).filter(Boolean);
  if (!ids.length) return rows;
  const marks = ids.map(() => '?').join(',');
  const [assets, blocks] = await Promise.all([
    all<any>(env.DB.prepare(`SELECT id,question_id,asset_type,r2_key,external_url,title,approved,placement,option_label,sort_order,alt_text,mime_type,width,height,rights_status
      FROM question_assets WHERE question_id IN (${marks}) ORDER BY question_id,placement,sort_order,id`).bind(...ids)),
    all<any>(env.DB.prepare(`SELECT id,question_id,block_type,placement,option_label,sort_order,text_content,asset_id,payload_json,alt_text
      FROM question_content_blocks WHERE question_id IN (${marks}) ORDER BY question_id,placement,sort_order,id`).bind(...ids)),
  ]);
  const assetMap = new Map<string, any[]>();
  for (const asset of assets) {
    const list = assetMap.get(asset.question_id) || [];
    list.push({ ...asset, url: asset.r2_key ? `/api/platform/questions/${encodeURIComponent(asset.question_id)}/assets/${encodeURIComponent(asset.id)}` : asset.external_url || null, r2_key: undefined, external_url: undefined });
    assetMap.set(asset.question_id, list);
  }
  const blockMap = new Map<string, any[]>();
  for (const block of blocks) {
    const list = blockMap.get(block.question_id) || [];
    list.push({ ...block, payload: parseContentJson(block.payload_json, {}), payload_json: undefined });
    blockMap.set(block.question_id, list);
  }
  return rows.map(row => ({
    ...row,
    assets: assetMap.get(String(row.id || row.question_id)) || [],
    contentBlocks: blockMap.get(String(row.id || row.question_id)) || [],
  }));
}
