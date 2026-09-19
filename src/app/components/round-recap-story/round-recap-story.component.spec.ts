import { TestBed, ComponentFixture } from '@angular/core/testing';
import { RoundRecapStoryComponent } from './round-recap-story.component';
import { buildRoundRecap } from '../../utils/round-recap';

describe('RoundRecapStoryComponent', () => {
  let fixture: ComponentFixture<RoundRecapStoryComponent>;
  let component: RoundRecapStoryComponent;
  beforeEach(async () => {
    await TestBed.configureTestingModule({imports:[RoundRecapStoryComponent]}).compileComponents();
    fixture = TestBed.createComponent(RoundRecapStoryComponent); component = fixture.componentInstance;
    fixture.componentRef.setInput('recap',buildRoundRecap([{id:27,roundNumber:27,week:27,totalScore:13,seasonId:1,
      players:['Ompen','Adrian','Sillen','Danne'].map((name,i)=>({id:i+1,name,score:i===0?4:3,matchesPicked:i===0?4:3,total_matches:3,avg_score_per_round:3}))}],27));
    fixture.detectChanges();
  });
  it('opens a modal with focus inside, exactly three slides and no seen event', () => {
    expect(component.dialog.nativeElement.open).toBeTrue();
    expect(component.dialog.nativeElement.contains(document.activeElement)).toBeTrue();
    expect(component.slides.length).toBe(3);
    expect(fixture.nativeElement.textContent).toContain('13');
    expect(fixture.nativeElement.querySelectorAll('.full').length).toBe(4);
  });
  it('supports buttons, keyboard, boundaries, and explicit close on last slide', () => {
    const close = spyOn(component.dismiss,'emit');
    component.previous(); expect(component.slide).toBe(0);
    (fixture.nativeElement.querySelector('.primary') as HTMLButtonElement).click();
    expect(component.slide).toBe(1);
    component.key(new KeyboardEvent('keydown',{key:'ArrowRight'})); fixture.detectChanges();
    expect(component.slide).toBe(2); component.next(); expect(component.slide).toBe(2);
    expect(close).not.toHaveBeenCalled();
    (fixture.nativeElement.querySelector('.primary') as HTMLButtonElement).click();
    expect(close).toHaveBeenCalledTimes(1);
    component.key(new KeyboardEvent('keydown',{key:'ArrowLeft'})); expect(component.slide).toBe(1);
  });
  it('X and Escape explicitly dismiss; component destruction does not', () => {
    const close = spyOn(component.dismiss,'emit');
    (fixture.nativeElement.querySelector('.close') as HTMLButtonElement).click();
    expect(close).toHaveBeenCalledTimes(1);
    const event = new Event('cancel',{cancelable:true}); component.cancel(event);
    expect(event.defaultPrevented).toBeTrue(); expect(close).toHaveBeenCalledTimes(2);
    fixture.destroy(); expect(close).toHaveBeenCalledTimes(2);
  });
  it('supports left/right swipes but ignores vertical scroll and short gestures', () => {
    const swipe = (dx:number,dy:number) => {
      component.touchStart({touches:[{clientX:200,clientY:200}]} as unknown as TouchEvent);
      component.touchEnd({changedTouches:[{clientX:200+dx,clientY:200+dy}]} as unknown as TouchEvent);
    };
    swipe(-80,5); expect(component.slide).toBe(1);
    swipe(80,5); expect(component.slide).toBe(0);
    swipe(-60,120); swipe(-20,0); expect(component.slide).toBe(0);
  });
  it('keeps keyboard focus through last/first slide transitions and traps Tab', () => {
    const primary = fixture.nativeElement.querySelector('.primary') as HTMLButtonElement;
    const previous = fixture.nativeElement.querySelector('.previous') as HTMLButtonElement;
    primary.focus(); primary.click(); fixture.detectChanges(); primary.click(); fixture.detectChanges();
    expect(document.activeElement).toBe(primary);
    component.previous(); fixture.detectChanges(); previous.focus(); previous.click(); fixture.detectChanges();
    expect(document.activeElement).toBe(primary);
    const tab = new KeyboardEvent('keydown',{key:'Tab',cancelable:true}); component.key(tab);
    expect(tab.defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.close'));
  });
});
