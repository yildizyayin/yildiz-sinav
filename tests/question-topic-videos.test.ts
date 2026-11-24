import { describe, expect, it } from 'vitest';
import { selectTopicVideos } from '../worker/lib/question-topic-videos';

const video = (id: number, seconds = 240, start = 0) => ({
  url: `https://youtu.be/${String(id).padStart(11, '0')}`,
  title: `Konu anlatımı ${id}`, start, seconds,
});

describe('question topic video recommendations', () => {
  it('keeps distinct YouTube videos within the inclusive 45–325 second range (short outcome videos count)', () => {
    const videos = selectTopicVideos([video(1, 44), video(2, 45, 40), video(2),
      video(3, 325), video(4, 326), { ...video(9), url: 'https://example.test/video' }]);
    expect(videos.map(({ title, start, end }) => ({ title, start, end }))).toEqual([
      { title: 'Konu anlatımı 2', start: 40, end: 85 },
      { title: 'Konu anlatımı 3', start: 0, end: 325 },
    ]);
    expect(videos[0].url).toBe('https://www.youtube.com/watch?v=00000000002&t=40s');
  });

  it('offers at most five and keeps an empty catalogue empty', () => {
    expect(selectTopicVideos(Array.from({ length: 8 }, (_, i) => video(i)))).toHaveLength(5);
    expect(selectTopicVideos([])).toEqual([]);
  });
});
