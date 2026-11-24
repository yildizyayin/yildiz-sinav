import type { Env } from '../types';
import { all } from './db';
import { youtubeId, watchUrl } from './outcome-videos';

type Candidate = { url: string; title: string; start: number; seconds: number; channel?: string | null; catalog?: number };
export function selectTopicVideos(rows: Candidate[]) {
  const ids = new Set<string>();
  const videos = [];
  for (const row of rows) {
    const id = youtubeId(row.url);
    if (!id || ids.has(id) || !Number.isInteger(row.seconds) || row.seconds < 45 || row.seconds > 325 ||
        !Number.isInteger(row.start) || row.start < 0) continue;
    ids.add(id);
    videos.push({ id, title: row.title, channel: row.channel || null, catalog: Boolean(row.catalog), url: watchUrl(id, row.start), start: row.start,
      end: row.start + row.seconds, durationSeconds: row.seconds });
    if (videos.length === 5) break;
  }
  return videos;
}

export async function questionTopicVideos(env: Env, outcomeId: string | null, institutionId: string | null) {
  if (!outcomeId) return [];
  const rows = await all<Candidate>(env.DB.prepare(`
    SELECT url,title,start,seconds,channel,catalog FROM (
      SELECT url,title,COALESCE(start_seconds,0) start,end_seconds-COALESCE(start_seconds,0) seconds,0 priority,id,NULL channel,0 catalog
      FROM outcome_teacher_videos WHERE outcome_id=? AND institution_id=? AND active=1
      UNION ALL
      SELECT url,title,0 start,duration_seconds seconds,1 priority,id,NULL channel,0 catalog
      FROM learning_videos WHERE node_id=? AND provider='YOUTUBE' AND approved=1 AND active=1
      UNION ALL
      SELECT 'https://www.youtube.com/watch?v='||c.youtube_video_id,c.title,c.start_seconds,
        c.end_seconds-c.start_seconds,CASE WHEN c.curated=1 THEN 2 ELSE 3 END,printf('%02d',c.position),c.channel_title,1
      FROM outcome_video_choices c WHERE c.outcome_id=? AND c.checked_at > datetime('now','-30 days')
        AND NOT EXISTS (SELECT 1 FROM outcome_video_blocks b
          WHERE b.outcome_id=c.outcome_id AND b.youtube_video_id=c.youtube_video_id)
    ) WHERE seconds BETWEEN 45 AND 325 ORDER BY priority,id
  `).bind(outcomeId,institutionId,`ln_${outcomeId}`,outcomeId));
  return selectTopicVideos(rows);
}
