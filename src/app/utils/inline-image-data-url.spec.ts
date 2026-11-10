import { inlineImageDataUrl } from './inline-image-data-url';

describe('inlineImageDataUrl', () => {
  it('returns data/blob URLs unchanged', async () => {
    expect(await inlineImageDataUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
    expect(await inlineImageDataUrl('blob:https://example/1')).toBe('blob:https://example/1');
  });

  it('returns null for empty input', async () => {
    expect(await inlineImageDataUrl('')).toBeNull();
    expect(await inlineImageDataUrl(null)).toBeNull();
  });
});
