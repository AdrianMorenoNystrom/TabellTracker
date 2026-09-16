# Stryktipstabellen

Webbsidan körs med Angular. API, inloggning och databas körs i Supabase.

**[Enkel steg-för-steg-guide för utvecklingsmiljön](docs/live-tipping.md)**

Starta webbsidan:

```sh
npm start
```

- Admininloggning: **http://localhost:4200/admin/login**
- Adminvy: **http://localhost:4200/admin**
- Kupong: **http://localhost:4200/**

Admin använder e-post och lösenord. Övriga spelare får personliga inbjudningslänkar från adminvyn.

Första gången behöver du köra databasuppgraderingarna, koppla ditt adminkonto och deploya Edge Function. Guiden visar exakt vilka filer och kommandon du använder.

```sh
npm run test:server
npm test -- --watch=false --browsers=ChromeHeadless
npm run typecheck
npm run build
```
