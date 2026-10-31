import { resolveBungieApiIssueNotices } from './bungie-api-issue';

describe('resolveBungieApiIssueNotices', () => {
  it('returns null for unrelated errors', () => {
    expect(resolveBungieApiIssueNotices('D2', new Error('not found'))).toBeNull();
  });

  it('flags SystemDisabled for D1', () => {
    const notices = resolveBungieApiIssueNotices('D1', {
      message: 'SystemDisabled',
    });
    expect(notices?.d1ApiIssue).toContain('SystemDisabled');
    expect(notices?.apiAvailable).toBe(false);
  });

  it('flags 503 for D2', () => {
    const notices = resolveBungieApiIssueNotices('D2', { status: 503 });
    expect(notices?.d2ApiIssue).toContain('unreachable');
  });
});
