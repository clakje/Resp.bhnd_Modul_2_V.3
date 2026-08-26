# FASE 6 av 7 — Moduser, backup, scenarioer og undervisningsverktøy

## Kontekst

Interaktiv NIV-respiratorsimulator for opplæring av sykepleiere. Ren HTML5, CSS3 og vanilla JavaScript — ingen byggeverktøy, ingen rammeverk, ingen biblioteker.

| Fil | Rolle |
|---|---|
| `index.html` | UI: monitor, målekort, slidere, faner, presetrad, innsiktsboks |
| `simulator.js` | Fysikkmotoren |
| `renderer.js` | Canvas-tegning, fire spor, markørtyper |
| `app.js` | Slidere → simulator, animasjonsloop, pauseknapp |
| `README.md` | Dokumentasjon (utdatert, oppdateres i denne fasen) |

**Denne fasen:** endring D1, D2, D4, D6, C12 og C13.

**Alt gjort i fase 1–5:**
- Fysisk trykkmodell: `P_target` → servo → `P_aw = P_servo - R_out * Q_total`, med flowbegrensning
- Kontinuerlig lungevolum, auto-PEEP, ekspiratorisk motstand og flowbegrensning, kontinuerlig lekkasje
- `patientDrive` med `rrSpont`, `pmusMax`, `tiNeural`, `pmusExp`, `variability`, `cardiacArtifact`, og innsatslogg `state.efforts`
- Fysisk trigger (flow og trykk) og cycling på lekkasjekorrigert flow, `tiMax`, `lastCycleReason`
- Målte verdier: PIP, Pplat, PEEPi, VTI/VTE, Ti/Te/I:E, RRtot/RRspont, lekkasje, asynkroni-indeks. Alarmer for apné, lekkasje, lavt Vt, høy frekvens, høyt trykk
- Monitor: min/maks-konvolutt, valgbar sveipetid (6/10/15 s), låsbare akser, Pes-spor, fire markørtyper inkludert kvadrat for maskinutløst pust (klargjort, ikke i bruk ennå)

**Kommer etter denne:** fase 7, som er opprydding og verifisering av restfeil.

---

## Regler for dette oppdraget

- **Gjør bare det som står i denne filen.** Oppdager du andre feil underveis, ikke fiks dem — list dem opp på slutten av svaret ditt i stedet.
- Behold norsk i all UI-tekst og alle kodekommentarer.
- Ingen nye biblioteker, ingen byggeverktøy. Behold filstrukturen.
- **Scenarioene skal være ekte parametersett, ikke skriptede kurver.** Et scenario setter bare innstillinger; fysikken produserer resten. Dette er et absolutt krav — se begrunnelsen under D4.
- Programmet skal kjøre og kunne testes når fasen er ferdig.

---

## D1 — PC-modus (trykkontrollert ventilasjon)

### Hvorfor

Fageksperten peker på at referansesimulatorens «early cycling» bare kunne vises i PC-modus, og at det burde vært mulig også i trykkstøtte. Det er nå mulig i trykkstøtte, etter fase 1–3. Men PC-modus er verdt å ha av en selvstendig pedagogisk grunn: i PC er inspirasjonstiden **satt av maskinen**, ikke forhandlet med pasienten. Ved å bytte mellom PS og PC på samme pasient ser sykepleieren hva «pasienten er med på å bestemme» faktisk betyr — og hvorfor asynkroni ser helt forskjellig ut i de to modusene.

### Bestilling

Legg til en modusvelger (`<select id="selectMode">`) i respiratorinnstillingene, med `PS` (trykkstøtte, standard) og `PC` (trykkontroll).

Forskjeller i `simulator.js`:

- **PC:** `Ti` er satt direkte (ny innstilling `settings.tiSet`, 0,6–2,0 s, standard 1,0). **Ingen flow-cycling** — inspirasjonen avsluttes utelukkende på tid. Frekvensen er satt (`settings.rateSet`), men pasienten kan trigge et pust tidligere dersom triggerbetingelsen oppfylles utenfor refraktærtiden (assist-kontroll).
- **PS:** som etter fase 2, med flow-cycling og `tiMax` som tak.
- Trykkinnstillingen bør hete `PC over PEEP` i PC-modus og `IPAP` i PS-modus. Vis **både** absolutt trykk og ΔP over PEEP samtidig i begge moduser. Dette er en klassisk klinisk feilkilde — noen maskiner setter absolutt trykk, andre setter trykk over PEEP — og simulatoren bør gjøre begge lesbare.
- **Grå ut** cycling-slideren i PC-modus og vis Ti-slideren i stedet. Ikke skjul den. Å se at en innstilling *ikke gjelder* i en modus er selv en læringssituasjon; en skjult slider lærer ingenting.
- Oppdater `modeBadge` i headeren så den viser gjeldende modus riktig.
- Måleverdiene `Ti`, `Te` og `I:E` skal vises i begge moduser, slik at de kan sammenlignes direkte.

---

## D2 — Backup-frekvens (NIV-ST)

### Hvorfor

`index.html` viser i dag «Modus: Spontan / Trykkstøtte (PSV / NIV-ST)». ST betyr *spontaneous/timed* — maskinen **skal** levere et pust dersom pasienten ikke trigger innen et gitt intervall. Koden har ingen slik mekanisme: svikter triggingen, får pasienten ingenting. Det er ren PSV, og etiketten er faglig feil.

Klinisk er backup-frekvensen dessuten det som skiller en trygg fra en farlig NIV-innstilling hos en pasient med redusert respirasjonsdrive — ved CO₂-narkose eller opioider.

### Bestilling

- Legg til `settings.backupRate` (0–30 /min, standard 12) og et avkrysningsfelt `ST-modus aktiv` (standard på).
- Logikk: er det ikke levert noe pust i `60 / backupRate` sekunder, leverer maskinen et **maskinutløst pust** med samme trykknivå og `Ti = tiMax * 0.7` (eller `tiSet` i PC-modus). Marker det som `type: 'mandatory'` i `state.efforts`.
- Maskinutløste pust skal tegnes med kvadratmarkøren som ble klargjort i fase 5, ikke med trekanten.
- Legg til måleverdien **`% spontane pust`** (pasientutløste / totale pust i glidende 60 s). Dette ene tallet er en av de mest brukte kliniske indikatorene på om NIV-innstillingene passer pasienten.
- **Viktig distinksjon:** ved `rrSpont = 0` med ST aktiv skal apné-alarmen **ikke** utløses, fordi pasienten faktisk ventileres. Apné hos pasienten er ikke det samme som manglende ventilasjon. Skill de to i alarmlogikken, og vis i stedet `% spontane = 0`.

---

## D4 — Scenarioknapper for asynkroni

### Hvorfor, og hvorfor de må være ekte parametersett

Underviseren trenger å komme rett til funnet, uten å fikle med seks slidere foran en gruppe.

Men scenarioene må være **ekte parametersett**: hvert scenario setter bare innstillinger, og fysikken produserer resten. Da kan deltakerne fortsette å utforske videre fra scenarioet — endre én ting, se hva som skjer — og det er der læringen skjer. Et skriptet kurvebilde er en illustrasjon; et parametersett er en situasjon man kan gjøre noe med.

### Bestilling

Legg til en scenariorad over presetradene i `index.html`, med samme knappestil (`preset-btn`). Hvert scenario skal:

1. sette **alle** parametere eksplisitt (ingen skjulte flagg, ingen scriptede kurver),
2. oppdatere alle slidere og badges synlig, slik at brukeren ser hva som ble endret,
3. skrive en kort forklaring i innsiktsboksen med tre punkter: *hva du ser*, *hvorfor det skjer*, *hva du gjør med det*.

| Scenario | Innstillinger | Funnet som skal bli synlig |
|---|---|---|
| **Godt tilpasset NIV** | C 50, R 5, Pmus 3, rrSpont 14, IPAP 14, EPAP 5, stigetid 150 ms, cycling 25 %, trigger 1,5, lekkasje 5 | Referansebildet. Alle pust assistert, Vt 450–550, ingen asynkroni |
| **Trigger for treg** | som over, men trigger 5,0 | Mislykkede innsatser, buler i ekspirasjonsflow, `% spontan` faller |
| **Autotrigging** | trigger 1,0, lekkasje 40, Pmus 2, rrSpont 12 | Maskinfrekvens langt over pasientfrekvens, blandede ekte/falske markører |
| **Stigetid for treg** | stigetid 800 ms, Pmus 8 | Avrundet trykkurve med skulder/dipp, lav og bred flow |
| **Stigetid for rask** | stigetid 50 ms, Pmus 8 | Trykkspike, skarp flowforkant, tidlig cycling, lavere Vt |
| **For tidlig avslutning** | cycling 85 %, Pmus 7, tiNeural 1,2 s | Dobbelttrigging, trykk dras under EPAP etter cycling |
| **For sen avslutning** | cycling 5 %, pmusExp 8, tiNeural 0,6 s | Terminal-spike i trykket, flow krysser nullinjen før cycling |
| **KOLS med auto-PEEP** | KOLS-preset, rrSpont 25, EPAP 5, trigger 2,0 | Volumbaselinje kryper oppover, PEEPi > 5, mislykkede innsatser oppstår av seg selv |
| **Hyperkapnisk KOLS, behandlet** | som over, men IPAP 20 / EPAP 8, rrSpont 18 | Samme pasient, riktigere innstilling: PEEPi faller, trigging gjenopprettes, Vt stiger |
| **Redusert respirasjonsdrive** | rrSpont 4, Pmus 1, ST-modus på, backup 14 | Maskinen overtar, `% spontan` nær 0, **ingen** apné-alarm |

Plasser de to KOLS-scenarioene rett ved siden av hverandre i raden. Det er *samme pasient*, og forskjellen er utelukkende innstillingene — den sammenligningen er hele poenget med NIV ved KOLS, i to knappetrykk.

---

## D6 — Frys og pek: undervisningsmodus

### Hvorfor

Den viktigste interaksjonen i et klasserom er ikke å endre en slider. Det er å stoppe bildet og spørre *«hva ser dere her?»*

Dagens pauseknapp (`app.js` linje 429) stopper simuleringen, men `renderer.render()` kalles fortsatt og sveipelinjen står igjen. Det fungerer, men gir ikke underviseren noe å peke med.

### Bestilling

Utvid pauseknappen til en full frysemodus:

- Ved frys: skjul sveipelinjen, og behold de siste 15 sekundene stille på skjermen.
- **Kursor:** musepeker eller finger over kurvefeltet gir en vertikal markørlinje med tallverdier for alle fire kurver på det tidspunktet — som kursorfunksjonen på en ekte monitor. Bruk «siste verdi»-bufferet fra fase 5.
- **Knapp `Kopier skjermbilde`:** legger canvas-innholdet på utklippstavlen (`canvas.toBlob()` → `navigator.clipboard.write()`). Da kan kurvebildene limes rett inn i Rise 360 eller PowerPoint uten manuelle skjermbilder. Vis en kort bekreftelse når det er gjort.
- **Knapp `Vis fasit`:** legger et gjennomsiktig annotasjonslag over kurven med piler og korte tekster som peker på funnet i det aktive scenarioet. Definer annotasjonene som en del av hvert scenario i D4 (posisjon relativt til siste pust, pil, tekst). Dette er samme grep fageksperten selv brukte i tilbakemeldingene sine — røde ringer og piler på skjermbilder — og det er verdt å bygge inn i verktøyet.

---

## C12 — Innsiktsboksen er hardkodet på presetnavn

`simulator.js` linje 314–321 velger tekst ut fra `preset === 'copd'` eller `R >= 12`, i en if/else-kjede der bare én gren kan vinne.

Bruker man sliderne til å lage en pasient som er både stiv og obstruktiv — C 25 / R 20, altså KOLS-eksaserbasjon med pneumoni, en helt vanlig klinisk kombinasjon — får man teksten for restriktiv lunge alene, og hele obstruksjonen forties.

### Bestilling

Bygg innsiktsteksten av **uavhengige regelbiter** som kombineres, ikke av gjensidig utelukkende presetnavn. Hver regel vurderes for seg og bidrar med en setning hvis den er aktiv:

| Regel | Utløses av | Innhold |
|---|---|---|
| Obstruksjon | `R ≥ 12` | τ, tid til 95 % tømming, flow-hale |
| Restriksjon | `C ≤ 30` | forventet Vt, behov for høyere ΔP |
| Auto-PEEP | `PEEPi > 2` | hva som fanges, hvorfor trigging blir tung, hva som hjelper |
| Asynkroni | `asynkroni-indeks > 10 %` | hvilken type dominerer, og hva den skyldes |
| Lekkasje | `lekkasje % > 25` | konsekvens for cycling, trigging og målte volumer |
| Cyclingårsak | `lastCycleReason === 'tiMax'` | at maskinen avsluttet på tid, ikke på flow, og hva det betyr |
| Vt per kg | alltid | forholdet til idealvekt |

Er ingen regel aktiv, vis en kort «normal mekanikk»-tekst med τ.

---

## C13 — Dokumentasjon i utakt med koden

`README.md` oppgir Flow som blå og Volum som grønn; `renderer.js` linje 33–37 bruker grønn for flow og cyan for volum. README oppgir også en formel som ikke stemmer med koden.

### Bestilling

Oppdater `README.md` til å beskrive programmet slik det nå faktisk er:

- Riktige farger for alle fire spor
- Den nye fysikkmodellen: servoregulert trykkilde med utgangsimpedans og flowbegrensning, kontinuerlig lungevolum, auto-PEEP, kontinuerlig lekkasje, uavhengig pasientdrive
- Alle moduser, innstillinger med områder, og alle måleverdier
- Scenarioliste med hva hvert scenario demonstrerer
- En kort seksjon «Pedagogisk bruk» med de tre grepene fra `00_START_HER.md`
- Behold strukturen og tonen i dagens README

---

## Test før du går videre

| # | Innstilling | Forventet | Krav |
|---|---|---|---|
| T23 | Bytt PS → PC på samme pasient | Ti blir fast, cycling-slideren grås ut, kurveformen endrer seg tydelig | krav |
| E18 | rrSpont 0, ST på, backup 12 | Ingen apné-alarm, alle pust merket maskinutløste (kvadrat), RRtot = 12 | ±1 |
| E17 | rrSpont 0, ST **av** | Apné-alarm etter 15 s | ±2 s |
| T24 | Trykk gjennom alle 10 scenarioer | Hvert scenario oppdaterer alle slidere synlig, og funnet vises innen 10 s | krav |
| T25 | Etter et scenario: endre én slider | Situasjonen utvikler seg fysikalsk videre, ingenting «snapper tilbake» | **absolutt krav** |
| T26 | De to KOLS-scenarioene etter hverandre | PEEPi faller og trigging gjenopprettes i det andre | krav |
| T27 | Frys, beveg kursor over kurvene | Tallverdier for alle fire spor vises på kursorposisjonen | krav |
| T28 | Frys, `Kopier skjermbilde`, lim inn i et dokument | Kurvebildet limes inn | krav |
| T29 | C 25 / R 20 satt manuelt | Innsiktsboksen nevner **både** obstruksjon og restriksjon | krav (prøven på C12) |

**T25 er prøven på at scenarioene er ekte.** «Snapper» noe tilbake, eller endres ikke kurven som forventet, er scenarioet skriptet i stedet for parametersatt — og da mister det hele sin pedagogiske verdi.

**Commit:** `fase 6: PC-modus, ST-backup, scenarioer, frysemodus, regelbasert innsiktsboks, oppdatert README`
