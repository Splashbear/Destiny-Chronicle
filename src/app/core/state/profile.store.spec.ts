import { TestBed } from '@angular/core/testing';
import { ProfileStore } from './profile.store';

describe('ProfileStore', () => {
  let store: ProfileStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(ProfileStore);
  });

  it('starts empty', () => {
    expect(store.selectedPlayerCount()).toBe(0);
    expect(store.archiveCoverage()).toBeNull();
    expect(store.profileLoadInProgress()).toBe(false);
  });

  it('syncFromHost mirrors host fields', () => {
    store.syncFromHost({
      selectedPlayers: [
        {
          displayName: 'Splashbear#1078',
          membershipId: '4611686018465122437',
          membershipType: 2,
          platform: 'PlayStation',
          game: 'D2',
        },
      ],
      profileLoadInProgress: true,
      archiveCoverage: { level: 'partial', through: '2024-01-01', instanceId: '1' },
      showLoadingModal: true,
      loadingProgress: { phase: 'pgcr', current: 2, total: 10, message: 'Loading' },
    });

    expect(store.selectedPlayerCount()).toBe(1);
    expect(store.profileLoadInProgress()).toBe(true);
    expect(store.archiveCoverage()?.level).toBe('partial');
    expect(store.showLoadingModal()).toBe(true);
    expect(store.loadingProgress()?.current).toBe(2);
  });

  it('reset clears selection and coverage', () => {
    store.setSelectedPlayers([
      {
        displayName: 'x',
        membershipId: '1',
        membershipType: 2,
        platform: 'PlayStation',
        game: 'D2',
      },
    ]);
    store.setArchiveCoverage({ level: 'full', through: '2025-01-01', instanceId: '9' });
    store.reset();
    expect(store.selectedPlayerCount()).toBe(0);
    expect(store.archiveCoverage()).toBeNull();
  });
});
