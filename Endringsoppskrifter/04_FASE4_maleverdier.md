# FASE 4 av 7 — Måleverdier som faktisk måler

## Kontekst

Interaktiv NIV-respiratorsimulator for opplæring av sykepleiere. Ren HTML5, CSS3 og vanilla JavaScript — ingen byggeverktøy, ingen rammeverk, ingen biblioteker.

| Fil | Rolle |
|---|---|
| `index.html` | UI: monitor, `readout-panel` med målekort, slidere, faner, alarmbanner |
| `simulator.js` | Fysikkmotoren |
| `app.js` | Kobler slidere til simulator, animasjonsloop, `updateReadouts()` |

**Denne fasen:** endring C1, C3, C5, C6 og D5. Dette er den siste fasen som rører fysikken; de neste handler om visning og undervisningsfunksjoner.

**Alt gjort i fase 1–3 (bygg videre på dette, ikke om):**
- Fysisk trykkmodell med servo, utgangsimpedans og flowbegrensning
- Kontinuerlig lungevolum `state.V`, `P_el`, `PEEPi`, `VTI`, `VTE`
- `patientDrive` med eget respirasjonssenter og innsatslogg `state.efforts` med typene `assist` / `missed` / `double` / `auto` / `mandatory`
- Fysisk trigger og cycling, `lastCycleReason`
- Ekspiratorisk motstand, flowbegrensning, kontinuerlig lekkasje, og de tre flowstørrelsene `Q_lunge` / `Q_total` / `Q_meas`

**Kommer senere — IKKE gjør nå:** monitorendringer, Pes-kurve og markørtyper (fase 5), PC-modus, backup-frekvens, scenarioknapper og frysemodus (fase 6).

---

## Regler for dette oppdraget

- **Gjør bare det som står i denne filen.** Oppdager du andre feil underveis, ikke fiks dem — list dem opp på slutten av svaret ditt i stedet.
- Behold norsk i all UI-tekst og alle kodekommentarer.
- Ingen nye biblioteker, ingen byggeverktøy. Behold filstrukturen.
- Alle nye tall skal komme fra **målt** simulatortilstand. Ingen måleverdi skal noensinne regnes ut fra en sliderposisjon.
- Programmet skal kjøre og kunne testes når fasen er ferdig.

---

## C1 — Måleverdier regnes ut fra sliderposisjon

**Alvorlighetsgrad: høy.** `simulator.js` linje 265–275:

```js
let effectiveRR = this.settings.rr;
if (this.settings.triggerFlow === 4.0 || (...)) effectiveRR = Math.round(this.settings.rr / 2);
else if (this.settings.triggerFlow >= 5.0)      effectiveRR = 0;
this.state.measured.mv = parseFloat(((measuredVt * effectiveRR) / 1000).toFixed(2));
```

Frekvens og minuttvolum leses av triggerslideren, ikke av virkeligheten. Måleverdiene på skjermen er derfor ikke målinger — de er gjentakelser av innstillinger. En sykepleier som lærer å stole på MV-tallet her, lærer å stole på noe som ikke måler noe.

### Bestilling

Fjern all utregning av `effectiveRR` fra sliderverdier. Beregn i stedet:

- `RRtot` = antall leverte pust i de siste 60 sekundene. Utvid `recentBreaths` til å holde 60 s historikk (fjern grensen på 10 elementer, linje 284–286) og bruk et glidende vindu over faktiske pusttidspunkter.
- `RRspont` = antall **pasientutløste** pust i samme vindu. Vis også `% spontane pust`.
- `Vt` = **VTE** (ekspirert volum), ikke inspirert. Det er dette ekte maskiner viser, og differansen VTI − VTE *er* lekkasjen.
- `MV` = `middel(VTE siste 60 s) × RRtot / 1000` (L/min).
- Alle måleverdier skal glattes over 3 pust, ikke hoppe per pust.

---

## C3 — Apné-alarmen og de manglende alarmene

`simulator.js` linje 119–131 (delvis rettet i fase 2):

```js
const isIneffectiveTrigger = trigFlow >= 5.0;
if (isIneffectiveTrigger || timeSinceLast >= Math.max(9.0, cycleTime * 2.0)) { ... }
```

Alarmen utløses umiddelbart når slideren treffer 5,0, uavhengig av om pasienten puster. Samtidig settes `vt`, `mv` og `rrTotal` til 0 i samme tidssteg — måleverdiene *snapper* til null i stedet for å falle.

### Bestilling

- Alarmen skal kun utløses av virkeligheten. Vilkår: ingen levert pust i `settings.apneaDelay` sekunder (ny innstilling, standard 15 s, justerbar 5–30 s).
- Måleverdier skal falle gradvis med sitt eget glidende vindu, **aldri settes direkte til 0**.
- Alarmteksten skal ikke instruere om slidere. Dagens tekst («Senk flow-trigger til 1–3 L/min») lærer sykepleieren å bruke programmet, ikke å lese pasienten. En maskinalarm beskriver funnet og lar klinikeren finne årsaken. Foreslått tekst: *«APNÉ: ingen levert pust i X sekunder. Kontroller pasientinnsats, trigger og lekkasje.»*
- Legg til de alarmene som mangler og som er de vanligste ved NIV, alle med justerbare grenser i `Avansert`-fanen:

| Alarm | Standard grense |
|---|---|
| Høy lekkasje | > 40 L/min i mer enn 10 s |
| Lavt tidalvolum | VTE < 300 ml i 3 påfølgende pust |
| Høy frekvens | RRtot > 30 /min |
| Høyt trykk | PIP > innstilt IPAP + 5 cmH₂O |

- Flere samtidige alarmer skal kunne vises. Prioriter apné øverst.

---

## C5 — PIP er trykket ved cycling, ikke maksimalt trykk

`simulator.js` linje 259 leser av `state.paw` i `_startExpiration()`. Etter fase 1 har trykkurven et oversving tidlig i pustet, så den *virkelige* toppen inntreffer typisk 50–120 ms etter start, mens den avleste verdien er trykket ved slutten. Målekortet viser altså ikke topptrykket.

### Bestilling

- Spor `state.pawMaxInBreath` gjennom hele inspirasjonen og bruk den som `PIP`.
- Rapporter `Pplat` separat: middelet av `P_aw` i de siste 100 ms før cycling.
- Vis begge. Differansen `PIP − Pplat` er den motstandsrelaterte trykkomponenten, og er en direkte lesbar indikator på obstruksjon — et tall sykepleieren kan bruke.

---

## C6 — `te` er en subtraksjon, ikke en måling

`simulator.js` linje 275: `te = (60 / rr) - ti`, regnet ut fra innstilt frekvens som ikke er den faktiske.

### Bestilling

- Mål `Te` som faktisk forløpt tid mellom cycling og neste trigging.
- Beregn `I:E`-forhold og `Ti/Ttot` fra målte `Ti` og `Te`.
- Vis `I:E` i formatet `1:2,4`.

---

## D5 — Utvidet måleverdipanel

### Bestilling

Utvid `readout-panel` i `index.html`. Behold dagens fire kort som primærvisning øverst, og legg til en sekundærgruppe under:

| Verdi | Enhet | Merknad |
|---|---|---|
| `PIP` | cmH₂O | Maksimalt trykk i pustet (C5) |
| `Pplat` | cmH₂O | Siste 100 ms før cycling |
| `PEEP` / `PEEPi` / `PEEPtot` | cmH₂O | `PEEPi` er nøkkeltallet for KOLS-caset |
| `VTI` / `VTE` | ml | Differansen er lekkasjen, gjort lesbar |
| `Vt/kg IBW` | ml/kg | Krever et vektfelt (høyde + kjønn → idealvekt). Klinisk mer meningsfullt enn ml alene |
| `Ti` / `Te` / `I:E` | s | Målt, ikke beregnet fra innstilling (C6) |
| `RRtot` / `RRspont` / `% spontan` | /min, % | `% spontan` er en av de mest brukte kliniske NIV-indikatorene og finnes ikke i dag |
| `Lekkasje` / `Lekkasje %` | L/min, % | |
| `Asynkroni-indeks` | % | `(missed + auto + double) / totale innsatser`, glidende 60 s, fra `state.efforts` |
| `τ` (tidskonstant) | s | Finnes i innsiktsboksen i dag; flytt opp som måleverdi |
| `Cyclingårsak` | tekst | `flow` / `tiMax` — et reelt klinisk funn |

**Krav til visningen:** merk tydelig visuelt hvilke tall som er **innstilte** og hvilke som er **målte** — for eksempel dempet skrift og en liten merkelapp på de innstilte. Sammenblanding av innstilt og målt verdi er en av de vanligste feilkildene når man leser en respiratorskjerm, og simulatoren bør trene sykepleieren i å skille dem fra første dag.

Panelet blir langt. Grupper det i to kolonner eller gjør sekundærgruppen sammenleggbar, men **ikke skjul den bak en fane** — poenget er at tallene skal kunne leses samtidig med kurvene.

---

## Test før du går videre

| # | Innstilling | Forventet | Toleranse |
|---|---|---|---|
| E17 | rrSpont 0 | Apné-alarm etter 15 s, ikke før | ±2 s |
| T11 | rrSpont 14, trigger 5 L/min | `RRtot` faller til det faktiske antallet leverte pust, `% spontan` faller, `Asynkroni-indeks` stiger | kvalitativt |
| T12 | Lekkasje 30 | `VTI` klart større enn `VTE`; differansen samsvarer med `Lekkasje` | ±20 % |
| T13 | Stigetid 50 ms | `PIP` > `Pplat` med minst 1 cmH₂O (oversvinget fanges opp) | krav |
| T14 | KOLS-preset, rrSpont 25 | `PEEPi` > 2, `PIP − Pplat` klart større enn ved normal lunge | kvalitativt |
| T15 | Dra triggerslideren gjennom hele området | Ingen måleverdi skal endre seg i det øyeblikket slideren flyttes — bare som følge av at pustene faktisk endrer seg | **absolutt krav** |

**T15 er selve prøven på at C1 er utført riktig.** Endrer et tall seg synkront med sliderdraget, er det fortsatt en innstilling som utgir seg for å være en måling.

**Commit:** `fase 4: målte verdier, alarmer, PIP/Pplat, utvidet måleverdipanel`
