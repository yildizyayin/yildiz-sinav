import { useState } from 'react';
import { clipEmbed } from '../lib/physicalLink';

export type TopicVideo = { id: string; title: string; channel?: string | null; catalog?: boolean; url: string; start: number; end: number; durationSeconds: number };

export function QuestionTopicVideos({ videos, onRemove }: { videos: TopicVideo[]; onRemove?: (id: string) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = videos.find(video => video.id === selectedId);
  const embed = selected && clipEmbed(selected.url, selected.start, selected.end);
  return <section aria-label="Kazanım videoları">
    <h3>Kazanım videoları</h3>
    {videos.length ? <ul style={{ paddingLeft: 20 }}>
      {videos.map(video => <li key={video.id} style={{ marginBlock: 8 }}>
        <button type="button" className="ghost" aria-pressed={video.id === selectedId} onClick={() => setSelectedId(video.id)}>
          {video.title}{video.channel ? ` · ${video.channel}` : ''} · {Math.floor(video.durationSeconds / 60)}:{String(video.durationSeconds % 60).padStart(2, '0')}
        </button>
        {video.catalog && onRemove && <button type="button" className="ghost" onClick={() => onRemove(video.id)}
          aria-label={`Kaldır: ${video.title}`}>Kaldır</button>}
      </li>)}
    </ul> : <p>Bu kazanım için kısa video henüz hazır değil.</p>}
    {selected && embed && <>
      <iframe key={selected.id} title={selected.title} src={embed} allow="encrypted-media; picture-in-picture" allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin" style={{ width: '100%', aspectRatio: '16/9', border: 0 }} />
      <a className="ghost" href={selected.url} target="_blank" rel="noopener noreferrer">YouTube’da aç</a>
    </>}
  </section>;
}
