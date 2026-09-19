import { toSameOriginBungiePath } from './bungie-request-url';

describe('toSameOriginBungiePath', () => {
  it('rewrites exact Bungie hosts to same-origin paths', () => {
    expect(toSameOriginBungiePath('https://www.bungie.net/Platform/Destiny2/Manifest/'))
      .toBe('/Platform/Destiny2/Manifest/');
    expect(toSameOriginBungiePath('https://stats.bungie.net/Platform/Destiny2/Stats/PostGameCarnageReport/1/'))
      .toBe('/Platform/Destiny2/Stats/PostGameCarnageReport/1/');
  });

  it('rejects lookalike hosts that start with a Bungie origin string', () => {
    expect(toSameOriginBungiePath('https://stats.bungie.net.evil.example/Platform/x'))
      .toBeNull();
    expect(toSameOriginBungiePath('https://www.bungie.net.evil.example/Platform/x'))
      .toBeNull();
    expect(toSameOriginBungiePath('https://evil.example/https://stats.bungie.net/Platform/x'))
      .toBeNull();
  });
});
