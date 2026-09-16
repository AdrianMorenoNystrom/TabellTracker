import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  standalone: true, selector: 'app-join', imports: [RouterLink],
  template: `<main class="join"><h1>Välkommen till Stryktipstabellen</h1>
    <p>{{ message }}</p>
    @if (token && !busy) { <button (click)="activate()">Aktivera den här enheten</button> }
    @if (error) { <p role="alert">{{ error }}</p> }
    <p>Du behöver ingen e-post eller lösenord. Behåll webbläsarens sparade data för att fortsätta vara inloggad.</p>
    <a routerLink="/admin/login">Är du admin? Logga in här</a>
  </main>`,
  styles: [`.join{max-width:34rem;margin:3rem auto;padding:1.5rem;line-height:1.6}button{min-height:48px;padding:0 1rem;background:#263b70;color:white;border:0;border-radius:8px;cursor:pointer}`],
})
export class JoinComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  token = this.route.snapshot.paramMap.get('token');
  busy = false;
  error = '';
  message = this.token ? 'Din personliga inbjudan aktiverar den här webbläsaren.'
    : 'Be ligans admin om en personlig inbjudningslänk till den här enheten.';
  async activate() {
    if (!this.token || this.busy) return;
    this.busy = true; this.error = '';
    try {
      await this.auth.redeem(this.token);
      this.token = null;
      await this.router.navigateByUrl('/', { replaceUrl: true });
    } catch (error) { this.error = (error as Error).message; }
    finally { this.busy = false; }
  }
}
