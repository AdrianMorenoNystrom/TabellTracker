import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { RoundRecap } from '../../utils/round-recap';
import { avatarColor } from '../../utils/avatar-color';

@Component({
  selector: 'app-round-recap-story',
  standalone: true,
  templateUrl: './round-recap-story.component.html',
  styleUrl: './round-recap-story.component.scss',
})
export class RoundRecapStoryComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) recap!: RoundRecap;
  @Input() saving = false;
  @Input() error = '';
  @Output() dismiss = new EventEmitter<void>();
  @ViewChild('dialog', { static: true }) dialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('content', { static: true }) content!: ElementRef<HTMLElement>;
  slide = 0;
  readonly slides = ['Omgången', 'Tabellförändringen', 'Säsongen i siffror'];
  readonly color = avatarColor;
  private previousFocus: HTMLElement | null = null;
  private previousOverflow = '';
  private touch: { x: number; y: number } | null = null;

  ngAfterViewInit() {
    this.previousFocus = document.activeElement as HTMLElement;
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.dialog.nativeElement.showModal();
    this.dialog.nativeElement.querySelector<HTMLButtonElement>('.close')?.focus();
  }
  ngOnDestroy() {
    this.dialog.nativeElement.close();
    document.body.style.overflow = this.previousOverflow;
    if (this.previousFocus?.isConnected && this.previousFocus !== document.body) this.previousFocus.focus();
    else document.querySelector<HTMLButtonElement>('.navbar button')?.focus();
  }
  next() { this.go(this.slide + 1); }
  previous() { this.go(this.slide - 1); }
  private go(index: number) {
    if (index < 0 || index >= this.slides.length || this.saving) return;
    this.slide = index;
    this.content.nativeElement.scrollTop = 0;
    if (index === 0 && document.activeElement === this.dialog.nativeElement.querySelector('.previous')) {
      this.dialog.nativeElement.querySelector<HTMLButtonElement>('.primary')?.focus();
    }
  }
  close() { if (!this.saving) this.dismiss.emit(); }
  cancel(event: Event) { event.preventDefault(); this.close(); }
  key(event: KeyboardEvent) {
    if (event.key === 'Tab') {
      const buttons = Array.from(this.dialog.nativeElement.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const first = buttons[0], last = buttons.at(-1);
      if (!first) { event.preventDefault(); this.dialog.nativeElement.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === this.dialog.nativeElement)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === this.dialog.nativeElement)) {
        event.preventDefault(); first.focus();
      }
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault(); event.key === 'ArrowRight' ? this.next() : this.previous();
    }
  }
  touchStart(event: TouchEvent) {
    this.touch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  }
  touchEnd(event: TouchEvent) {
    const start = this.touch; this.touch = null;
    if (!start || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) dx < 0 ? this.next() : this.previous();
  }
  touchCancel() { this.touch = null; }
  number(value: number) { return value.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  movement(change: number | null) { return change == null ? 'Ny' : change > 0 ? `↑${change}` : change < 0 ? `↓${-change}` : '—'; }
  movementLabel(change: number | null) {
    return change == null ? 'Ny i tabellen' : change > 0 ? `Upp ${change} placeringar` : change < 0 ? `Ner ${-change} placeringar` : 'Oförändrad placering';
  }
}
