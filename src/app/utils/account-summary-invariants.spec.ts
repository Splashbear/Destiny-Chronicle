import { accountSummaryTimeIssue } from './account-summary-invariants';

describe('accountSummaryTimeIssue', () => {
  it('flags 0 activity time when activity count is positive (the #80 bug)', () => {
    expect(
      accountSummaryTimeIssue({
        activityCount: 26361,
        timeInActivitiesSeconds: 0,
        timeInGameSeconds: 37800000,
      })
    ).toContain('IndexedDB');
  });

  it('allows normal Splashbear-scale totals', () => {
    expect(
      accountSummaryTimeIssue({
        activityCount: 26361,
        timeInActivitiesSeconds: 27_700_000,
        timeInGameSeconds: 37_800_000,
      })
    ).toBeNull();
  });

  it('flags activity time far above in-game time', () => {
    expect(
      accountSummaryTimeIssue({
        activityCount: 10,
        timeInActivitiesSeconds: 100_000,
        timeInGameSeconds: 1000,
      })
    ).toContain('exceeds');
  });
});
