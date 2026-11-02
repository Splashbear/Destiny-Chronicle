import { isPlaceholderBungieIcon, usableBungieIconPath } from './bungie-icon-path';

describe('bungie-icon-path', () => {
  it('treats missing_icon_d2 as a placeholder', () => {
    expect(isPlaceholderBungieIcon('/img/misc/missing_icon_d2.png')).toBe(true);
    expect(
      isPlaceholderBungieIcon('https://www.bungie.net/img/misc/missing_icon_d2.png')
    ).toBe(true);
    expect(isPlaceholderBungieIcon('')).toBe(true);
    expect(isPlaceholderBungieIcon(null)).toBe(true);
  });

  it('keeps real activity icons', () => {
    const icon = '/common/destiny2_content/icons/abc123.png';
    expect(isPlaceholderBungieIcon(icon)).toBe(false);
    expect(usableBungieIconPath(icon)).toBe(icon);
    expect(usableBungieIconPath('/img/misc/missing_icon_d2.png')).toBeNull();
  });
});
