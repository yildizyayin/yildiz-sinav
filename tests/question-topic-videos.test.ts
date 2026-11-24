import { describe, expect, it } from 'vitest';
import { selectTopicVideos } from '../worker/lib/question-topic-videos';

const video = (id: number, seconds = 240, start = 0) => ({
  url: `https://youtu.be/${String(id).padStart(11, '0')}`,
  title: `Konu anlatımı ${id}`, start, seconds,
});

describe('question topic video recommendations', () => {
  it('keeps distinct YouTube videos within the inclusive 3–5 minute range', () => {
    const videos = selectTopicVideos([video(1, 179), video(2, 180, 40), video(2),
      video(3, 300), video(4, 301), { ...video(9), url: 'https://example.test/video' }]);
    expect(videos.map(({ title, start, end }) => ({ title, start, end }))).toEqual([
      { title: 'Konu anlatımı 2', start: 40, end: 220 },
      { title: 'Konu anlatımı 3', start: 0, end: 300 },
    ]);
    expect(videos[0].url).toBe('https://www.youtube.com/watch?v=00000000002&t=40s');
  });

  it('offers at most five and keeps an empty catalogue empty', () => {
    expect(selectTopicVideos(Array.from({ length: 8 }, (_, i) => video(i)))).toHaveLength(5);
    expect(selectTopicVideos([])).toEqual([]);
  });
});
