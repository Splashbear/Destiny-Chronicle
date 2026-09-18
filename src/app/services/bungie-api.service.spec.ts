import { TestBed } from '@angular/core/testing';
import { BungieApiService } from './bungie-api.service';
import { BungieMembershipType } from 'bungie-api-ts/destiny2';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';

// Enum mappings for isolated modules
const MembershipType = {
  None: 0,
  TigerXbox: 1,
  TigerPsn: 2,
  TigerSteam: 3,
  TigerBlizzard: 4,
  TigerStadia: 5,
  TigerEgs: 6,
  TigerDemon: 10,
  BungieNext: 254
} as const;

describe('BungieApiService', () => {
  let service: BungieApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [BungieApiService]
    });
    service = TestBed.inject(BungieApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should search for a D1 player', (done) => {
    const displayName = 'testPlayer';
    const membershipType = MembershipType.TigerXbox;

    service.searchD1Player(displayName, membershipType).subscribe({
      next: (response: any) => {
        expect(response).toBeDefined();
        done();
      },
      error: (error: any) => {
        console.error('Error in searchD1Player test:', error);
        done.fail(error);
      }
    });
  });

  it('should get player profile', (done) => {
    const membershipType = MembershipType.TigerXbox;
    const membershipId = 'testId';

    service.getProfile(membershipType, membershipId).subscribe({
      next: (response) => {
        expect(response).toBeDefined();
        done();
      },
      error: (error) => {
        console.error('Error in getProfile test:', error);
        done.fail(error);
      }
    });
  });

  it('should get activity history', (done) => {
    const membershipType = MembershipType.TigerXbox;
    const membershipId = 'testId';
    const characterId = 'testCharacterId';
    const mode = 0;

    service.getActivityHistory(membershipType, membershipId, characterId, mode).subscribe({
      next: (response) => {
        expect(response).toBeDefined();
        done();
      },
      error: (error) => {
        console.error('Error in getActivityHistory test:', error);
        done.fail(error);
      }
    });
  });

  it('should get D1 manifest', (done) => {
    service.getD1Manifest().subscribe({
      next: (response: any) => {
        expect(response).toBeDefined();
        done();
      },
      error: (error: any) => {
        console.error('Error in getD1Manifest test:', error);
        done.fail(error);
      }
    });
  });
}); 