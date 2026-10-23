import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BungieApiService } from './bungie-api.service';

describe('BungieApiService.getPlayerRecords cache', () => {
  let service: BungieApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [BungieApiService],
    });
    service = TestBed.inject(BungieApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('de-dupes concurrent callers and reuses the session response', () => {
    const body = {
      ErrorCode: 1,
      Response: { profileRecords: {} },
      Message: 'Ok',
      ErrorStatus: 'Success',
      MessageData: {},
    };
    const isRecords = (url: string) => /components=900,?1000|components=900%2C1000/.test(url);

    let a: unknown;
    let b: unknown;
    service.getPlayerRecords(2, '4611686018465122437').subscribe((r) => (a = r));
    service.getPlayerRecords(2, '4611686018465122437').subscribe((r) => (b = r));

    const reqs = httpMock.match((r) => isRecords(r.urlWithParams || r.url));
    expect(reqs.length).toBe(1);
    reqs[0].flush(body);
    expect(a).toEqual(body);
    expect(b).toEqual(body);

    let c: unknown;
    service.getPlayerRecords(2, '4611686018465122437').subscribe((r) => (c = r));
    expect(httpMock.match((r) => isRecords(r.urlWithParams || r.url)).length).toBe(0);
    expect(c).toEqual(body);
  });
});
