# Kom igång i utvecklingsmiljön

Du kör webbsidan på din dator. Databas, inloggning och API körs i Supabase. Du behöver ingen lokal API-server eller Docker för det här upplägget.

## 1. Öppna rätt Supabase-projekt

Utvecklingskoden pekar just nu på projektet **ywamyalehanpsnvskgfl**.

Öppna [utvecklingsprojektet i Supabase](https://supabase.com/dashboard/project/ywamyalehanpsnvskgfl). Använd detta projekt i stegen nedan.

Produktion pekar på ett annat projekt. Inställningarna finns i `src/environments/environment.ts` respektive `environment.prod.ts`.

## 2. Förbered databasen en gång

Öppna **SQL Editor** i Supabase. Klistra in och kör filerna i denna ordning:

1. [202609160001_live_tipping.sql](../supabase/migrations/202609160001_live_tipping.sql)
2. [202609160002_admin_login.sql](../supabase/migrations/202609160002_admin_login.sql)
3. [202609160003_free_match_choice.sql](../supabase/migrations/202609160003_free_match_choice.sql)
4. [202609190001_round_recap.sql](../supabase/migrations/202609190001_round_recap.sql)

**Kör bara de filer som du inte redan kört, i nummerordning.** Har du redan installerat de tre live-migreringarna behöver du bara köra `202609190001_round_recap.sql`. Den lagrar vilka omgångsrecaps varje spelare har sett. Se [omgångsrecap](round-recap.md) för funktion och teststeg.

Filerna förutsätter att projektets befintliga tabeller, säsonger och fyra spelare finns. De raderar ingen historik. Ett helt tomt Supabase-projekt behöver först få appens befintliga databasstruktur; dessa filer är uppgraderingar.

## 3. Ge dig själv en vanlig admininloggning

1. Öppna **Authentication → Users**.
2. Har du redan ett konto med e-post/lösenord i utvecklingsprojektet? Använd det. Annars välj **Add user → Create new user**, ange din e-post och ett lösenord och markera kontot som bekräftat.
3. Öppna [setup-admin.sql](../supabase/setup-admin.sql). Ändra `DIN_EPOST_HÄR` till kontots e-post och `Adrian` till ditt befintliga spelarnamn.
4. Kör innehållet i **SQL Editor**.

Klart. Kontot kan nu logga in som admin på olika enheter med samma e-post och lösenord. Du behöver ingen engångsinbjudan för att komma tillbaka. Skapa inte admin via det gamla `profiles.role`-fältet: behörigheten kopplas säkert till din spelare av SQL-filen.

För de övriga spelarnas inbjudningar: aktivera **Anonymous sign-ins** under Authentication. De behöver inga lösenord.

## 4. Lägg API:t i Supabase

Öppna en terminal i projektmappen och kör:

```sh
npx supabase login
npx supabase functions deploy stryktipset-sync --project-ref ywamyalehanpsnvskgfl --no-verify-jwt
```

Detta skickar Edge Function-koden till **utvecklingsprojektet**. Supabase tillhandahåller databasens servernyckel automatiskt; lägg ingen service-role-nyckel i Angular.

Flaggan `--no-verify-jwt` stänger av plattformens generella kontroll. Funktionen är fortfarande skyddad: den verifierar själv användarens token med Supabase Auth och kräver aktivt medlemskap. Scheduler använder en separat hemlighet.

Frontend anropar nu `supabase.functions.invoke('stryktipset-sync')`. Vercels gamla API och cron används inte längre.

## 5. Starta sidan och testa

Kör:

```sh
npm start
```

Öppna **[http://localhost:4200/admin/login](http://localhost:4200/admin/login)** och logga in med kontot från steg 3.

I adminvyn kan du:

- klicka **Hämta kupong och resultat**;
- flytta spelarna upp eller ned under **Ordning för fyraläggaren** och klicka **Spara ordningen**;
- klicka på en spelare för att skapa och kopiera dennes inbjudningslänk.

Testa en spelarinbjudan i en **annan webbläsarprofil**, så att du behåller din adminsession. Länken ser ut som `http://localhost:4200/join/...` och skapas av adminvyn.

**Så väljer spelarna matcher:** Alla väljer fritt bland lediga matcher. Tryck på **1, X eller 2**. Ett markerat tecken är en spik, två markerade tecken är en halva. Tryck på ett markerat tecken igen för att avmarkera. Matchen blir din när tipset sparas. Avmarkera alla tecken för att släppa matchen igen före spelstopp.

Har du redan fyllt spikkvoten visas **Osparat val** efter första trycket. Halvan sparas när du väljer det andra tecknet. Innan dess är ändringen inte sparad, och en ledig match är fortfarande tillgänglig för andra.

Överst under **Lagets rader** visas varje spelares status: **Rad klar ✓**, **Påbörjad** eller **Inte lagd**. Medan ändringar sparas visas **Sparar…**.

- Tre matcher: **en spik och två halvor**.
- Fyra matcher: **två spikar och två halvor**.

Snurran avgör bara vem som har fyra matcher. Sidan och databasen stoppar för många matcher, spikar och halvor. Om två spelare väljer samma lediga match får den som sparar först matchen.

**En localhost-länk fungerar bara på din dator.** När sidan publicerats skapar adminvyn i stället länkar med webbplatsens riktiga adress, som du kan skicka till vännerna.

Du kan alltid återvända till [admininloggningen](http://localhost:4200/admin/login). Startsidan innehåller också länken **Är du admin? Logga in här**.

## Automatisk hämtning – när det manuella testet fungerar

Detta behövs för automatisk import och rättning när ingen har sidan öppen. Du kan vänta med det tills du testat knappen i adminvyn.

1. Skapa en lång slumpmässig hemlighet, exempelvis med `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. I Supabase, öppna **Edge Functions → Secrets** och lägg till `CRON_SECRET` med det värdet.
3. I **Vault** skapar du två hemligheter: `live_project_url` = `https://ywamyalehanpsnvskgfl.supabase.co`, och `live_cron_secret` = samma värde som `CRON_SECRET`.
4. Kör [schedule-sync.sql](../supabase/schedule-sync.sql) i SQL Editor.

Nu anropar Supabase jobbet var femte minut. Jobbet avgör självt om odds, streck eller resultat behöver hämtas. Schemafilen kan köras igen utan att skapa ett extra jobb. [Supabase beskriver samma upplägg med Cron, pg_net och Vault](https://supabase.com/docs/guides/functions/schedule-functions).

## Om något inte fungerar

| Det du ser | Kontrollera |
| --- | --- |
| Fel e-post eller lösenord | Kontot ska finnas i utvecklingsprojektet, inte bara i produktion. |
| Kontot saknar adminbehörighet | Kör `setup-admin.sql` med rätt e-post och spelarnamn. |
| `live_members` eller `admin_auth_user_id` saknas | Kör den migration som saknas i steg 2. |
| Kupongen går inte att hämta | Kontrollera att `stryktipset-sync` finns under Edge Functions i samma projekt. Läs dess Logs. |
| Kupongen visas men går inte att tippa | Kör migration 003 om den saknas. Kontrollera spelstopp, om matchen är tagen och hur många spikar/halvor du har kvar. |
| Spelarens inbjudan går inte att aktivera | Aktivera Anonymous sign-ins. Länken kan vara använd eller äldre än sju dagar; skapa då en ny. |
| Glömt adminlösenord | Hantera kontot under Authentication i Supabase. Det behövs ingen ny spelarinbjudan. |

## Vad som ändrats och testas

Historiska spelare, omgångar, poäng och gamla tips behålls. Ny tippning använder `live_*`-tabellerna med RLS, versionskontroller och databasens deadline. Odds, streck och rådata sparas med tidsstämplar. Rättning uppdaterar en enda kopplad historikomgång och kan köras flera gånger utan dubbla poäng.

Admin har en separat beständig kontokoppling, `admin_auth_user_id`. Vanliga spelarenheter använder `auth_user_id` och ersätts när en ny inbjudan aktiveras. En ny spelarenhet får inte administratörsrättigheter bara för att den hör till samma spelare som admin.

```sh
npm run test:server
npm test -- --watch=false --browsers=ChromeHeadless
npm run typecheck
npm run build
```

SQL-testerna kör migrationerna mot det exporterade schemat och kontrollerar fria matchval, kvoter, ägarskap och rättning. Edge-testerna kontrollerar CORS, JWT-verifiering, medlemskap och schedulerhemlighet. Ingen produktionsmigration eller Edge-deployment utförs av dessa tester. Verklig Supabase Auth/Realtime mellan två webbläsare behöver kontrolleras efter setup.
