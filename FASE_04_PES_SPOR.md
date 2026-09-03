# FASE 4 — Fjerde kurvespor (P_es / P_mus)

Du jobber i en NIV-ventilatorsimulator. `renderer.js` tegner tre kurvespor i et HTML5-canvas: luftveistrykk, flow og volum. Denne fasen legger til et fjerde, valgfritt spor for pasientens muskelinnsats.

Forutsetter at fase 1–3 er ferdige.

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
git tag før-fase-4
git checkout -b fase-4-pes-spor
```

Ikke merge til hovedgrenen. Det gjøres manuelt etter at akseptansekriteriene nederst er kjørt.

### Filer

Du får endre: `renderer.js`, `index.html`, `style.css`, og legge til **én** hendelseslytter i `app.js`.

Du skal ikke røre `simulator.js`, scenariedefinisjonene eller noen testfil.

### Feller i denne fasen

- **`numTracks = 3` er ikke det eneste stedet antallet spor er antatt.** Søk gjennom `renderer.js` på `trackHeight`, på divisjon med 3, og på hardkodede spor-id-er, og rett alle. Feil her gir kurver tegnet i feil spor.
- **Ikke snu fortegnet på P_es.** `frameSample.pesLast` er allerede `-state.pmus`, altså klinisk konvensjon der inspiratorisk innsats gir et fall. Bruk `pesMin`/`pesMax`/`pesLast` som de er.
- Bufferbredder og sporhøyder må reallokeres når bryteren slås av eller på. Finn metoden i `renderer.js` som faktisk gjør dette — ikke antatt navn — og kall den.
- **Med bryteren av skal monitoren se identisk ut som før fasen.** Ta skjermbilde før du begynner, og sammenlign.
- Ikke kjør testbatteriet; det rekalibreres i fase 6.


## Hvorfor

`README.md` beskriver dette sporet som en eksisterende funksjon — «Muskelinnsats (P_es / P_mus), magenta, valgfritt 4. spor». Det finnes ikke. `simulator.frameSample` samler allerede `pesMin`, `pesMax` og `pesLast` hvert bilde, og `simulator.state.pmus` er tilgjengelig, men ingenting tegnes og det er ingen bryter i `index.html`.

Sporet er pedagogisk nødvendig for scenariet om mislykkede innsatser. Der er utslaget på trykkurven under 0,1 cmH₂O og på flowkurven rundt 4 L/min — nesten usynlig. Det er nettopp derfor mislykkede innsatser overses klinisk, og nettopp derfor øsofagustrykk er verktøyet man bruker. Uten dette sporet mangler scenariet sitt viktigste virkemiddel.

## Fortegnskonvensjon

Klinisk vises øsofagustrykk (P_es) slik at en inspiratorisk innsats gir et **fall** i kurven — pasienten skaper undertrykk. Simulatorens `P_mus` har motsatt fortegn: positiv verdi betyr inspiratorisk kraft.

`frameSample` gjør alt konverteringen: `pesLast = -this.state.pmus`. Bruk `pesMin`/`pesMax`/`pesLast` som de er, og merk sporet «P_es». Ikke snu fortegnet en gang til.


## Oppgave 4.1 — Databuffer for sporet

I `renderer.js`-konstruktøren finnes buffere som `this.pressureData`, `this.flowData`, `this.volumeData`, `this.flowLungData`, `this.volumeLungData`. Legg til:

```javascript
        this.pesData = [];
```

I metoden som allokerer buffere (`new Array(this.activeWidth).fill(null)` rundt linje 216), gjør det samme for `this.pesData`.

I `addSample()` hentes prøver ut av `sampleOrPaw` rundt linje 372. Legg til:

```javascript
            pesSample = { min: sampleOrPaw.pesMin, max: sampleOrPaw.pesMax, last: sampleOrPaw.pesLast };
```

og skriv den til bufferet ved siden av de andre, rundt linje 426:

```javascript
            if (pesSample) writeToBuffer(this.pesData, x, pesSample);
```

Husk også å nullstille `this.pesData[clearIdx] = null;` der de andre bufferne nullstilles (rundt linje 405).

---

## Oppgave 4.2 — Sporlayout for tre eller fire spor

Rundt linje 469 er antall spor hardkodet:

```javascript
        const numTracks = 3;
        const trackHeight = h / numTracks;

        const tracks = [
            { id: 'paw',  label: 'Paw',  unit: 'cmH₂O', color: this.colors.pressure, top: 0,               height: trackHeight },
            { id: 'flow', label: 'Flow', unit: 'L/min', color: this.colors.flow,     top: trackHeight,     height: trackHeight },
            { id: 'vol',  label: 'V',    unit: 'ml',    color: this.colors.volume,   top: trackHeight * 2, height: trackHeight }
        ];
```

Gjør antallet avhengig av en ny flagg-egenskap:

```javascript
        const numTracks = this.showPesTrack ? 4 : 3;
        const trackHeight = h / numTracks;

        const tracks = [
            { id: 'paw',  label: 'Paw',  unit: 'cmH₂O', color: this.colors.pressure, top: 0,               height: trackHeight },
            { id: 'flow', label: 'Flow', unit: 'L/min', color: this.colors.flow,     top: trackHeight,     height: trackHeight },
            { id: 'vol',  label: 'V',    unit: 'ml',    color: this.colors.volume,   top: trackHeight * 2, height: trackHeight }
        ];
        if (this.showPesTrack) {
            tracks.push({ id: 'pes', label: 'P_es', unit: 'cmH₂O', color: this.colors.pes, top: trackHeight * 3, height: trackHeight });
        }
```

Sett `this.showPesTrack = false;` i konstruktøren, ved siden av `this.showTrueCurves`.

Legg til fargen i `this.colors`:

```javascript
            pes: '#d946ef',        // magenta - muskelinnsats / oesofagustrykk
            pesFill: 'rgba(217, 70, 239, 0.12)',
```

Sjekk om det finnes andre steder i filen der `numTracks` eller `trackHeight` antas å være 3 — søk på `trackHeight` og på `/ 3` i layoutberegninger, og rett dem så de bruker den beregnede verdien.

---

## Oppgave 4.3 — Skala og tegning

P_es-sporet skal ha nullinje i midten, som flowsporet, fordi verdien går både positiv og negativ (inspiratorisk innsats gir negativ P_es, aktiv utpust gir positiv).

Legg til faste og dynamiske skalaer ved siden av de andre:

```javascript
        // i this.fixedScales
        pesMin: -10,
        pesMax: 10,

        // i this.dynamicScales
        pesMax: 10,
        pesMin: -10,

        // i this.scaleTiers
        pes: [10, 15, 20, 25, 30, 40],
```

Autoskaleringen for flow ligger rundt linje 305 og bruker `_findTargetTier`. Lag et tilsvarende avsnitt for `pes` med minimumsnivå 10, og en `scaleHold.pes` som de andre.

Skriv en `_renderPesTrack(ctx, track, ...)` etter mønsteret fra flowsporets renderer (`_renderFlowTrack` eller tilsvarende rundt linje 987). Gjenbruk `_renderFlowEnvelopeWithArea` eller `_renderEnvelopeWaveform` — velg den som gir nullinje i midten, slik flowsporet har.

Kall den fra hovedtegneløkken bare når sporet finnes:

```javascript
            } else if (track.id === 'pes') {
                this._renderPesTrack(ctx, track, ...);
            }
```

Kursoren i frysemodus leser av verdier fra alle spor (rundt linje 544–551 og 783–1037). Legg til `pes` der, med `this.pesData` og riktig skala, slik at frysemodus også viser P_es-verdien.

---

## Oppgave 4.4 — Bryter i grensesnittet

I `index.html`, ved siden av den eksisterende avkrysningsboksen for sanne kurver (`checkShowTrueCurves`), legg til:

```html
<label>
    <input type="checkbox" id="checkShowPes">
    <span>Vis P<sub>es</sub> / muskelinnsats (4. spor)</span>
</label>
```

I `app.js`, ved siden av lytteren for `checkShowTrueCurves` (rundt linje 723):

```javascript
    const checkShowPes = document.getElementById('checkShowPes');
    if (checkShowPes) {
        checkShowPes.addEventListener('change', () => {
            renderer.showPesTrack = checkShowPes.checked;
            renderer.resize();   // sporlayouten må regnes om
        });
    }
```

Bruk navnet på den metoden som faktisk regner om canvas-størrelse og buffere i `renderer.js` — sjekk hva den heter før du skriver kallet. Poenget er at bufferbredden og sporhøydene må reallokeres når antall spor endres, ellers blir kurvene tegnet på feil sted.

---

## Oppgave 4.5 — Bevar dagens utseende

Med bryteren av skal monitoren se **identisk** ut som før denne fasen. Tre spor, samme høyder, samme skalaer. Verifiser dette ved å ta et skjermbilde før og etter og sammenligne.

---

## Akseptansekriterier

- [ ] Med bryteren av er monitoren pikselidentisk med før fasen
- [ ] Med bryteren på deles canvas i fire like høye spor, og P_es tegnes nederst i magenta
- [ ] En inspiratorisk pasientinnsats gir et **fall** i P_es-kurven
- [ ] Med `pmusExp > 0` gir aktiv utpust en positiv utsving i P_es
- [ ] Sett C 25, Pmus 1,5, nevral Ti 0,55, drive 26, trigger 5,0. Mislykkede innsatser skal være **klart** synlige på P_es-sporet, mens de knapt synes på trykk og flow. Det er hele hensikten med sporet.
- [ ] Autoskaleringen tilpasser seg: med Pmus 15 skal skalaen utvide seg forbi 10
- [ ] Frysemodus og kursor viser P_es-verdi
- [ ] Å slå bryteren av og på gjentatte ganger gir ikke feiltegnede kurver eller feil i konsollen
- [ ] Skjermbildeeksporten («Kopier bilde») får med det fjerde sporet
