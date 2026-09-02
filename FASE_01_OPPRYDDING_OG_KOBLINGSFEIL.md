# FASE 1 — Opprydding og koblingsfeil

Du jobber i en NIV-ventilatorsimulator bygget i vanilla HTML5/CSS/JavaScript. Filene er `index.html`, `style.css`, `simulator.js` (fysikkmotor), `renderer.js` (canvas-tegning) og `app.js` (UI-kobling).

Denne fasen retter fire koblingsfeil der UI og kode ikke snakker sammen. **Ingen fysikk skal endres.** `simulator.js` skal ikke røres i det hele tatt.

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
git tag før-fase-1
git checkout -b fase-1-opprydding
```

Ikke merge til hovedgrenen. Det gjøres manuelt etter at akseptansekriteriene nederst er kjørt.

### Filer

Du får endre: `index.html`, `app.js`, `.gitignore`, og flytte mappen `scratch/`.

Du skal **ikke** røre: `simulator.js`, `renderer.js`, `style.css`, `test_validering.js`.

### Feller i denne fasen

- **Gjør oppgave 1.1 aller først.** Mappen `scratch/` inneholder seks nesten identiske kopier av fysikkmotoren. Før den er arkivert vil et hvilket som helst søk i kodebasen treffe i flere filer samtidig, og du risikerer å lese eller endre feil fil.
- **Ikke kjør `test_validering.js`.** Testbatteriet har toleranser tilpasset fysikk som endres i en senere fase. Testresultater er ikke gyldig informasjon i denne fasen.
- Å sette `.value` på en `input type="range"` programmatisk utløser **ikke** `input`- eller `change`-hendelser. `applyScenario` kaller `updateSimulatorFromUI()` eksplisitt til slutt; behold det.


## Oppgave 1.1 — Arkiver `scratch/`-mappen

Mappen `scratch/` inneholder 34 filer, blant dem seks nesten identiske kopier av fysikkmotoren (`simulator_dynamic.js`, `simulator_tuned.js`, `simulator_complete.js`, `simulator_linear_pmus.js`, `simulator_modified.js`). De er eksperimenter som ikke er i bruk, og de gjør at søk i kodebasen treffer i feil fil.

Flytt hele mappen til `arkiv/scratch/` og legg `arkiv/` i `.gitignore`. Ikke slett noe.

Verifiser etterpå at ingenting i `index.html` refererer til noe under `scratch/`.

---

## Oppgave 1.2 — Legg inn lekkasje-slideren

`app.js` linje ~117 leter etter `document.getElementById('sliderLeak')`. Elementet finnes ikke i `index.html`. Konsekvensen er at `app.js` linje ~992 alltid faller tilbake til `leak = 0`, så maskelekkasje er permanent avslått i hele applikasjonen — inkludert scenariet som handler om lekkasje.

Legg inn et nytt kontrollkort i `index.html`, i samme fane og med samme struktur som kortet for `sliderTrigger`. Bruk `cardLeak` som kort-id, `badgeLeak` for verdivisningen (det oppslaget finnes allerede i `app.js` linje ~152) og trinnknapper på ±5 som de andre kortene har.

```html
<input type="range" id="sliderLeak" min="0" max="60" step="5" value="0">
```

Merking: overskrift «Maskelekkasje», underetikett «Lekkasjeflow ved 10 cmH₂O», enhet `L/min`.

Verifiser at `sliders.leak` ikke lenger er `null`, og at det å dra slideren endrer `simulator.settings.leak`.

---

## Oppgave 1.3 — Legg inn Ti-max-slideren

Samme problem: `app.js` linje ~115 leter etter `sliderTiMax` og linje ~71 etter `cardTiMax`. Ingen av dem finnes. `tiMax` faller derfor alltid tilbake til 2,0 s.

Legg inn kortet i samme fane som `sliderCycling` (Ti-max hører logisk sammen med avslutningsterskelen). Bruk `cardTiMax` som kort-id og `badgeTiMax` for verdivisningen (finnes i `app.js` linje ~150).

```html
<input type="range" id="sliderTiMax" min="0.8" max="3.0" step="0.1" value="2.0">
```

Merking: overskrift «Ti-max (maksimal innpustetid)», underetikett «Sikkerhetsgrense når flow ikke faller under avslutningsterskelen», enhet `s`.

Merk at `app.js` linje ~671 og ~707 allerede håndterer å gråe ut dette kortet i PC-modus. Sjekk at det virker når elementet nå finnes.

---

## Oppgave 1.4 — Koble ST-backup til avkrysningsboksen

NIV-ST backup er hardkodet av på tre steder i `app.js`:

- linje ~976: `const stActive = false;`
- linje ~1011: `simulator.settings.stActive = false;`
- linje ~1254 (i `applyScenario`): `if (checkStActive) checkStActive.checked = false;`

Avkrysningsboksen `checkStActive` finnes i `index.html` og har en `change`-lytter, men lytteren kaller `updateSimulatorFromUI()`, som overskriver verdien med `false` igjen. Boksen gjør altså ingenting, og scenariet om redusert respirasjonsdrive kan ikke fungere.

Endre til:

```javascript
// linje ~976
const stActive = checkStActive ? checkStActive.checked : false;

// linje ~1011
simulator.settings.stActive = stActive;

// linje ~1254, i applyScenario
if (checkStActive) checkStActive.checked = !!scen.stActive;
```

Verifiser: kryss av boksen, sett `sliderRrSpont` til 0, og sjekk at maskinen leverer pust med den innstilte backup-frekvensen og at `% Spont` går til 0.

---

## Oppgave 1.5 — Kjønn i scenarioskjemaet

Idealvekt (IBW) beregnes med Devine-formelen, som er kjønnsavhengig, og `Vt/kg IBW` er en av de sentrale måleverdiene. I dag settes kjønn bare av en UI-bryter (`currentGender` i `app.js`), og `applyScenario` rører den ikke. Et scenario med en kvinnelig pasient vil derfor vise mannlig IBW hvis brukeren sist valgte mann.

To deler:

1. La `applyScenario` sette kjønn fra scenariodefinisjonen. Finn funksjonen som håndterer kjønnsbryteren (rundt linje 949–955) og kall den, slik at både `currentGender` og knappens aktive tilstand oppdateres:

```javascript
// i applyScenario, ved de andre sliderne
setGender(scen.gender || 'male');
```

Hvis det ikke finnes en samlet `setGender`-funksjon, lag en av koden som ligger i klikkhåndtererne, og la både klikkhåndtererne og `applyScenario` bruke den. Dette er den ene refaktoreringen som er tillatt i denne fasen.

2. Feltet `gender` finnes ikke i dagens `SCENARIOS`-objekt. Legg til `gender: 'male'` i alle elleve scenariodefinisjoner nå, som en plassholder. Fase 5 bytter ut hele objektet med riktige verdier.

---

## Oppgave 1.6 — Stegvalidering i utviklingsmodus

Dette er årsaken til en av de mest lumske feilene i dagens versjon. HTML-standarden pålegger nettleseren å runde en slider-verdi som ikke treffer et gyldig `step` til nærmeste gyldige verdi. Et scenario som setter `pmus: 0.75` på en slider med `step="0.5"` får faktisk `1.0` — og `updateSimulatorFromUI()` leser tilbake fra slideren, så simulatoren kjører med den avrundede verdien. Verifisert i Chromium.

Legg til en sjekk på slutten av `applyScenario` som fanger dette automatisk i framtiden:

```javascript
// Utviklingssjekk: fang scenarioverdier som ikke treffer slidernes step.
// Nettleseren runder dem stille, og simulatoren kjører da med en annen
// verdi enn scenariet er definert med.
const STEG_SJEKK = {
    ipap: 'ipap', epap: 'epap', rr: 'rr', riseTime: 'riseTime',
    cycling: 'cycling', tiMax: 'tiMax', tiSet: 'tiSet', leak: 'leak',
    backupRate: 'backupRate', compliance: 'compliance', resistance: 'resistance',
    expRatio: 'expRatio', flowLimitation: 'flowLimitation', rrSpont: 'rrSpont',
    pmus: 'pmus', tiNeural: 'tiNeural', pmusExp: 'pmusExp',
    variability: 'variability', height: 'height'
};
Object.entries(STEG_SJEKK).forEach(([scenKey, sliderKey]) => {
    const el = sliders[sliderKey];
    if (!el || scen[scenKey] === undefined) return;
    if (parseFloat(el.value) !== parseFloat(scen[scenKey])) {
        console.warn(
            `[Scenario "${scenarioKey}"] ${scenKey}: definert ${scen[scenKey]}, ` +
            `slideren ble ${el.value} (min ${el.min}, max ${el.max}, step ${el.step})`
        );
    }
});
```

Plasser den **etter** at alle slider-verdier er satt, men **før** kallet til `updateSimulatorFromUI()`.

Merk at `cardiacArtifact` og `trigger` har egne navn i `sliders`-objektet (`cardiac` → `cardiacArtifact`, `triggerVal` → `trigger`). Legg dem inn med riktig kobling.

Verifiser: klikk gjennom alle elleve scenarioknappene med konsollen åpen. I dag skal du få minst én advarsel — `slowTrigger` med `pmus: 0.75`. Den blir rettet i fase 5.

---

## Akseptansekriterier

Kjør gjennom disse selv før du merger:

- [ ] `arkiv/scratch/` finnes, `scratch/` er borte, `arkiv/` står i `.gitignore`
- [ ] Lekkasje-slideren finnes, går 0–60 i steg på 5, og `badgeLeak` viser verdien
- [ ] Å dra lekkasje-slideren til 45 gir tydelig forskjøvet nullinje i flowkurven og en volumkurve som ikke returnerer til null
- [ ] Ti-max-slideren finnes, går 0,8–3,0 i steg på 0,1, og gråes ut i PC-modus
- [ ] Avkrysningsboksen for ST-backup virker: med `rrSpont = 0` og boksen avkrysset leverer maskinen pust på backup-frekvensen
- [ ] Med boksen *ikke* avkrysset og `rrSpont = 0` utløses apné-alarm etter innstilt forsinkelse
- [ ] Alle elleve scenarioknapper fungerer fortsatt uten JavaScript-feil i konsollen
- [ ] Konsollen viser stegadvarsel for `slowTrigger`
- [ ] `simulator.js` er uendret (`git diff --stat simulator.js` skal være tom)
