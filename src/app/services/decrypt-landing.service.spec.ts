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
  });

  it('skips URL restores', () => {
    expect(svc.shouldOffer({ fromUrlRestore: true })).toBe(false);
    svc.offerIfEligible({ fromUrlRestore: true });
    expect(svc.visible()).toBe(false);
  });

  it('skips the rest of the session after Skip', () => {
    svc.offerIfEligible({ fromUrlRestore: false });
    svc.skip();
    expect(svc.visible()).toBe(false);
    expect(svc.shouldOffer({ fromUrlRestore: false })).toBe(false);
  });
});
