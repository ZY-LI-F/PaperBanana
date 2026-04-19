import { EXAMPLES, getExample } from '../examples';

const MIN_CAPTION_LENGTH = 60;
const MIN_METHOD_LENGTH = 200;

describe('examples catalogue', () => {
  test('contains at least five examples', () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(5);
  });

  test('keeps every required field populated and long enough', () => {
    EXAMPLES.forEach((example) => {
      expect(example.id).toBeTruthy();
      expect(example.discipline).toBeTruthy();
      expect(example.title_en).toBeTruthy();
      expect(example.title_zh).toBeTruthy();
      expect(example.method_content_en).toBeTruthy();
      expect(example.method_content_zh).toBeTruthy();
      expect(example.caption_en).toBeTruthy();
      expect(example.caption_zh).toBeTruthy();
      expect(example.method_content_en.length).toBeGreaterThanOrEqual(MIN_METHOD_LENGTH);
      expect(example.method_content_zh.length).toBeGreaterThanOrEqual(MIN_METHOD_LENGTH);
      expect(example.caption_en.length).toBeGreaterThanOrEqual(MIN_CAPTION_LENGTH);
      expect(example.caption_zh.length).toBeGreaterThanOrEqual(MIN_CAPTION_LENGTH);
    });
  });

  test('uses unique ids', () => {
    const ids = new Set(EXAMPLES.map((example) => example.id));

    expect(ids.size).toBe(EXAMPLES.length);
  });

  test('resolves examples by id', () => {
    const firstExample = EXAMPLES[0];
    expect(firstExample).toBeDefined();
    expect(getExample(firstExample.id)?.id).toBe(firstExample.id);
    expect(getExample('__missing__')).toBeUndefined();
  });
});
