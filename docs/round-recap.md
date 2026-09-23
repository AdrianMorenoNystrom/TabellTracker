# Omgångsrecap

En automatisk recap med tre vyer visas när en inloggad spelare öppnar appen och den senaste färdiga omgången inte har kvitterats. Recapen innehåller omgångens resultat, tabellförändringen och säsongen i siffror.

## Aktivera funktionen

1. Kör `supabase/migrations/202609190001_round_recap.sql` i SQL Editor i rätt Supabase-projekt. De tre tidigare live-migreringarna ska redan vara installerade. Använd projektets vanliga migreringsflöde om migreringarna hanteras med Supabase CLI.
2. Publicera frontend med dessa kodändringar. Ingen ny Edge Function, hemlighet eller cron behövs för recapen.
3. Logga in med en spelare och öppna appen. Den senaste kompletta omgången visas även om den registrerades före denna driftsättning. Stäng med X eller sista sidans Stäng. Ladda om: recapen ska inte visas igen.
4. Kontrollera gärna med samma medlemskap på en annan enhet. Enhetsaktivering följer appens befintliga regler: en ny spelarenhet ersätter den gamla. Admins permanenta konto och spelarenhet kan höra till samma medlemskap.

Migreringen är tillagd i repositoryt och testas i en lokal databas. Den har inte körts mot produktion under implementationen. Lokal frontend på http://localhost:4200/ använder det Supabase-projekt som anges i utvecklingsmiljön; även det projektet behöver migreringen.

## Analys och val av lösning

Livekupongens slutliga registrering görs av befintlig rättningslogik: `live_draws.status = 'settled'` och `round_id` kopplar kupongen till `rounds`/`round_players`. Manuellt inlagda omgångar har ingen separat slutstatus. För dessa kräver recap fyra unika spelare, giltiga resultat, tre trematchsrader, en fyramatchsrad och att spelarnas summa stämmer med lagtotalen. Ofullständiga manuella inlägg visas inte. En kopplad livekupong måste vara `settled`.

Projektet har redan historiska omgångar och deterministiska hjälpfunktioner. Därför skapas ingen separat tabell med kopior av statistiken. Befintliga resultatbilder visade också att statistik efter en specifik omgång kan räknas från historiken.

`round_recap_pending()` hämtar den senaste kompletta omgången och dess säsongshistorik i samma SQL-snapshot. Historiken avgränsas till målomgången. Frontend gör dessutom samma avgränsning innan någon statistik beräknas och kopierar underlaget till en fristående visningsmodell. Nya omgångar påverkar därför inte äldre recaps. En redan öppen recap uppdateras aldrig via realtime.

Administrativa rättelser kan ändra en framtida beräkning av en historisk recap. En sådan rättelse öppnar inte automatiskt en redan sedd recap igen. Detta följer projektets befintliga korrigerbara resultatmodell.

## Återanvända beräkningar

- `getRoundWinners`: högst antal rätt, med delade vinnare.
- `calculatePlacementHistory`: flest rätt, därefter färre tippade matcher; lika värden ger delad placering.
- `calculatePlacementSummaries`: placering före/efter och förändring.
- `calculateRoundWins`: både egna och delade omgångsvinster räknas.
- `calculatePlayerPerformance`: säsongens träffsäkerhet och femomgångsform.
- Befintlig `Round.totalScore`: lagets resultat. Säsongssnittet är medelvärdet av de avgränsade omgångarnas lagresultat.
- `avatarColor`: spelarens befintliga lokala färgval.

Form är summa rätt / summa faktiskt tippade matcher över spelarens fem senaste registrerade omgångar i säsongen, eller de tillgängliga om färre än fem finns. Det är inte medelvärdet av fem procenttal. Träffsäkerhet och form använder huvudstatistikens avrundning till en decimal. Delade bästa värden visar samtliga namn.

Det finns två äldre avvikande presentationer som inte ändras i detta arbete: resultatbilden använder tre senaste omgångarna och skillnaden mot säsongens träffsäkerhet; Data-sidans spelarkort och märket ”Formstarkast” använder snittantal rätt under fem omgångar. Huvudjämförelsen och den nya recapen använder träffsäkerhet över fem omgångar.

## Sedd-status och flera missade omgångar

Tabellen `round_recap_views` innehåller `round_id`, `member_id` och `seen_at`. Primärnyckeln `(round_id, member_id)` gör kvittensen unik. Medlems-id är `live_members.player_id`, som är stabilt även när enhetens auth-id byts.

Appen väljer först den senaste färdiga omgången och kontrollerar sedan kvittensen. Den söker inte bakåt efter nästa osedda omgång. På så vis kan gamla eller sent registrerade historiska omgångar inte börja visas i en kö.

Endast X, Stäng på sista sidan och Escape anropar `round_recap_acknowledge`. Öppning, sidbyte, omladdning, stängning av webbläsaren och komponentens borttagning skriver ingenting.

Kvitteringen markerar målomgången och alla äldre kompletta omgångar som passerade. Sorteringen tar hänsyn till säsongens startår, säsongs-id och omgångsnummer. En ny säsongs omgång 1 kommer därmed efter föregående säsongs omgång 28. Upprepade kvitteringar använder `ON CONFLICT DO NOTHING` och ändrar inte den ursprungliga tiden. En nyare omgång som blir färdig medan recapen visas kvitteras inte.

RLS tillåter bara läsning av egna kvittenser. Klienten har ingen direkt skrivrätt till tabellen. Den skyddade kvitteringsfunktionen härleder medlemskapet från `auth.uid()` via befintliga `live_player_id()`; inget valfritt medlems-id kan skickas in. Anonyma besökare saknar funktionsbehörighet och inaktiva eller ersatta enheter kan inte kvittera. Projektet har en liga; ingen ny modell för flera ligor införs.

## Startflöde och felhantering

`App` startar `RoundRecapService`. Tjänsten väntar på färdig auth och en slutförd navigering till en skyddad sida. Inbjudnings- och inloggningssidor täcks inte av recapen. Den kontrollerar även vid återkomst till en synlig flik eller ett fokuserat fönster, men hämtar aldrig nytt innehåll över en öppen recap.

Vid utloggning, återkallat medlemskap eller identitetsbyte tas recapen bort utan kvittering. Fördröjda svar från föregående identitet ignoreras. Ett läsfel, exempelvis saknad migrering eller nätverksavbrott, blockerar inte resten av appen; en ny kontroll görs vid nästa öppning/återkomst. Ett skrivfel behåller recapen och visar en uppmaning att försöka stänga igen. Ingen falsk sedd-status sparas lokalt.

Två redan öppna enheter kan visa samma recap samtidigt. Kvitteringen är gemensam och idempotent, men den andra redan öppna visningen stängs inte via realtime. Vid nästa öppning läses den gemensamma kvittensen.

## Gränssnitt

`RoundRecapStoryComponent` är en native modal dialog som fyller mobilens viewport. På desktop visas en större centrerad storyyta. Appen bakom är inert. Innehållet kan rulla vertikalt vid behov; sidhuvud och navigationsknappar ligger kvar inom skärmen.

Exakt tre sidor, manuellt tempo, sidräknare och progressprickar. Knappar, horisontell swipe och vänster/höger piltangent stöds. Vertikala och avbrutna touchgester byter inte sida. Tab/Shift+Tab stannar i recapen och fokus återgår till appen vid stängning. Samma nästa/stäng-knapp behåller fokus mellan sidorna. Rörelseinställningen `prefers-reduced-motion` respekteras.

Resultatsidan har högst en objektiv highlight: första fullpotten av aktuell typ, 3/3 eller 4/4, för en spelare under säsongen. Tabellen hanterar nya och delade ledningar utan att utropa en ensam ledare när flera delar. Sista sidan visar fyra kompakta mått: lagets snitt, bäst träffsäkerhet, flest omgångsvinster och bäst form.

Inga nya export-, bild- eller delningsfunktioner ingår. Den tidigare resultatbildsfunktionen är kvar. Bonus-slide är inte aktiverad.

På en rättad kupong visas ett vänteläge med ”Väntar på nya rader” och en nedtonad men läsbar matchlista. ”Visa recap” öppnar den valda omgången även om den redan har kvitterats. Återöppning läser omgångens säsong från historiken och använder samma avgränsade beräkning som automatisk recap; senare omgångar påverkar inte statistiken. Ingen ytterligare migrering krävs. Vid stängning används den befintliga idempotenta kvitteringen.

När nästa spelbara kupong har hämtats växlar den vanliga kupongvyn automatiskt från den rättade omgången. Växlingen sker via realtime eller nästa reservhämtning (var 15:e sekund), utan knapptryck. Sparande, osparade val och pågående administrativa korrigeringar avslutas först. En historisk omgång som användaren uttryckligen valt i omgångsväljaren ligger kvar; en nyöppnad kupongvy följer åter senaste omgången. Nedtoningen tas bort i adminläge för att korrigeringsverktygen ska vara tydliga. En kupong som bara nått spelstopp behåller meddelandet om att rättning inväntas.

## Testa vänteläget på dev-servern

Starta med `npm start` och öppna **http://localhost:4200/dev/kupong**. Sidan finns bara i utvecklingsbygget och kräver ingen inloggning eller SQL-ändring.

- Startsidan visar en färdigrättad testkupong med 9/13 rätt och vänteläget.
- **Visa recap** öppnar testomgångens recap. Stängning skriver ingen kvittens till databasen.
- **Simulera nästa kupong** skickar en lokal uppdatering och kupongen växlar automatiskt till nästa öppna omgång.
- **Visa rättad kupong** återställer förhandsvisningen. Omladdning återställer också all testdata.

Tips som klickas i nästa testkupong sparas bara i sidans minne. Förhandsvisningen använder samma kupongkomponent och växlingslogik som appen. Dev-routen ingår inte i produktionsappens routning.

För mobil på samma Wi-Fi: starta `npm start -- --host 0.0.0.0 --ssl` och öppna `https://DATORNS-IP:4200/dev/kupong`. Webbläsaren kan behöva godkänna det lokala utvecklingscertifikatet.

Browsertestet körs med `npm run test:preview-ui` mot en igångvarande dev-server. Det verifierar vänteläge, recap, automatisk övergång, återställning och att förhandsvisningen inte anropar Supabase.

## Filer och tester

- `src/app/components/round-recap-story/`: den nya presentationen och komponenttester.
- `src/app/services/round-recap.service.ts`: startkontroll, kvittering och sessionshantering; tillhörande tester täcker fel, revokering och utebliven kvittering vid avbrott.
- `src/app/utils/round-recap.ts`: historiskt avgränsad visningsmodell; tillhörande tester täcker vinnare, placeringar, fullpotter, form och att omgång 28 inte påverkar recap 27.
- `src/app/app.ts` och `app.html`: startar tjänsten och visar recapen.
- `supabase/migrations/202609190001_round_recap.sql`: datamodell, RLS och RPC-funktioner.
- `tests/database.test.mjs`: testar migreringen, kvittenser, säsongsbyte, saknade/ofullständiga resultat, senaste omgång, konkurrerande ny omgång, enhetsbyte och RLS i PGlite.
- `tests/ui/round-recap.cjs`: browserflöde och skärmbilder på 320, 375, 390, 430, 768 och 1440 pixlar. Alla Supabase-anrop är simulerade; ingen produktionsdata ändras.
- Befintliga testfixturer har anpassats så att recapen inte anropar verklig Supabase under testerna.

Kör `npm run typecheck`, `npm run build`, `npm test -- --watch=false --browsers=ChromeHeadless` och `npm run test:server`. På Windows kan `CHROME_BIN` behöva peka på Edge.

Med en lokal utvecklingsserver igång: kör `npm run test:ui` för befintlig kupong och `npm run test:recap-ui` för recapen. `COUPON_TEST_URL` kan ange annan lokal adress. Skärmbilder sparas under `tmp/recap-review/` och är inte versionshanterade.
