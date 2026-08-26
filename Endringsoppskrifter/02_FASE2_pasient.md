# FASE 2 av 7 — Pasienten: eget respirasjonssenter, trigger og cycling

## Kontekst

Interaktiv NIV-respiratorsimulator for opplæring av sykepleiere. Ren HTML5, CSS3 og vanilla JavaScript — ingen byggeverktøy, ingen rammeverk, ingen biblioteker.

| Fil | Rolle |
|---|---|
| `index.html` | UI: monitor, målekort, slidere, faner, innsiktsboks |
| `simulator.js` | Fysikkmotoren — **det er denne fasen handler om** |
| `renderer.js` | Canvas-tegning av kurver, sveipelinje, akser |
| `app.js` | Kobler slidere til simulator, animasjonsloop, måleverdier |

**Denne fasen:** endring A3, A4 og A5.

**Alt gjort i fase 1 (bygg videre på dette, ikke om):**
- Fast internt tidssteg `DT = 0.0002` s med substeg i `step()`
- `state.V` = lungevolum i liter over FRC, aldri nullstilt. `P_el = state.V / C_L`
- Ventilatoren er en fysisk trykkilde: `P_target` → dempet andreordens servo `P_servo` → masketrykk `P_aw = P_servo - R_out * Q_total`, løst algebraisk, med flowbegrensning mot `machine.Qmax`
- Lungeflow: `Q_lunge = (P_aw + P_mus - P_el) / R_eff`
- Stigetid-slideren går nå 50–900 ms

**Kommer senere — IKKE gjør nå:** ekspirasjonsmodell med egen ventilmotstand og flowbegrensning, lekkasjemodell (fase 3), måleverdier og alarmer (fase 4), monitorendringer inkludert Pes-kurve og markørtyper (fase 5), PC-modus og backup-frekvens (fase 6).

---

## Regler for dette oppdraget

- **Gjør bare det som står i denne filen.** Oppdager du andre feil underveis, ikke fiks dem — list dem opp på slutten av svaret ditt i stedet.
- Behold norsk i all UI-tekst og alle kodekommentarer.
- Ingen nye biblioteker, ingen byggeverktøy. Behold filstrukturen.
- **Ikke skriv om fase 1.** Trykkmodellen skal stå urørt. Denne fasen leverer `P_mus` inn til den og leser `Q_meas` ut av den.
- Programmet skal kjøre og kunne testes når fasen er ferdig.

---

## A3 — Pasienten får sin egen klokke

### Problem

I dag er pasientens muskelinnsats en bijobb for maskinen. Innpustforsøk oppstår når maskinens syklustid er utløpt (`simulator.js` linje 108–113), `P_mus` er en sinusbue som starter når maskinen bestemmer (linje 137 og 184), og RR-slideren er merket «Pasientens spontane pustefrekvens» mens den brukes til å regne maskinens syklustid.

### Fysiologisk begrunnelse

Asynkroni betyr per definisjon at pasientens nevrale rytme og maskinens rytme ikke er i takt. Så lenge de deler samme klokke, kan asynkroni ikke oppstå — bare etterlignes med hardkodede unntak, som er nøyaktig det dagens kode gjør. Pasienten må ha eget respirasjonssenter.

I tillegg har pasienten *ekspirasjonsmuskler*. Uten negativ `P_mus` er både aktiv utpust, kamp mot maskinen og terminal-spiken ved for sen inspiratorisk avslutning umulige å fremprovosere.

### Bestilling

Lag et selvstendig `patientDrive`-objekt i `simulator.js` med egen tidsakse, helt uavhengig av ventilatorens faser.

Parametere (alle skal ha slider i `Pasientfysiologi`-fanen i `index.html`):

| Parameter | Område | Standard | Merknad |
|---|---|---|---|
| `rrSpont` | 0–40 /min | 14 | Pasientens egen frekvens. 0 = apnøisk/passiv |
| `pmusMax` | 0–20 cmH₂O | 3 | Inspiratorisk muskelkraft (erstatter dagens `pmusMax`) |
| `tiNeural` | 0,4–1,6 s | 0,9 | Nevral inspirasjonstid |
| `pmusExp` | 0–10 cmH₂O | 0 | Ekspiratorisk muskelkraft (aktiv utpust / kamp) |
| `variability` | 0–30 % | 10 | Tilfeldig variasjon i frekvens og kraft per pust |
| `cardiacArtifact` | 0–3 L/min | 0 | Svak flowoscillasjon ved hjertefrekvens |

`variability` er ikke kosmetikk: uten litt variasjon ser kurvene mekanisk døde ut, og *sporadisk* asynkroni — slik den faktisk opptrer klinisk — kan ikke oppstå.

`cardiacArtifact` kommer direkte fra fagekspertens observasjon om at det man ser som «pasientinnsats» kan være en artefakt, for eksempel hjerteslag. Med sensitiv trigger skal denne alene kunne gi autotrigging uten noen pasientinnsats i det hele tatt.

Kurveform for `P_mus(t_n)` innenfor hver nevrale syklus (`T_n = 60 / rrSpont`):

```
t_n < 0.7*tiNeural          : P_mus = pmusMax * (t_n / (0.7*tiNeural))              // lineær opptrapping
t_n < tiNeural              : P_mus = pmusMax * exp(-(t_n - 0.7*tiNeural) / 0.12)   // rask relaksasjon
t_n < tiNeural + 0.35       : P_mus = -pmusExp * sin(π * (t_n - tiNeural) / 0.35)   // ev. aktiv ekspirasjon
ellers                      : P_mus = 0
```

`P_mus` skal **alltid** legges inn i bevegelseslikningen fra fase 1 — også når maskinen ikke trigger. Det er dette som gjør en mislykket innsats synlig i kurvene.

Ved `rrSpont = 0` skal `P_mus` være konstant 0 (passiv pasient).

**Innsatslogg:** registrer hver nevrale innsats som et objekt i `state.efforts`:
`{ t, detected: bool, type: 'assist' | 'missed' | 'double' | 'auto' | 'mandatory' }`

Hold listen begrenset til de siste 60 sekundene. Den driver trekantmarkørene (fase 5) og asynkroni-indeksen (fase 4). `'mandatory'` brukes først i fase 6, men ta med verdien nå.

---

## A4 — Ekte triggeralgoritme

### Problem

`simulator.js` linje 119–153. Triggingen er en oppslagstabell på sliderverdien:

```js
if (trigFlow <= 3.0)      willTriggerThisBreath = true;                    // 100 %
else if (trigFlow < 5.0)  willTriggerThisBreath = (breathCount % 2 === 1); // annenhver
else                      willTriggerThisBreath = false;                   // apné
```

Pasientens faktiske kraft, lungemekanikken, lekkasjen og auto-PEEP har ingen innvirkning. En pasient med Pmus 20 cmH₂O trigger ikke ved 5 L/min; en pasient med Pmus 0,5 trigger hver gang ved 3 L/min. Begge er feil. I tillegg er triggerforsinkelsen hardkodet til 40 ms (linje 160), uavhengig av innsats og innstilling.

### Fysiologisk begrunnelse

Trigging er en enkel sammenligning maskinen gjør mange ganger i sekundet: *er flowen jeg måler nå større enn terskelen jeg er satt til?* Alt det kliniske interessante ligger i hva som forstyrrer den sammenligningen — svak pasient, auto-PEEP som må overvinnes før flow i det hele tatt oppstår, eller lekkasje som maskinen feiltolker som innsats. Når terskelen erstattes av en tabell, forsvinner alle tre.

Fageksperten peker på at dagens visning ikke kan skille *pasienten forsøker ikke* fra *pasienten forsøker, men maskinen ser det ikke*. Klinisk er dette to helt ulike situasjoner med ulike tiltak. Denne fasen får forskjellen til å eksistere i fysikken; fase 5 gjør den synlig på skjermen.

### Bestilling

Erstatt hele triggerlogikken med en løpende sammenligning som kjøres hvert tidssteg gjennom ekspirasjonen.

**Flow-trigger:** `Q_meas = Q_total - Q_leak_estimert`. Trigg når `Q_meas > settings.triggerFlow` (konverter slideren fra L/min til L/s).

**Trykk-trigger** (ny valgmulighet — legg til to knapper «Flow» / «Trykk» i triggerkortet i `index.html`): trigg når `P_aw < epap - settings.triggerPressure`, standard 1,0 cmH₂O, område 0,2–5,0.

**Viktig om `Q_leak_estimert`:** dette skal være maskinens *estimat*, ikke sannheten — et glidende gjennomsnitt av `Q_total` gjennom sen ekspirasjon med tidskonstant 4 s. Dette er ikke en detalj, det er mekanismen som gjør autotrigging fysisk mulig: når lekkasjen plutselig øker, henger estimatet etter, og maskinen tolker lekkasjeflowen som et innpustforsøk. I denne fasen er lekkasjen fortsatt 0 (fase 3), men **estimatstrukturen skal bygges nå**.

Regler rundt sammenligningen:

- **Refraktærtid** 0,15 s etter cycling. Uten den låser programmet seg i en kaskade av pust.
- **Ingen hardkodet triggerforsinkelse.** Fjern `timeInPhase >= 0.04` (linje 160). Forsinkelsen skal falle ut av fysikken: hvor lang tid det tar før innsatsen bygger nok flow til å nå terskelen. En svak pasient med auto-PEEP får da automatisk 150–250 ms forsinkelse, som er klinisk realistisk.
- **Mislykket innsats:** når en nevral innsats avsluttes uten at terskelen er nådd, marker den `type: 'missed'`. Ingen pust leveres. Innsatsen er likevel synlig i kurvene, fordi `P_mus` uansett står i bevegelseslikningen.
- **Autotrigger:** terskelen krysses uten at det finnes aktiv nevral innsats → `type: 'auto'`.
- **Dobbelttrigger:** ny trigging < 0,4 s etter forrige cycling, med nevral aktivitet fortsatt igjen → `type: 'double'`.

**Apné-alarmen:** fjern `const isIneffectiveTrigger = trigFlow >= 5.0` (linje 120) og koblingen til sliderverdien. Foreløpig vilkår i denne fasen: ingen levert pust i 15 sekunder. Full alarmhåndtering kommer i fase 4 — ikke bygg den ut nå, bare kutt koblingen til slideren.

---

## A5 — Ekte cyclingalgoritme (inspiratorisk avslutning)

### Problem

`simulator.js` linje 205–220. Tre feil:

1. Cycling måles mot toppflow **inkludert** lekkasjekomponenten (linje 198 legger lekkasje inn i `state.flow`, linje 206 sporer nettopp `state.flow`).
2. `maxInspirationTime = Math.min(3.0, cycleTime * 0.65)` — ved RR 8 gir det 4,9 s inspirasjon, klinisk umulig.
3. `cyclingPercent` går bare 10–50 % i `index.html`.

### Fysiologisk begrunnelse

Fageksperten viser til referansesimulatorens ESENS-verdier på 15, 20, 25, 70 og 85 %. Med tak på 50 % kan for tidlig avslutning ikke fremprovoseres, og dermed heller ikke dobbelttrigging — som er hele poenget i skjermbildet hennes om at «resultatet kan være dobbelttrigger».

At lekkasjeflow regnes med i toppflow er en reell feil med klinisk betydning: det er nettopp **fordi** ekte maskiner må trekke fra lekkasjen at cycling svikter ved store lekkasjer, og maskinen i stedet faller tilbake på Timax.

### Bestilling

- Beregn cycling utelukkende på **lekkasjekorrigert** inspiratorisk flow (`Q_meas`), aldri på `Q_total`.
- Spor `state.peakQmeas` innenfor hvert innpust. Avslutt inspirasjonen når `Q_meas < settings.cyclingPercent * state.peakQmeas`.
- Utvid `sliderCycling` i `index.html` fra `min="10" max="50"` til **`min="5" max="90" step="5"`**. Oppdater etikettene: lav % = sen avslutning / lang inspirasjon, høy % = tidlig avslutning / kort inspirasjon.
- Erstatt `maxInspirationTime` med en egen innstilling `settings.tiMax`, standard 2,0 s, justerbar 0,8–3,0 s, med egen slider i `Avansert`-fanen. Dette er `Timax` på ekte NIV-maskiner.
- Behold `tiMin` = 0,25 s som nedre grense.
- Registrer **hvorfor** inspirasjonen ble avsluttet: `state.lastCycleReason = 'flow' | 'tiMax'`. Vis den i innsiktsboksen. At maskinen avsluttet på tid og ikke på flow er i seg selv et klinisk funn en sykepleier skal kunne lese ut av kurven.

---

## Test før du går videre

| # | Innstilling | Forventet | Krav |
|---|---|---|---|
| T1 | rrSpont 20, maskinens frekvens 12 | Pustene kommer i pasientens takt (ca. hvert 3. sek), ikke maskinens | kvalitativt |
| T2 | rrSpont 0 | Ingen pasientinnsats, ingen `P_mus`, ingen trigging | kvalitativt |
| E12 | Pmus 2, trigger 5 L/min | Mislykkede innsatser. Hver skal gi **synlig bule mot nullinjen i ekspiratorisk flow** og liten dipp i trykkurven | må forekomme |
| T3 | Som E12, men trigger 1,5 L/min | Samme innsatser gir nå pust, uten at noe annet er endret | kvalitativt |
| E13 | Cycling 85 %, Pmus 7, tiNeural 1,2 s | Dobbelttrigging oppstår. Trykket dras under EPAP-linjen rett etter cycling | må forekomme |
| T4 | Cycling 5 %, KOLS-preset | `lastCycleReason` viser `tiMax` | krav |
| T5 | cardiacArtifact 2,5, trigger 1,0, rrSpont 0 | Autotrigging uten noen pasientinnsats | må forekomme |
| E15 | Alle slidere fram og tilbake i 60 s, alle presets | Ingen NaN, ingen frosne kurver, ingen konsollfeil | absolutt krav |

**Den viktigste prøven er E12.** Mislykket innsats som *ses i kurvene uten å gi pust* er kjernen i fagekspertens skarpeste tilbakemelding. Uteblir avtrykket, er `P_mus` ikke koblet inn i bevegelseslikningen utenfor inspirasjonsfasen.

**Forventet etter denne fasen:** trigging og cycling oppfører seg fysiologisk, men måleverdiene (frekvens, minuttvolum, Vt) viser fortsatt gale tall fordi de regnes ut fra sliderposisjon i gammel kode. Det rettes i fase 4. Markørene i monitoren skiller ennå ikke mellom innsatstyper — fase 5.

**Commit:** `fase 2: pasientens respirasjonssenter, fysisk trigger og cycling`
