# FASE 2 — Fysikkmotor

Du jobber i `simulator.js` i en NIV-ventilatorsimulator. Filen løser bevegelsesligningen for lungemekanikk i sanntid med fast tidssteg `DT = 0.0002` s.

Denne fasen gjør fem endringer i fysikkmodellen. Alle er begrunnet i målinger som er gjort på dagens motor, og hvert tall i dokumentet er målt — ikke anslått.

Forutsetter at fase 1 er ferdig og merget.

## Arbeidsregler — les dette først

Dette dokumentet er en fullstendig arbeidsordre. Følg det strengt, og gjør ingenting på eget initiativ.

- **Gjør bare det som står i oppgavene nedenfor.** Ikke legg til forbedringer, ikke refaktorer, ikke døp om variabler, ikke rydd eller «moderniser» kode som ikke er nevnt. Ser du noe annet som bør rettes, skriv det i sluttrapporten i stedet for å rette det.
- **Ikke finn på tallverdier.** Alle tall i dokumentet er målt i fysikkmotoren, ikke anslått. Mener du en annen verdi er bedre, bruk den som står og skriv forslaget ditt i sluttrapporten.
- **Er noe uklart, motstridende, eller stemmer ikke med koden du ser — stopp og spør.** Ikke gjett. Linjenumre er omtrentlige og kan ha flyttet seg; finn koden på innhold, og si fra hvis du ikke finner den.
- **Endre bare filene som står under «Filer» nedenfor.** Alt annet skal ha tom diff.
- **Denne fasen er hele oppdraget.** Ikke begynn på noen annen fase, selv om du ser hva som mangler.

### Sluttrapport

Når du er ferdig, skriv en kort rapport med fire punkter:

1. Hvilke filer du endret, og hvilke oppgaver du gjorde.
2. Hva du eventuelt ikke fikk til, eller måtte løse annerledes enn beskrevet — og hvorfor.
3. Hvilke akseptansekriterier nederst du har verifisert selv, og resultatet.
4. Alt du la merke til som bør rettes senere, men som ikke hørte til denne fasen.

### Git

Kjør dette før du begynner:

```bash
git tag før-fase-2
git checkout -b fase-2-fysikkmotor
```

Ikke merge til hovedgrenen. Det gjøres manuelt etter at akseptansekriteriene nederst er kjørt.

### Filer

Du får endre: **kun** `simulator.js`.

Du skal ikke røre `app.js`, `renderer.js`, `index.html`, `style.css` eller noen testfil. `git diff --stat` skal vise én fil.

### Feller i denne fasen — les nøye

- **Ikke kjør `test_validering.js`, og ikke endre den.** Testbatteriet har 18 tester med toleranser som er tilpasset dagens *feilaktige* fysikk. Flere av dem vil feile etter denne fasen, og det er riktig. De rekalibreres i fase 6. Får du testresultater presentert som argument for å endre noe her, ignorer dem — å tilpasse motoren til de gamle testene gjør hele fasen ugjort.
- **Ikke juster tallverdiene i dokumentet.** `R_out = 2.2`, `K_out = 1.6`, `Ki = 5.0` og `tau = 0.25` er kalibrert mot kliniske referanseverdier og målt oppførsel. Endrer du dem, stemmer ikke måletallene i fase 5.
- **`P_out` skal bare brukes i én linje.** Endring C er lett å overdrive. Alle andre forekomster av `P_servo` skal stå urørt.
- Endring B fjerner `starvationScale` helt. Ikke behold den «i tilfelle» og ikke bygg en hybrid.

### Røyktest av `simulator.js`

Kjør denne etter hver endring i motoren. Den skal skrive `OK`:

```bash
node -e "global.window={};eval(require('fs').readFileSync('simulator.js','utf8'));console.log('OK')"
```


## Endring A — Myk muskelrelaksasjon

**Problem.** `P_mus` faller fra full kraft til null i ett enkelt tidssteg ved slutten av nevral inspirasjon. Fordi masketrykket løses algebraisk fra `P_mus` i samme tidssteg, forplanter spranget seg direkte til trykkurven. Målt i to nabosteg på 0,2 ms:

```
t=25.981   Pmus 5.000   Paw 7.617
t=26.001   Pmus 0.000   Paw 8.347      ← +0,73 cmH2O på 0,2 ms
```

Utslaget er `ΔP_mus × R_out / (R_exp + R_out)`. Det skjer på hvert eneste pust i hvert eneste scenario, og gjør at den «terminale trykkspiken» som skal læres bort i ett scenario finnes overalt.

Ekte inspirasjonsmuskulatur slapper av over 0,2–0,4 sekunder.

**Endring.** I klassen `PatientDrive`, metoden `step()`, rundt linje 134. Erstatt:

```javascript
        } else if (tn < tiN + 0.35) {
            // Eventuell aktiv ekspirasjon / kamp mot maskinen (A3, A6)
            pmus = -pExp * Math.sin(Math.PI * (tn - tiN) / 0.35);
        } else {
            pmus = 0.0;
        }
```

med:

```javascript
        } else {
            // Eksponentiell muskelrelaksasjon (tau ~0.25 s). Erstatter et sprang
            // fra full kraft til null, som forplantet seg som en kunstig
            // trykkspike i P_aw på hvert pust.
            const relax = pMax * Math.exp(-(tn - tiN) / 0.25);

            // Aktiv ekspirasjon varer gjennom hele den nevrale ekspirasjonen,
            // ikke bare 0.35 s. Med det gamle faste vinduet var pasientens
            // utpustinnsats over lenge før maskinen slapp innpustet ved sen
            // avslutning, så «kamp mot maskinen» kunne ikke oppstå.
            let expPart = 0.0;
            if (pExp > 0) {
                const teN = Math.max(0.3, this.currentCycleDuration - tiN);
                const dtn = tn - tiN;
                if (dtn < teN) {
                    expPart = -pExp
                        * Math.min(1.0, dtn / 0.15)        // rampe opp
                        * Math.min(1.0, (teN - dtn) / 0.20); // slipp mot slutten
                }
            }

            pmus = relax + expPart;
            if (Math.abs(pmus) < 0.01) pmus = 0.0;
        }
```

Merk at `this.currentCycleDuration` kan være `Infinity` når `rrSpont <= 0`. Den grenen returnerer tidlig i `step()`, så koden over nås ikke da — men verifiser at det fortsatt er tilfelle.

---

## Endring B — Fysisk kretsimpedans i stedet for `starvationScale`

**Problem.** Dagens kode ganger blåserens utgangsimpedans med opptil 9,5 når stigetiden er lang og pasienten puster:

```javascript
const riseFactor = (this.state.phase === 'inspiration')
    ? Math.max(0, (this.settings.riseTime - 0.15) / 0.75) : 0;
const starvationScale = 1.0 + 8.5 * riseFactor * (this.state.P_mus > 0 ? Math.min(1.0, this.state.P_mus / 2.0) : 0);
const R_out_eff = this.machine.R_out * starvationScale;
```

Fire dokumenterte problemer:

1. **Diskontinuitet.** I det `P_mus` treffer 0, faller `starvationScale` fra 8,37 til 1,0 i ett tidssteg. Målt: masketrykket hopper fra 8,12 til 13,42 cmH₂O på 0,2 ms.
2. **Gatet på en UI-slider.** Terskelen `riseTime > 0.15` betyr at flow starvation aldri kan oppstå ved kort stigetid. Klinisk er det motsatt: starvation oppstår når etterspørselen overgår leveransen, uavhengig av stigetid.
3. **Metter ved Pmus = 2.** `Math.min(1.0, P_mus / 2.0)` gjør at Pmus 2 og Pmus 15 gir identisk effekt.
4. **Ikke fysikk.** Under mesteparten av innpustet i det treg-stigetid-scenariet lå masketrykket på 6–8 cmH₂O mens maskinen hadde måltrykk 13–14 og leverte 42 L/min. Det tilsvarer å suge gjennom en hageslange.

**Endring, del 1.** I `VentilatorSimulator`-konstruktøren, `this.machine`:

```javascript
        this.machine = {
            R_out: 2.2,   // cmH2O/(L/s) - laminært ledd i krets + maske
            K_out: 1.6,   // cmH2O/(L/s)^2 - turbulent (Rohrer) ledd
            R_valve: 2.0, // cmH2O/(L/s) - Ekspirasjonsventilens motstand i NIV-kretsen (A6)
            Qmax: 3.0     // L/s (~180 L/min) - Maksimal flowkapasitet for NIV-blåser
        };
```

Verdiene er kalibrert mot klinisk referanse for en NIV-krets (22 mm slange + maske + ekspirasjonsport): trykkfall 3,8 cmH₂O ved 60 L/min og 10,8 cmH₂O ved 120 L/min.

**Endring, del 2.** I `_singleStep()`, rundt linje 831–839. Erstatt hele blokken fra kommentaren «Fysiologisk/pneumatisk ventilregulering under stigetid» til og med `const R_out_eff = ...` med:

```javascript
        // Kretsimpedans etter Rohrer: laminært pluss turbulent ledd.
        // Trykkfallet mot masken er R_out_eff * flow. Det er dette fallet som
        // gir flow starvation og skallopering når pasientens etterspørsel
        // overgår leveransen — fenomenet faller ut av fysikken selv og trenger
        // ingen egen stigetidsavhengig faktor.
        const R_out_eff = this.machine.R_out + this.machine.K_out * Math.abs(this.state.Q_total);
```

`this.state.Q_total` er forrige tidssteg. Ved 0,2 ms tidssteg er lagget uten praktisk betydning, og det unngår sirkelavhengighet på samme måte som `isInspDirection` over.

---

## Endring C — Lastkompensasjon i trykkregulatoren

**Problem.** Regulatoren er ren foroverkobling: `P_servo` styres mot `P_target` og måler aldri masketrykket. Etter endring B blir trykkfallet over kretsen større, og da ligger platået under innstilt IPAP så snart flowen er høy. Verst ved lekkasje: med 45 L/min lekkasje nådde masketrykket bare 10,5 cmH₂O av innstilte 13.

Virkelige NIV-blåsere måler kretstrykket og hever utgangstrykket til målet nås — det er nettopp derfor de har så stor flowkapasitet.

**Endring.** I `_singleStep()`, «Steg 2 — Regulatoren P_servo». Etter de to linjene som integrerer servoen:

```javascript
        this.state.dP_servo += accel * dt;
        this.state.P_servo  += this.state.dP_servo * dt;
```

legg til:

```javascript
        // Lastkompensasjon. Blåseren måler masketrykket og hever utgangstrykket
        // til referansebanen P_servo nås. Integratoren ser BARE avviket mot
        // referansebanen, ikke selve stigetidsrampen — ellers vinder den opp ved
        // lang stigetid. (Testet: integrator på P_target gav P_aw 32,8 cmH2O ved
        // innstilt 18.) Ki er lav nok til at den tidlige inspiratoriske
        // innsynkningen bevares, høy nok til at platået treffer innstilt trykk
        // også ved stor lekkasje.
        const Ki = 5.0; // 1/s
        const errLoad = this.state.P_servo - this.state.P_aw;
        this.state.I_servo = clamp((this.state.I_servo || 0) + Ki * errLoad * dt, 0, 20);
        const P_out = this.state.P_servo + this.state.I_servo;
```

`clamp` er alt definert like over i samme funksjon.

Bytt deretter `P_servo` til `P_out` i **kun én** linje, i «Steg 3 — Masketrykket P_aw»:

```javascript
        const num = P_out - R_out_eff * (this.state.P_mus - P_el) / R_eff;
```

Ikke endre andre forekomster av `P_servo`. Kurven som eventuelt tegnes og alle andre beregninger skal fortsatt bruke `P_servo`.

**Registrer den nye tilstandsvariabelen på to steder:**

I `this.state`-objektet i konstruktøren, rett etter linjen for `dP_servo` (linje ~228):

```javascript
            I_servo: 0.0,                 // cmH2O - lastkompensasjon i trykkregulatoren
```

I `reset()`, rett etter `this.state.dP_servo = 0.0;` (linje ~411):

```javascript
        this.state.I_servo = 0.0;
```

**Kalibrering til kontroll.** Etter endringen skal platåtrykket ved innstilt IPAP 15 (passiv pasient, PC-modus, Ti 1,5 s, C 60) ligge på 15,0–15,1 for R mellom 2 og 25, og på 14,6 av innstilte 14 ved 45 L/min lekkasje.

---

## Endring D — Dobbelttrigger telles én gang

**Problem, to deler.** I dagens kode, rundt linje 696:

```javascript
if (this.state.breathCount > 0 && (isSecondaryInEffort || this.state.timeInPhase < 0.50)) {
    triggerType = 'double';
    this.state.efforts.push({ t: this.state.totalTime, detected: true, type: 'double' });
} else {
```

1. Det pushes en **ny** innsatspost, samtidig som den eksisterende posten merkes `'double'` noen linjer nedenfor. Samme fysiologiske innsats telles derfor to ganger i asynkroni-indeksen. Målt i dagens versjon: 38 «double»-hendelser fra 14 nevrale innsatser på 60 sekunder.
2. Kriteriet `this.state.timeInPhase < 0.50` merker **enhver** trigging innen 500 ms etter forrige avslutning som dobbelttrigger — også en helt legitim ny nevral innsats. Ved frekvenser over 25/min feilmerker det normale pust.

**Endring.** Erstatt de fem linjene over med:

```javascript
                            if (this.state.breathCount > 0 && isSecondaryInEffort) {
                                // Samme nevrale innsats har alt utløst et pust — dette er
                                // en ekte dobbelttrigger. Ingen ny innsatspost pushes;
                                // den eksisterende merkes 'double' nedenfor, slik at
                                // hendelsen telles én gang.
                                triggerType = 'double';
                            } else {
```

Resten av blokken, inkludert `this.patientDrive.currentEffort.type = triggerType;`, står urørt.

---

## Endring E — Kardiogent artefakt telles bare én gang

**Problem.** `Q_cardiac` legges inn i `this.state.Q_meas` lenger opp i funksjonen, og deretter én gang til i visningslinjen. Amplituden på hjerteoscillasjonen i flowkurven blir dermed dobbelt så stor som slideren viser. Alle dagens scenarier har `cardiac: 0`, så det er usynlig nå — men flere av de nye scenariene bruker artefaktet.

**Endring.** Rundt linje 893. Erstatt:

```javascript
        this.state.flow = (this.state.Q_meas + (this.state.phase === 'expiration' ? Q_cardiac : 0)) * 60; // L/min (maskinmålt kurve)
```

med:

```javascript
        this.state.flow = this.state.Q_meas * 60; // L/min (Q_cardiac ligger allerede i Q_meas)
```

La linjen under, for `flow_lung`, stå som den er. `Q_lunge` inneholder ikke `Q_cardiac`, så der er tillegget riktig.

---

## Akseptansekriterier

Filen laster uten syntaksfeil:

```bash
node -e "global.window={};eval(require('fs').readFileSync('simulator.js','utf8'));console.log('OK')"
```

Skriv et lite skript som kjører motoren utenfor nettleseren og verifiser:

- [ ] **Platånøyaktighet.** Passiv pasient, PC-modus, IPAP 15 / EPAP 5, Ti 1,5 s, C 60. Masketrykket etter 1,35 s inspirasjon skal ligge mellom 14,9 og 15,2 for R = 2, 5, 10, 18 og 25.
- [ ] **Lekkasjetoleranse.** Samme oppsett med IPAP 14 og `leak: 45`. Platået skal ligge over 14,3. (Før endring C: 10,5.)
- [ ] **Ingen sprang i P_mus.** Logg `P_mus` gjennom ett pust. Den største endringen mellom to nabosteg skal være under 0,05 cmH₂O. (Før endring A: 5,0.)
- [ ] **Ingen sprang i P_aw.** Samme test på `P_aw`. Den største endringen mellom to nabosteg skal være under 0,3 cmH₂O ved ellers rolige innstillinger. (Før: 5,3 i det treg-stigetid-scenariet.)
- [ ] **Flow starvation finnes ved alle stigetider.** Pasient med C 32, R 6, Pmus 15, nevral Ti 0,55, IPAP 18 / EPAP 6. Det største avviket `P_servo - P_aw` under inspirasjon skal være over 2,5 cmH₂O både ved stigetid 150 ms og ved 750 ms. (Før: 0 ved 150 ms.)
- [ ] **Trykkutslag ved pasientinnsats.** Pasient med C 55, R 6. Med Pmus 8 skal masketrykket falle minst 1,2 cmH₂O under EPAP før trigging. (Før: 0,5.)
- [ ] **Dobbelttrigger telles én gang.** Pasient med C 26, R 6, Pmus 13, nevral Ti 1,35, drive 28/min, avslutning 50 %, IPAP 13 / EPAP 6. Antall `'double'`-hendelser i `state.efforts` over 60 s skal ligge mellom 4 og 12, og summen av alle innsatshendelser skal ikke overstige antall nevrale sykluser med mer enn antall dobbelttriggere.
- [ ] `git diff --stat` viser endringer **bare** i `simulator.js`.

Hvis platåtestene feiler etter endring C: sjekk at `P_out` bare er brukt i `num`-linjen, og at `I_servo` faktisk nullstilles i `reset()`.
