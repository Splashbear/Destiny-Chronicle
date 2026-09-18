import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnniversaryCelebrationBannerComponent, AnniversaryFirst } from './anniversary-celebration-banner.component';

describe('AnniversaryCelebrationBannerComponent', () => {
  let component: AnniversaryCelebrationBannerComponent;
  let fixture: ComponentFixture<AnniversaryCelebrationBannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnniversaryCelebrationBannerComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(AnniversaryCelebrationBannerComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not display when no anniversaries', () => {
    component.anniversaries = [];
    fixture.detectChanges();
    const banner = fixture.nativeElement.querySelector('.anniversary-banner');
    expect(banner).toBeNull();
  });

  it('should display when anniversaries exist', () => {
    const mockAnniversary: AnniversaryFirst = {
      first: {
        type: 'raid',
        name: 'Vault of Glass',
        game: 'D2',
        period: '2021-05-22T14:30:00Z',
        completionDate: '2021-05-22T14:30:00Z',
        instanceId: '123',
        referenceId: '1441982566',
        mode: 4,
        characterId: 'char123',
        membershipId: 'mem123',
        completed: 1
      },
      type: 'guardian-first',
      activityName: 'Vault of Glass',
      year: 2021,
      yearsAgo: 3,
      game: 'D2',
      completionDate: '2021-05-22T14:30:00Z',
      instanceId: '123'
    };
    component.anniversaries = [mockAnniversary];
    component.selectedDate = '2024-05-22';
    fixture.detectChanges();
    
    const banner = fixture.nativeElement.querySelector('.anniversary-banner');
    expect(banner).toBeTruthy();
  });

  it('should show correct title for single anniversary', () => {
    const mockAnniversary: AnniversaryFirst = {
      first: {} as any,
      type: 'guardian-first',
      activityName: 'Vault of Glass',
      year: 2021,
      yearsAgo: 3,
      game: 'D2',
      completionDate: '2021-05-22T14:30:00Z'
    };
    component.anniversaries = [mockAnniversary];
    fixture.detectChanges();
    
    const heading = fixture.nativeElement.querySelector('.anniversary-banner-heading');
    expect(heading?.textContent).toContain('Anniversary on This Day!');
  });

  it('should show correct title for multiple anniversaries', () => {
    const mockAnniversaries: AnniversaryFirst[] = [
      {
        first: {} as any,
        type: 'guardian-first',
        activityName: 'Vault of Glass',
        year: 2021,
        yearsAgo: 3,
        game: 'D2',
        completionDate: '2021-05-22T14:30:00Z'
      },
      {
        first: {} as any,
        type: 'first-ever',
        activityName: 'First Strike',
        year: 2014,
        yearsAgo: 10,
        game: 'D1',
        completionDate: '2014-09-09T12:00:00Z'
      }
    ];
    component.anniversaries = mockAnniversaries;
    fixture.detectChanges();
    
    const heading = fixture.nativeElement.querySelector('.anniversary-banner-heading');
    expect(heading?.textContent).toContain('2 Anniversaries on This Day!');
  });

  it('should emit dismiss event when close button clicked', () => {
    spyOn(component.dismiss, 'emit');
    component.onDismiss();
    expect(component.dismiss.emit).toHaveBeenCalled();
  });

  it('should emit navigateToFirst event when anniversary clicked', () => {
    spyOn(component.navigateToFirst, 'emit');
    const mockAnniversary: AnniversaryFirst = {
      first: {} as any,
      type: 'guardian-first',
      activityName: 'Vault of Glass',
      year: 2021,
      yearsAgo: 3,
      game: 'D2',
      completionDate: '2021-05-22T14:30:00Z'
    };
    component.onNavigate(mockAnniversary);
    expect(component.navigateToFirst.emit).toHaveBeenCalledWith(mockAnniversary);
  });

  it('should return correct icon for first-ever type', () => {
    const anniversary: AnniversaryFirst = {
      first: {} as any,
      type: 'first-ever',
      activityName: 'Test',
      year: 2021,
      yearsAgo: 3,
      game: 'D2',
      completionDate: '2021-05-22T14:30:00Z'
    };
    expect(component.getAnniversaryIcon(anniversary)).toBe('🌟');
  });

  it('should return correct icon for solo type', () => {
    const anniversary: AnniversaryFirst = {
      first: {} as any,
      type: 'solo',
      activityName: 'Test',
      year: 2021,
      yearsAgo: 3,
      game: 'D2',
      completionDate: '2021-05-22T14:30:00Z'
    };
    expect(component.getAnniversaryIcon(anniversary)).toBe('🏃');
  });

  it('should return correct icon for solo-flawless type', () => {
    const anniversary: AnniversaryFirst = {
      first: {} as any,
      type: 'solo-flawless',
      activityName: 'Test',
      year: 2021,
      yearsAgo: 3,
      game: 'D2',
      completionDate: '2021-05-22T14:30:00Z'
    };
    expect(component.getAnniversaryIcon(anniversary)).toBe('💎');
  });

  it('should return correct label for first-ever type', () => {
    const anniversary: AnniversaryFirst = {
      first: {} as any,
      type: 'first-ever',
      activityName: 'Test',
      year: 2021,
      yearsAgo: 3,
      game: 'D2',
      completionDate: '2021-05-22T14:30:00Z'
    };
    expect(component.getAnniversaryTypeLabel(anniversary)).toBe('First Ever Activity');
  });

  it('should return correct label for solo type', () => {
    const anniversary: AnniversaryFirst = {
      first: {} as any,
      type: 'solo',
      activityName: 'Test',
      year: 2021,
      yearsAgo: 3,
      game: 'D2',
      completionDate: '2021-05-22T14:30:00Z'
    };
    expect(component.getAnniversaryTypeLabel(anniversary)).toBe('Solo');
  });

  it('should return correct label for solo-flawless type', () => {
    const anniversary: AnniversaryFirst = {
      first: {} as any,
      type: 'solo-flawless',
      activityName: 'Test',
      year: 2021,
      yearsAgo: 3,
      game: 'D2',
      completionDate: '2021-05-22T14:30:00Z'
    };
    expect(component.getAnniversaryTypeLabel(anniversary)).toBe('Solo Flawless');
  });

  it('should display activity names correctly', () => {
    const mockAnniversary: AnniversaryFirst = {
      first: {} as any,
      type: 'guardian-first',
      activityName: 'Deep Stone Crypt',
      year: 2020,
      yearsAgo: 4,
      game: 'D2',
      completionDate: '2020-11-21T19:00:00Z'
    };
    component.anniversaries = [mockAnniversary];
    fixture.detectChanges();
    
    const activityName = fixture.nativeElement.querySelector('.anniversary-item-name');
    expect(activityName?.textContent).toContain('Deep Stone Crypt');
  });

  it('should display years ago correctly', () => {
    const mockAnniversary: AnniversaryFirst = {
      first: {} as any,
      type: 'guardian-first',
      activityName: 'Vault of Glass',
      year: 2021,
      yearsAgo: 3,
      game: 'D2',
      completionDate: '2021-05-22T14:30:00Z'
    };
    component.anniversaries = [mockAnniversary];
    fixture.detectChanges();
    
    const date = fixture.nativeElement.querySelector('.anniversary-item-date');
    expect(date?.textContent).toContain('3 years ago');
  });

  it('should handle zero years ago (same year)', () => {
    const mockAnniversary: AnniversaryFirst = {
      first: {} as any,
      type: 'guardian-first',
      activityName: 'Vault of Glass',
      year: 2024,
      yearsAgo: 0,
      game: 'D2',
      completionDate: '2024-05-22T14:30:00Z'
    };
    component.anniversaries = [mockAnniversary];
    fixture.detectChanges();
    
    const date = fixture.nativeElement.querySelector('.anniversary-item-date');
    expect(date?.textContent).toContain('2024');
    expect(date?.textContent).not.toContain('years ago');
  });
});
