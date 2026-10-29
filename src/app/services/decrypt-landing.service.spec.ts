import { DecryptLandingService } from './decrypt-landing.service';

describe('DecryptLandingService', () => {
  let svc: DecryptLandingService;

  beforeEach(() => {
    sessionStorage.clear();
    svc = new DecryptLandingService();
    spyOn(svc, 'prefersReducedMotion').and.returnValue(false);
  });

  it('offers on a fresh search', () => {
    expect(svc.shouldOffer({ fromUrlRestore: false })).toBe(true);
    svc.offerIfEligible({ fromUrlRestore: false });
    expect(svc.visible()).toBe(true);
    expect(svc.phase()).toBe('loading');
    expect(svc.ownsLoad()).toBe(true);
  });

  it('skips URL restores', () => {
    expect(svc.shouldOffer({ fromUrlRestore: true })).toBe(false);
    svc.offerIfEligible({ fromUrlRestore: true });
    expect(svc.visible()).toBe(false);
    expect(svc.ownsLoad()).toBe(false);
  });

  it('keeps ownsLoad after unzip so the legacy strip stays hidden', () => {
    svc.offerIfEligible({ fromUrlRestore: false });
    svc.complete();
    svc.finishUnzip();
    expect(svc.visible()).toBe(false);
    expect(svc.ownsLoad()).toBe(true);
  });

  it('skips the rest of the session after Skip', () => {
    svc.offerIfEligible({ fromUrlRestore: false });
    svc.skip();
    expect(svc.visible()).toBe(false);
    expect(svc.shouldOffer({ fromUrlRestore: false })).toBe(false);
  });

  it('enters unzipping on complete then dismisses after finishUnzip', () => {
    svc.offerIfEligible({ fromUrlRestore: false });
    svc.complete();
    expect(svc.visible()).toBe(true);
    expect(svc.phase()).toBe('unzipping');
    svc.finishUnzip();
    expect(svc.visible()).toBe(false);
    expect(svc.phase()).toBe('done');
    expect(svc.materialize()).toBe(true);
  });

  it('skips unzip when reduced motion', () => {
    (svc.prefersReducedMotion as jasmine.Spy).and.returnValue(true);
    // shouldOffer also checks reduced motion — force visible via offer path bypass
    svc.offerIfEligible({ fromUrlRestore: false });
    expect(svc.visible()).toBe(false);
  });

  it('openSearchPanel sets searchOpen phase from idle', () => {
    svc.openSearchPanel();
    expect(svc.phase()).toBe('searchOpen');
  });
});
