import { refImageUrl } from './refs';

describe('refImageUrl', () => {
  test('uses the image key for cache busting', () => {
    const url = new URL(
      refImageUrl('diagram', 'ref-1', {
        key: 'overlay-key',
        order_index: 4,
      })
    );

    expect(url.pathname).toBe('/api/refs/diagram/ref-1/images/overlay-key');
    expect(url.searchParams.get('v')).toBe('overlay-key');
  });
});
