import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  standalone: true, selector: 'app-admin-login', imports: [FormsModule, RouterLink],
  template: `<main><h1>Logga in som admin</h1>
    <p>Använd ditt adminkonto för att hämta kupongen och skapa inbjudningar. Samma konto fungerar på dina andra enheter.</p>
    <form #form="ngForm" (ngSubmit)="login()">
      <label for="admin-email">E-post</label>
      <input id="admin-email" name="email" type="email" autocomplete="username" [(ngModel)]="email" required email>
      <label for="admin-password">Lösenord</label>
      <input id="admin-password" name="password" type="password" autocomplete="current-password" [(ngModel)]="password" required>
      @if (error) { <p role="alert">{{ error }}</p> }
      <button [disabled]="busy || form.invalid">{{ busy ? 'Loggar in…' : 'Logga in' }}</button>
    </form>
    <p>Övriga spelare använder sin personliga inbjudningslänk.</p><a routerLink="/join">Till spelaraktivering</a>
  </main>`,
  styles: [`main{max-width:420px;margin:3rem auto;padding:24px;color:#18253e}p{line-height:1.6}label{display:block;margin:18px 0 6px}input{box-sizing:border-box;width:100%;padding:12px;font:inherit;border:1px solid #aebbd0;border-radius:7px}button{width:100%;min-height:48px;margin-top:24px;background:#263b70;color:white;font:inherit;border:0;border-radius:7px;cursor:pointer}button:disabled{opacity:.6}[role=alert]{color:#9b2525}`],
})
export class AdminLoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  email = ''; password = ''; busy = false; error = '';
  async login() {
    if (this.busy || !this.email.trim() || !this.password) return;
    this.busy = true; this.error = '';
    try {
      await this.auth.loginAdmin(this.email, this.password);
      this.password = '';
      await this.router.navigateByUrl('/admin');
    } catch (error) { this.error = (error as Error).message; }
    finally { this.busy = false; }
  }
}
