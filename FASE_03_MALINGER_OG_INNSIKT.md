# FASE 3 — Målinger og innsiktsboks

Du jobber i en NIV-ventilatorsimulator. Denne fasen retter tre steder der tallene som vises til brukeren ikke stemmer med det motoren faktisk gjør.

Forutsetter at fase 1 og 2 er ferdige og merget.

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
git tag før-fase-3
git checkout -b fase-3-malinger
```

Ikke merge til hovedgrenen. Det gjøres manuelt etter at akseptansekriteriene nederst er kjørt.

### Filer

Du får endre: `simulator.js` og `app.js`.

Du skal ikke røre `renderer.js`, `index.html`, scenariedefinisjonene (`SCENARIOS`-objektet) eller noen testfil.

### Feller i denne fasen

- **Ikke kjør `test_validering.js`.** Den rekalibreres i fase 6 og vil feile til da.
- `Q_leak_turb` skal etter oppgave 3.3 finnes **én gang** i funksjonen. Den lokale deklarasjonen inne i ekspirasjonsgrenen skal fjernes, ikke bare suppleres — ellers skygger den nye for den gamle og oppførselen blir uforutsigbar.
- Ikke endre `SCENARIOS`. At innsiktsboksens tall i dag motsier monitoren skyldes formlene, ikke scenarioverdiene.

### Røyktest av `simulator.js`

Kjør denne etter hver endring i motoren. Den skal skrive `OK`:

```bash
node -e "global.window={};eval(require('fs').readFileSync('simulator.js','utf8'));console.log('OK')"
```


## Oppgave 3.1 — Rett «teoretisk Vt» i innsiktsboksen

I `simulator.js`, metoden `getPhysiologicalInsights()`, rundt linje 1202:

```javascript
const theoreticalVt = Math.round(C * drivingPressure);
```

Formelen `C × ΔP` ignorerer pasientens eget muskelarbeid, som ofte bidrar med halvparten av volumet. Målte avvik mot det monitoren viser:

| Scenario | Boksen sier | Monitoren viser |
|---|---|---|
| Godt tilpasset | 270 ml | 493 ml |
| KOLS med auto-PEEP | 630 ml | 298 ml |
| KOLS behandlet | 840 ml | 489 ml |

Studenten ser altså et tall som motsier monitoren, i begge retninger.

**Endring.** Behold `theoreticalVt` som en ren maskinbidrag-størrelse, men gjør det tydelig hva den er, og legg til et estimat som tar med muskelarbeidet og auto-PEEP:

```javascript
// Maskinens bidrag alene, ved fullstendig fylling og passiv pasient
const machineVt = Math.round(C * Math.max(0, drivingPressure - peepi));
// Pasientens eget bidrag ved gjeldende muskelkraft
const patientVt = Math.round(C * this.patientDrive.pmusMax);
const theoreticalVt = machineVt + patientVt;
```

`peepi` er alt beregnet lenger opp i samme funksjon. Merk at `Math.max(0, ...)` er nødvendig: ved auto-PEEP høyere enn drivtrykket er maskinens bidrag null.

I `app.js`, der `insightTheoVt` fylles ut, endre etiketten fra «Teoretisk Vt» til «Forventet Vt (maskin + pasient)» og vis oppdelingen. Finn feltet og legg inn en `title`-attributt eller en liten undertekst som viser `machineVt` og `patientVt` hver for seg — det er nettopp den oppdelingen som er pedagogisk verdifull. Returner begge fra `getPhysiologicalInsights()`.

---

## Oppgave 3.2 — Rett «pasientgenerert flow»

Samme funksjon, rundt linje 1207:

```javascript
const patientGeneratedFlow = parseFloat(((pmus / R_insp) * 60).toFixed(1));
```

Dette er den viktigste feilen i innsiktsboksen, fordi det er nettopp dette tallet en student bruker for å vurdere om triggerterskelen er riktig satt.

`Pmus / R` gjelder bare for en muskelinnsats som holdes lenge nok til å nå likevekt. En pasientinnsats er en rampe over noen få hundre millisekunder, og lungevolumet bygger opp elastisk mottrykk underveis. For en rampe som er kortere enn tidskonstanten er topp-flowen omtrent `C × dPmus/dt`.

Målte avvik:

| Scenario | Boksen sier | Faktisk topp-Q_meas |
|---|---|---|
| For ufølsom trigger | 9,0 L/min | **4,05 L/min** |
| Godt tilpasset | 60 L/min | vesentlig lavere |

**Endring.** Erstatt formelen med den faktisk målte verdien. Motoren kjenner den allerede — den trengs bare å spores.

I `simulator.js`, legg til et felt i `this.state`:

```javascript
            peakTriggerFlow: 0.0,         // L/s - største Q_meas under ekspirasjon før trigging
```

Nullstill det i `reset()` og i `_startExpiration()`. I `_singleStep()`, i grenen for `this.state.phase === 'expiration'`, etter at `Q_meas` er beregnet:

```javascript
            if (Q_meas > this.state.peakTriggerFlow) {
                this.state.peakTriggerFlow = Q_meas;
            }
```

Bruk deretter i `getPhysiologicalInsights()`:

```javascript
// Faktisk målt topp-flow pasienten klarer å skape før trigging.
// Denne er compliance- og rampebegrenset, ikke Pmus/R.
const patientGeneratedFlow = parseFloat((this.state.peakTriggerFlow * 60).toFixed(1));
```

Behold navnet `patientGeneratedFlow` i returobjektet, slik at `app.js` ikke må endres.

I tillegg: i regel 4 i samme funksjon står det en tekst om at årsaken til mislykkede innsatser er «for høy triggerterskel eller svak pasientkraft». Utvid den til å nevne compliance, siden det er det tredje leddet:

> «Skyldes at pasientens innsats (målt topp-flow X L/min) ikke overstiger triggerterskelen (Y L/min). Flowen en innsats kan skape avhenger av både muskelkraft og lungenes ettergivelighet.»

---

## Oppgave 3.3 — Lekkasjeturbulensen må vises i flowkurven

I `simulator.js` rundt linje 634 beregnes en turbulenskomponent som brukes til å utløse autotrigging:

```javascript
            const Q_leak_turb = (this.settings.leak > 0)
                ? (this.settings.leak / 60) * 0.035 * (Math.sin(17.3 * this.state.totalTime) + Math.cos(29.7 * this.state.totalTime))
                : 0.0;

            const Q_meas = this.state.Q_total - this.state.Q_leak_estimert + Q_cardiac + Q_leak_turb;
            this.state.Q_meas = Q_meas;
```

Men lenger ned i samme funksjon regnes `Q_meas` om på nytt, **uten** turbulensleddet:

```javascript
        if (this.state.phase === 'expiration') {
            this.state.Q_meas = Q_total - this.state.Q_leak_estimert + Q_cardiac;
        } else {
            this.state.Q_meas = Q_total - this.state.Q_leak_estimert;
        }
```

Konsekvensen er at turbulensen utløser triggere som ikke har noen synlig årsak i flowkurven. Det er stikk i strid med poenget i autotriggingsscenariet, der studenten skal *se* svingningene som lurer maskinen.

**Endring.** Flytt beregningen av `Q_leak_turb` ut av ekspirasjonsgrenen og opp til der `Q_cardiac` beregnes, så den er tilgjengelig i hele funksjonen. Ta den deretter med i omregningen:

```javascript
        if (this.state.phase === 'expiration') {
            this.state.Q_meas = Q_total - this.state.Q_leak_estimert + Q_cardiac + Q_leak_turb;
        } else {
            this.state.Q_meas = Q_total - this.state.Q_leak_estimert;
        }
```

Fjern samtidig den lokale `const Q_leak_turb`-deklarasjonen inne i ekspirasjonsgrenen, slik at det bare finnes én.

Behold at turbulensen bare gjelder i ekspirasjon — under inspirasjon domineres flowen av leveransen, og turbulensen er der uten praktisk betydning.

---

## Akseptansekriterier

- [ ] Med et scenario der pasienten har høy egeninnsats viser innsiktsboksen et forventet Vt som ligger innenfor ±20 % av det monitoren viser under Vt
- [ ] Oppdelingen maskinbidrag / pasientbidrag er synlig i innsiktsboksen
- [ ] Ved auto-PEEP høyere enn drivtrykket blir maskinbidraget 0, ikke negativt
- [ ] «Pasientgenerert flow» i innsiktsboksen er nå den faktisk målte toppflowen. Test: sett trigger til 5,0 L/min, C 25, Pmus 1,5, nevral Ti 0,55. Boksen skal vise rundt 4–5 L/min, ikke 15.
- [ ] Med lekkasje 45 L/min er det synlige, høyfrekvente svingninger på ekspirasjonsdelen av flowkurven
- [ ] Med lekkasje 0 er flowkurven glatt i ekspirasjonen (ingen turbulens lagt til)
- [ ] Ingen JavaScript-feil i konsollen ved gjennomklikk av alle scenarier
