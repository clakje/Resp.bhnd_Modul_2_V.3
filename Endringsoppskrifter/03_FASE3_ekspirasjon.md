# FASE 3 av 7 — Ekspirasjon, auto-PEEP og lekkasje

## Kontekst

Interaktiv NIV-respiratorsimulator for opplæring av sykepleiere. Ren HTML5, CSS3 og vanilla JavaScript — ingen byggeverktøy, ingen rammeverk, ingen biblioteker.

| Fil | Rolle |
|---|---|
| `index.html` | UI: monitor, målekort, slidere, faner, innsiktsboks |
| `simulator.js` | Fysikkmotoren — **det er denne fasen handler om** |
| `renderer.js` | Canvas-tegning av kurver |
| `app.js` | Kobler slidere til simulator, animasjonsloop |

**Denne fasen:** endring A6 og A7.

**Alt gjort i fase 1–2 (bygg videre på dette, ikke om):**
- Fast internt tidssteg `DT = 0.0002` s
- `state.V` = lungevolum i liter over FRC, aldri nullstilt. `P_el = state.V / C_L`
- Ventilatoren som fysisk trykkilde: `P_target` → servo `P_servo` → `P_aw = P_servo - R_out * Q_total`, med flowbegrensning
- `patientDrive` med eget respirasjonssenter, `P_mus` inkludert negativ (ekspiratorisk) komponent
- Fysisk triggeralgoritme mot `Q_meas = Q_total - Q_leak_estimert`, med maskinens tregt oppdaterte lekkasjeestimat (tidskonstant 4 s)
- Cycling på lekkasjekorrigert flow, `tiMax` som egen innstilling, `lastCycleReason`

**Kommer senere — IKKE gjør nå:** måleverdier og alarmer (fase 4), monitorendringer inkludert Pes-kurve, min/maks-konvolutt og markørtyper (fase 5), PC-modus, backup-frekvens og scenarioknapper (fase 6).

---

## Regler for dette oppdraget

- **Gjør bare det som står i denne filen.** Oppdager du andre feil underveis, ikke fiks dem — list dem opp på slutten av svaret ditt i stedet.
- Behold norsk i all UI-tekst og alle kodekommentarer.
- Ingen nye biblioteker, ingen byggeverktøy. Behold filstrukturen.
- **Ikke skriv om fase 1 eller 2.** Denne fasen utvider bevegelseslikningen med ekspiratorisk motstand og legger til en lekkasjekomponent i den algebraiske løsningen som alt finnes.
- Programmet skal kjøre og kunne testes når fasen er ferdig.

---

## A6 — Ekspirasjonen: ventilmotstand, separat R og flowbegrensning

### Problem

`simulator.js` linje 222–238 (i den grad den fortsatt står etter fase 1). Ekspiratorisk flow beregnes som `-(V/C)/R` med **inspiratorisk** R og uten ekspirasjonsventil. Det finnes ingen flowbegrensning.

### Fysiologisk begrunnelse

Ekspirasjonen er der obstruktiv sykdom bor. Tre forhold mangler:

1. **Luftveiene er trangere ut enn inn.** Under utpust komprimeres luftveiene dynamisk, og motstanden er høyere enn under innpust — typisk 1,3–2 ganger.
2. **Ekspirasjonsporten på en NIV-maske har egen motstand.** Den kommer i serie med luftveismotstanden.
3. **Ved KOLS er flowen begrenset.** Pasienten kan ikke presse ut mer luft ved å bruke mer kraft, fordi luftveiene klemmes sammen når trykket rundt dem øker (dynamisk kompresjon / Starling-motstand). Uten flowbegrensning kan en KOLS-pasient i simulatoren «puste seg ut av» auto-PEEP ved å ta i — det motsatte av virkeligheten, og en direkte farlig lærdom.

### Bestilling

- Innfør separat ekspiratorisk motstand:
  `R_exp = patient.resistance * patient.expRatio + machine.R_valve`
  med `expRatio` = 1,5 (standard, justerbar 1,0–3,0) og `R_valve` = 2,0 cmH₂O/(L/s).
- Bruk `R_eff = (Q_lunge > 0) ? R_insp : R_exp` i bevegelseslikningen. Beregn retningen ut fra fortegnet på drivtrykket i forrige tidssteg for å unngå sirkelavhengighet.
- Legg til **ekspiratorisk flowbegrensning** som pasientparameter `flowLimitation` (0–1, standard 0, egen slider i `Pasientfysiologi`-fanen). Når den er over 0, øker effektiv ekspiratorisk motstand med økende drivtrykk, slik at flowen platåer:

```js
const drivingExp = Math.max(0, P_el + Math.max(0, -P_mus) - settings.epap);
const R_exp_eff  = R_exp * (1 + patient.flowLimitation * drivingExp / 10);
```

- Sett `flowLimitation = 0.7` i KOLS-presetet, `0` i de to andre.
- Beregn `PEEPi` ved hvert innpusts start: `(state.V_endExp / C_L) - epap`, klippet til minimum 0. Lagre den i `state.measured.peepi`.

---

## A7 — Lekkasje som kontinuerlig fysisk fenomen

### Problem

`simulator.js` linje 197–198:

```js
flow_L_min += (this.settings.leak * (this.state.paw / Math.max(1, this.settings.ipap)));
```

Lekkasjen finnes bare i inspirasjonen, er lineær i trykk, og legges **kun til den viste flowen** — den integreres ikke inn i volumet, og påvirker ikke trigging, cycling eller måleverdier.

### Fysiologisk begrunnelse

Kravspesifikasjonen etterlyser at «volumkurven ikke returnerer til null» og at «flow-kurven forskyves». Det er umulig med dagens implementasjon, fordi volumkurven viser lungevolum mens flowkurven viser lekkasjeforurenset flow — de to henger ikke sammen.

Klinisk er dette selve NIV-problemet: **maskinen ser ikke pasienten, den ser summen av pasient og lekkasje.** Nesten all NIV-asynkroni og de fleste NIV-alarmer går tilbake til den forskjellen.

Lekkasje gjennom en åpning følger en kvadratrotlov, ikke en lineær: dobbelt trykk gir ca. 1,4 ganger lekkasjen, ikke det dobbelte. Derfor oppgis lekkasje klinisk alltid ved et referansetrykk.

### Bestilling

- Endre `settings.leak` til å bety **L/min ved 10 cmH₂O**. Utvid `sliderLeak` i `index.html` fra `max="30"` til `max="60"`, og oppdater etiketten til «L/min @ 10 cmH₂O».
- Beregn lekkasjen kontinuerlig, i **begge faser**:

```js
const Q_leak = (settings.leak / 60) * Math.sqrt(Math.max(0, P_aw) / 10);   // L/s
```

- For den algebraiske løsningen fra fase 1 trengs en linearisert konduktans: `G_leak = Q_leak / Math.max(0.5, P_aw)`. Oppdater den hvert tidssteg med forrige `P_aw`. Dette gjør at `G_leak`-leddet som alt står i formelen faktisk får verdi.
- Skill tydelig mellom **tre** flowstørrelser og hold dem som separate felter i `state`:

| Felt | Betydning | Brukes til |
|---|---|---|
| `Q_lunge` | Det pasienten faktisk får (sannheten) | Volumintegrasjon, fysiologi |
| `Q_total` | Det maskinen faktisk blåser (`Q_lunge + Q_leak`) | Maskinens flowbegrensning, lekkasjeestimat |
| `Q_meas` | Det maskinen *tror* pasienten får (`Q_total - Q_leak_estimert`) | Trigging, cycling, **kurven som tegnes** |

- **Flowkurven i monitoren skal vise `Q_meas`** — maskinens virkelighetsforståelse, altså den kurven sykepleieren ser på en ekte maskin.
- Legg til en avkrysningsboks «Vis sann lungeflow» i `Avansert`-fanen som tegner `Q_lunge` som en stiplet, svakere kurve oppå. **Dette er den enkeltvis mest lærerike visualiseringen i hele programmet:** differansen mellom de to kurvene *er* lekkasjeproblemet, gjort synlig.
- Gi volumkurven samme dobbeltvisning: maskinmålt volum (integrert `Q_meas`, som ikke returnerer til nullinjen ved lekkasje) og sant lungevolum (integrert `Q_lunge`, som gjør det).
- Legg til `state.measured.leak` (L/min, øyeblikkelig) og `state.measured.leakPercent` (`Q_leak / Q_total * 100`). Visningen av dem hører til fase 4 — bare regn dem ut nå.

---

## Test før du går videre

| # | Innstilling | Forventet | Toleranse |
|---|---|---|---|
| E5 | C 50, R 5, lekkasje 0 | Ekspiratorisk flow faller til 5 % av topp etter ca. 3τ = 0,75 s | ±0,15 s |
| E8 | Lekkasje 30 L/min, IPAP 15 | Lekkasjeflow ca. 30 × √(15/10) ≈ 37 L/min ved topptrykk | ±15 % |
| E9 | Lekkasje 30, begge volumkurver synlige | Maskinmålt volum returnerer **ikke** til null; sant lungevolum gjør det | kvalitativt |
| E10 | KOLS-preset, rrSpont 25, EPAP 5 | `PEEPi` stabiliserer seg på 3–8 cmH₂O etter 10–20 pust | må være > 2 |
| E11 | Som E10, men rrSpont 10 | `PEEPi` < 1 cmH₂O | krav |
| E14 | Cycling 5 %, pmusExp 8, tiNeural 0,6 s | Terminal trykkspike > 2 cmH₂O over platå mot slutten av inspirasjonen | må være > 1 |
| T6 | Lekkasje 40, trigger 1 L/min | Autotrigging oppstår spontant | må forekomme |
| T7 | Lekkasje 40, cycling 25 % | Cycling svikter, `lastCycleReason` viser `tiMax` | krav |
| T8 | KOLS-preset, pmusExp 8 | Ekspiratorisk flow blir **ikke** dypere i den flowbegrensede delen, bare i den første raske delen | kvalitativt |
| T9 | Normal lunge, pmusExp 8 | Ekspiratorisk flow blir tydelig dypere | kvalitativt |
| T10 | KOLS-preset, rrSpont 25, trigger 2 L/min | Mislykkede innsatser oppstår **av seg selv** etter hvert som auto-PEEP bygger seg opp, uten at triggeren er rørt | må forekomme |

**E14 er den viktigste prøven i hele prosjektet.** Terminal-spiken kan ikke oppstå ved et uhell og kan ikke tegnes uten å hardkode den. Den oppstår fordi pasienten snur og bruker ekspirasjonsmusklene mens maskinen fortsatt holder inspiratorisk trykk: flowen inn i lungen faller mot null og videre til negativ, og siden `P_aw = P_servo − R_out·Q_total`, stiger masketrykket når flowen faller. Får du spiken, har du en fungerende fysikkmotor.

**T10 er den viktigste prøven pedagogisk.** At mislykket trigging oppstår av seg selv når KOLS-pasienten hyperinflateres, er hele sammenhengen mellom obstruksjon, auto-PEEP og asynkroni — og den kan nå oppdages i stedet for å forklares.

**Etter denne fasen bør du gå gjennom `09_SJEKKLISTE_fagekspert.md` for første gang.** Alle seks fenomenene skal nå være fysisk mulige, selv om monitoren ennå ikke viser dem optimalt.

**Commit:** `fase 3: ekspiratorisk motstand, flowbegrensning, auto-PEEP og fysisk lekkasjemodell`
