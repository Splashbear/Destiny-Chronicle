import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnniversaryCelebrationBannerComponent, AnniversaryFirst } from './anniversary-celebration-banner.component';

function ann(partial: Partial<AnniversaryFirst> & Pick<AnniversaryFirst, 'activityName' | 'yearsAgo'>): AnniversaryFirst {
  return {
    first: { type: 'raid' } as any,
    type: 'guardian-first',
    year: 2020,
    game: 'D2',
    completionDate: '2020-11-10T12:00:00Z',
    ...partial,
  };
}

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
    expect(fixture.nativeElement.querySelector('.fireside-hero')).toBeNull();
  });

  it('shows a consolidated headline for multiple firsts without an expand control', () => {
    component.anniversaries = [
      ann({ activityName: "Darkness's Doorstep", yearsAgo: 6, first: { type: 'story' } as any }),
      ann({ activityName: 'The Shattered Throne', yearsAgo: 8, first: { type: 'dungeon' } as any }),
      ann({ activityName: 'Leviathan', yearsAgo: 9, first: { type: 'raid' } as any }),
    ];
    component.selectedDate = '2026-11-10';
    fixture.detectChanges();

    const hero = fixture.nativeElement.querySelector('.fireside-hero');
    expect(hero).toBeTruthy();
    expect(hero.textContent).toContain("On this day, you first cleared Darkness's Doorstep, The Shattered Throne, and Leviathan.");
    expect(hero.textContent).not.toContain('more that night');
    expect(hero.textContent).not.toContain('Hide list');
    expect(fixture.nativeElement.querySelector('.fireside-hero__list')).toBeNull();
  });

  it('emits share and navigate for the featured first', () => {
    spyOn(component.shareMemory, 'emit');
    spyOn(component.navigateToFirst, 'emit');
    const featured = ann({ activityName: 'Vault of Glass', yearsAgo: 3 });
    component.anniversaries = [featured];
    component.onShare(featured);
    component.onNavigate(featured);
    expect(component.shareMemory.emit).toHaveBeenCalledWith(featured);
    expect(component.navigateToFirst.emit).toHaveBeenCalledWith(featured);
  });
});
