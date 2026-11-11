import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { DestinyManifestService } from './manifest.service';

function delay(ms: number): Promise<string> {
  return new Promise(resolve => setTimeout(() => resolve('timeout'), ms));
}

function makeService(http: { get: jasmine.Spy }) {
  const d1 = { injectDefinitionsFromApi: () => undefined, getActivityName: () => 'Unknown Activity', getActivityIcon: () => '', findActivityHashesByExactName: () => [] };
  const locale = { culture: 'en', setAvailableCultures: () => undefined };
  const cache = { manifestComponentKey: () => 'k', getManifestData: () => null, cacheManifestData: () => undefined };
  const assetUrl = { resolve: (p: string) => p };
  const archiveRuntime = { isOfflineMode: false, allowLiveApi: true };
  return new DestinyManifestService(http as any, d1 as any, locale as any, cache as any, assetUrl as any, archiveRuntime as any);
}

describe('DestinyManifestService.whenLoaded', () => {
  it('settles after a finished manifest HTTP failure instead of waiting forever for true', async () => {
    const get$ = new Subject<unknown>();
    const http = { get: jasmine.createSpy('get').and.returnValue(get$) };
    const warn = spyOn(console, 'warn');
    const svc = makeService(http);

    const outcome = Promise.race([svc.whenLoaded().then(() => 'settled' as const), delay(800)]);
    get$.error(new HttpErrorResponse({ status: 500, statusText: 'Internal Server Error', url: '/Platform/Destiny2/Manifest/' }));

    expect(await outcome).toBe('settled');
    expect(svc.isLoadedSync).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
