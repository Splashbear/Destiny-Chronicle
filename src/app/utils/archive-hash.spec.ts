import { isOfficialBungieHost, normalizeBungiePath, parseHttpUrl } from './archive-hash';

describe('archive-hash Bungie URL checks', () => {
  it('accepts only official Bungie hostnames', () => {
    expect(isOfficialBungieHost('www.bungie.net')).toBe(true);
    expect(isOfficialBungieHost('stats.bungie.net')).toBe(true);
    expect(isOfficialBungieHost('bungie.net.evil.example')).toBe(false);
    expect(isOfficialBungieHost('evilbungie.net')).toBe(false);
  });

  it('normalizes official Bungie URLs and rejects lookalikes', () => {
    expect(normalizeBungiePath('https://www.bungie.net/common/destiny2_content/icons/x.png'))
      .toBe('/common/destiny2_content/icons/x.png');
    expect(normalizeBungiePath('https://www.bungie.net.evil.example/common/x.png')).toBeNull();
    expect(parseHttpUrl('https://cdn.example/icon.png')?.hostname).toBe('cdn.example');
  });
});
