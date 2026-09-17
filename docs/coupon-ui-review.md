# Kontrollera kupongens layout

Starta utvecklingsservern med `npm start`. Kör sedan `npm run test:ui` i en annan terminal.

Kontrollen öppnar den riktiga Angular-vyn med påhittade spelare och matcher. Alla anrop till Supabase och dess realtime-anslutning fångas upp lokalt. Inget konto krävs och inga uppgifter skickas till databasen.

På Windows används installerad Microsoft Edge. För en annan webbläsarsökväg, sätt `CHROME_BIN`. På andra system kan testwebbläsaren installeras med `npx playwright install chromium`. `COUPON_TEST_URL` kan ange en annan lokal utvecklingsadress än `http://localhost:4200/`.

Testet kontrollerar:

- 320, 375, 390, 430, 768 och 1440 px: ingen horisontell scroll, tecken/procent/odds i samma kolumner och minst 44 × 44 px för teckenknapparna.
- Tangentbordsval, sparande och kvotstatus.
- Realtime med ändrat ägarskap och tips, samt resultat som anländer efter spelstopp: matchraderna behåller sina positioner.
- Saknade odds/procent, hämtfel, adminens korrigeringsvy och laddningsrader.
- Översikt på mobil och desktop: alla 13 matcher, saknade tips, oförändrad stillbild vid realtime och återställt tangentbordsfokus när dialogen stängs.

Skärmbilder och mätvärden sparas i `tmp/coupon-review/` (ignoreras av Git). Kör även `npm run typecheck`, `npm test -- --watch=false --browsers=ChromeHeadless` och `npm run build` för ordinarie kontroller. Karma behöver `CHROME_BIN` om Chrome inte är installerat.

## Design

Matchraden använder CSS Grid med en flexibel namnkolumn och tre lika breda teckenkolumner. Procent- och oddsraderna är subgrids som ärver kolumnerna. Under 600 px får matchnamnet en egen rad och teckenkolumnerna blir flexibla. Meddelanden och rensa-knapp har reserverat utrymme för att undvika hopp vid uppdateringar.

Designvariablerna är lokala för kupongen: blått `#00427A`, ytor `#FFFFFF`/`#F7F9FB`, separatorer `#E4E6E8`, text `#000000`/`#333333`. Arial ersätter det globala displaytypsnittet endast här. Matchkort, spelarens färgpiller och rundade teckenknappar är borttagna. Komponentens utökade responsiva CSS ryms inom en varningsbudget på 6 kB; felgränsen är fortsatt 8 kB.

Referensbilden saknades i den mottagna bilagan. Layouten följer den utförliga textspecifikationen.

## Översikt

Knappen högst upp öppnar en kompakt stillbild av lagets sparade tecken. Färgmarkeringarna vid spelarnamnen och matcherna använder samma befintliga spelarfärger. Inga nya anrop görs och inga tips ändras i översikten. Den kan öppnas när alla lokala teckenval är sparade; ej tippade matcher visas med streck och ett antal saknade tips. Stäng och öppna igen för att få en ny stillbild. Översikten stängs om medlemskapet återkallas eller användaren lämnar kupongvyn.
