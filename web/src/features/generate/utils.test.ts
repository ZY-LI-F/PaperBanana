import type { RunDetailPayload } from './types';
import { buildHeroVariants, downloadVariants } from './utils';

describe('buildHeroVariants', () => {
  test('orders final variants first and preserves stage order', () => {
    const detail: RunDetailPayload = {
      battles: [],
      final_image_url: '/api/runs/run-123/image/final/candidate_0.png',
      id: 'run-123',
      num_candidates: 2,
      stages: [
        {
          image_names: ['stages/visualizer/candidate_0.png', 'stages/visualizer/candidate_1.png'],
          image_urls: [
            '/api/runs/run-123/image/stages/visualizer/candidate_0.png',
            '/api/runs/run-123/image/stages/visualizer/candidate_1.png',
          ],
          stage_name: 'visualizer',
          status: 'succeeded',
        },
        {
          image_names: ['stages/critic_0/candidate_0.png'],
          image_urls: ['/api/runs/run-123/image/stages/critic_0/candidate_0.png'],
          stage_name: 'critic_0',
          status: 'succeeded',
        },
      ],
      status: 'succeeded',
    };

    const variants = buildHeroVariants(detail);

    expect(variants.map((variant) => variant.id)).toEqual([
      'final-0',
      'final-1',
      'visualizer-0',
      'visualizer-1',
      'critic_0-0',
    ]);
    expect(variants[1]).toMatchObject({
      candidateIndex: 1,
      downloadName: 'run-123_final_candidate_1.png',
      label: 'Final candidate 2',
      url: '/api/runs/run-123/image/final/candidate_1.png',
    });
    expect(new Set(variants.map((variant) => variant.id)).size).toBe(variants.length);
    expect(
      variants.every((variant) => Boolean(variant.url && variant.label && variant.downloadName))
    ).toBe(true);
  });
});

describe('downloadVariants', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test('triggers staggered anchor downloads', () => {
    vi.useFakeTimers();
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadVariants([
      {
        candidateIndex: 0,
        downloadName: 'run-123_final_candidate_0.png',
        id: 'final-0',
        label: 'Final candidate 1',
        stage: 'final',
        url: '/api/runs/run-123/image/final/candidate_0.png',
      },
      {
        candidateIndex: 1,
        downloadName: 'run-123_visualizer_candidate_1.png',
        id: 'visualizer-1',
        label: 'Visualizer candidate 2',
        stage: 'visualizer',
        url: '/api/runs/run-123/image/stages/visualizer/candidate_1.png',
      },
    ]);

    expect(clickSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect((appendSpy.mock.calls[0][0] as HTMLAnchorElement).download).toBe(
      'run-123_final_candidate_0.png'
    );

    vi.advanceTimersByTime(199);
    expect(clickSpy).toHaveBeenCalledTimes(2);
    expect((appendSpy.mock.calls[1][0] as HTMLAnchorElement).download).toBe(
      'run-123_visualizer_candidate_1.png'
    );
    expect(removeSpy).toHaveBeenCalledTimes(2);
  });
});
