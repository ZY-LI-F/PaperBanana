import { exampleImageUrl } from './examples';

describe('exampleImageUrl', () => {
  test('uses image_path first and falls back to updated_at for cache busting', () => {
    const updatedOnly = new URL(
      exampleImageUrl({
        id: 'example-1',
        updated_at: '2026-04-21T00:00:00Z',
      }),
    );
    const imagePathVersion = new URL(
      exampleImageUrl({
        id: 'example-1',
        updated_at: '2026-04-21T00:00:00Z',
        image_path: 'results/examples/example-1-v2.png',
      }),
    );

    expect(updatedOnly.pathname).toBe('/api/examples/example-1/image');
    expect(updatedOnly.searchParams.get('v')).toBe('2026-04-21T00:00:00Z');
    expect(imagePathVersion.searchParams.get('v')).toBe('results/examples/example-1-v2.png');
    expect(imagePathVersion.toString()).not.toBe(updatedOnly.toString());
  });
});
