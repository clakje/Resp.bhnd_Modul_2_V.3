# FASE 5 av 7 — Monitoren: se det fysikken alt gjør

## Kontekst

Interaktiv NIV-respiratorsimulator for opplæring av sykepleiere. Ren HTML5, CSS3 og vanilla JavaScript — ingen byggeverktøy, ingen rammeverk, ingen biblioteker.

| Fil | Rolle |
|---|---|
| `index.html` | UI, inkludert `<canvas id="waveformCanvas">` og fanen `Kurveforståelse` |
| `renderer.js` | Canvas-tegning: buffere, sveipelinje, dynamiske akser, trekantmarkører — **det er denne fasen handler om** |
| `simulator.js` | Fysikkmotoren (ferdig, skal ikke endres i denne fasen) |
| `app.js` | Animasjonsloop som kaller `renderer.addSample()` og `renderer.render()` |

**Denne fasen:** endring C7, C8, C9 og D3.

**Alt gjort i fase 1–4 (fysikken er ferdig — ikke rør den):**
- Fysisk trykkmodell med servo, utgangsimpedans og flowbegrensning. Korte hendelser som trykkoversving og terminal-spike varer 20–120 ms
- Fast internt tidssteg 0,2 ms, altså 5000 fysikksteg i sekundet
- `patientDrive` med `P_mus`, og innsatslogg `state.efforts` med typene `assist` / `missed` / `double` / `auto` / `mandatory`
- Tre flowstørrelser: `Q_lunge` (sannhet), `Q_total` (maskinens output), `Q_meas` (maskinens virkelighetsforståelse — den som tegnes)
- Målte verdier inkludert `PEEPi`, `VTI`, `VTE`, asynkroni-indeks

**Kommer senere — IKKE gjør nå:** PC-modus, backup-frekvens, scenarioknapper, frysemodus med kursor (fase 6).

---

## Regler for dette oppdraget

- **Gjør bare det som står i denne filen.** Oppdager du andre feil underveis, ikke fiks dem — list dem opp på slutten av svaret ditt i stedet.
- **Ikke endre `simulator.js`** utover å lese ut tilstand og eventuelt akkumulere min/maks-verdier for C7.
- Behold norsk i all UI-tekst og alle kodekommentarer.
- Ingen nye biblioteker, ingen byggeverktøy, ingen canvas-rammeverk. Behold filstrukturen.
- Ytelseskrav: 60 fps skal holdes med fire spor synlige.

---

## C7 — Monitoren mister korte hendelser

**Alvorlighetsgrad: høy.** `renderer.js` linje 218–279: `addSample()` skriver **én** verdi per piksel, hentet én gang per frame (60 Hz). Fysikken kjører nå 5000 Hz.

En terminal-spike på 30 ms eller et cyclingoversving er da 2 piksler bredt i beste fall — og i verste fall inntreffer den mellom to prøver og forsvinner helt. **Du kan ha en perfekt fysikkmotor og likevel ikke se fenomenene fageksperten etterlyser.** Dette er derfor ikke en visuell forbedring, det er en målefeil i visningen.

### Bestilling

- Endre databufferet fra én verdi per piksel til et **min/maks-konvolutt** per piksel, for trykk, flow og volum.
- Simulatoren (eller `app.js`, hvis du foretrekker å holde `simulator.js` urørt) skal akkumulere `min` og `maks` for hver størrelse gjennom **alle** interne tidssteg som faller på samme piksel, og `addSample()` skal lagre begge.
- Ved tegning: der `maks − min` er større enn 1 piksel, tegn en vertikal strek mellom dem i stedet for bare et punkt. Ellers tegn som i dag.
- Behold også en «siste verdi» per piksel til bruk for kursorvisning i fase 6.
- Dette er standard i medisinsk monitorering og i visning av lydbølgeformer, og det er nødvendig her.

---

## C8 — Sveipetid 15 s skjuler detaljer

`renderer.js` linje 54: `sweepDuration = 15.0`. Fageksperten noterte at referansesimulatoren brukte 10 s. Ved RR 20 gir 15 s fem pust i bredden, og formdetaljene innenfor hvert pust blir smale.

### Bestilling

- Gjør sveipetiden til et brukervalg: tre knapper **6 s / 10 s / 15 s** i header-området, standard **10 s**.
- Ved bytte skal bufferne reinitialiseres rent, uten at kurvene hopper eller etterlater rester.
- Legg til en kort forklaring i `Kurveforståelse`-fanen: 6 s er lupevisningen for kurveform (stigetid, cycling, spiker), 15 s er oversiktsvisningen for mønster over tid (autotrigging, hyperinflasjon, asynkroni). At begge trengs, og til ulike spørsmål, er i seg selv verdt å si til en sykepleier som skal lære å lese en respiratorskjerm.

---

## C9 — Automatisk Y-akseskalering ødelegger sammenligning

`renderer.js` linje 128–215 skalerer alle tre akser dynamisk. Det høres hjelpsomt ut, men betyr at et pust på 350 ml og et på 550 ml kan se **helt like store ut** på skjermen. Fagekspertens tre stigetids-eksempler (350 / 450 / 550 ml) blir dermed umulige å sammenligne visuelt — noe som undergraver hele øvelsen.

### Bestilling

- Innfør faste kliniske skalaer som **standard**: Paw 0–40 cmH₂O, Flow ±120 L/min, Volum 0–800 ml.
- Behold automatisk skalering som valgfri modus, med en av/på-knapp per spor merket «Auto» / «Lås».
- Ved lås: klipp kurven ved aksegrensen og marker klippingen tydelig (f.eks. en liten pil eller fargeendring ved kanten), slik at brukeren ser at verdien er utenfor skalaen i stedet for å tro at kurven flatet ut.

---

## D3 — Pmus/Pes som fjerde kurve

### Hvorfor dette er den viktigste endringen i fasen

Dette er svaret på fagekspertens skarpeste innvending. Om ineffektiv trigger skriver hun at trekanten bare kommer når maskinen registrerer innsats — og at resultatet blir «tilsynelatende en pasient som egentlig ikke puster i det hele tatt». Hun kaller det «litt uheldig», og foreslår at man i så fall må kalle pasientinnsatsen en artefakt.

Oversatt til krav: visningen kan ikke skille *pasienten forsøker ikke* fra *pasienten forsøker, men maskinen ser det ikke*. Klinisk er dette to helt ulike situasjoner med helt ulike tiltak — den første krever backup-ventilasjon, den andre krever justering av trigger eller behandling av auto-PEEP. Å blande dem sammen i undervisning er direkte skadelig.

Klinisk måles pasientens innsats med øsofagustrykk (Pes) — en ballongkateter i spiserøret som viser pleuratrykket. Det er gullstandarden for å diagnostisere asynkroni, og fagekspertens egen referansefigur viser nettopp et Pes-spor under trykk- og flowkurven.

At kurven er invasiv og sjelden i klinikken er ikke et argument mot å ha den i en simulator — det er argumentet **for**. Simulatoren kan vise den skjulte sannheten som forklarer hvorfor de to synlige kurvene ser rare ut. Det er en pedagogisk mulighet et virkelig sengeleie ikke gir.

### Bestilling

- Legg til et fjerde spor i `renderer.js`, plassert nederst, med av/på-knapp. **Standard: på.**
- Vis `-P_mus` (pleuratrykk-konvensjon: innsats peker nedover, som i alle lærebokfigurer). Merk sporet `Pes / Pmus (cmH₂O)`.
- Bruk en tydelig annen farge enn de tre andre. Lilla/magenta (`#d946ef`) passer, siden trekantmarkørene alt bruker den fargen for pasientinnsats — da knyttes markør og kurve sammen visuelt.
- Endre `trackHeight` fra `h / 3` til `h / antallSynligeSpor`, slik at layouten tåler både tre og fire spor. Sjekk at `resizeCanvas()` og alle akseberegninger følger med.
- **Marker hver innsats med entydig markørtype**, hentet fra `state.efforts`:

| Markør | Betydning |
|---|---|
| Fylt trekant ▲ | Innsats som utløste pust (assistert) |
| Åpen trekant △ | Mislykket innsats (missed effort) |
| Trekant med kryss | Autotrigger — pust uten innsats |
| Kvadrat ■ | Maskinutløst backup-pust (brukes fra fase 6) |

- Legg til en tegnforklaring i `Kurveforståelse`-fanen i `index.html` med alle fire markørene og forklaring på norsk. Fanen finnes allerede og er rett sted.

---

## Test før du går videre

| # | Innstilling | Forventet | Krav |
|---|---|---|---|
| T16 | Stigetid 50 ms, sveipetid 15 s | Trykkoversvinget er **synlig** også på den brede visningen | absolutt krav (prøven på C7) |
| T17 | Cycling 5 %, pmusExp 8 | Terminal-spiken er synlig ved alle tre sveipetider | krav |
| T18 | Pmus 2, trigger 5 L/min | Pes-kurven viser regelmessige innsatser; trykk- og flowkurven viser små avtrykk; markørene er **åpne** trekanter | krav |
| T19 | Lekkasje 40, trigger 1, rrSpont 12 | Markørrekken viser **blandede** typer: noen fylte, noen med kryss | krav |
| T20 | Sett Vt til 350 ml og deretter 550 ml (via stigetid/cycling), akser låst | De to pustene ser **tydelig ulike ut** i høyde | krav (prøven på C9) |
| T21 | Slå Pes-sporet av og på, bytt sveipetid, endre vindusstørrelse | Layout og akser følger med, ingen kurverester, ingen konsollfeil | absolutt krav |
| T22 | Fire spor synlige, 6 s sveipetid, KOLS-preset | Jevne 60 fps | krav |

**T16 er prøven på at fasen lyktes.** Er oversvinget borte på 15 s-visningen, er min/maks-konvoluttet ikke implementert riktig — og da er alle de korte fenomenene fageksperten etterlyste fortsatt usynlige, uansett hvor riktig fysikken under er.

**Etter denne fasen bør du gå gjennom `09_SJEKKLISTE_fagekspert.md` på nytt.** Nå skal alle seks fenomenene være både fysisk mulige *og* synlige.

**Commit:** `fase 5: min/maks-konvolutt, valgbar sveipetid, låsbare akser, Pes-spor med markørtyper`
