# FASE 1 av 7 — Fundamentet: numerikk, volummodell og trykkmodell

## Kontekst

Prosjektet er en interaktiv NIV-respiratorsimulator for opplæring av sykepleiere. Ren HTML5, CSS3 og vanilla JavaScript — ingen byggeverktøy, ingen rammeverk, ingen biblioteker.

| Fil | Rolle |
|---|---|
| `index.html` | UI: monitor, målekort, slidere, faner, innsiktsboks |
| `style.css` | Utseende |
| `simulator.js` | Fysikkmotoren — **det er denne fasen handler om** |
| `renderer.js` | Canvas-tegning av kurver, sveipelinje, dynamiske akser |
| `app.js` | Kobler slidere til simulator, animasjonsloop, måleverdier |

**Denne fasen:** endring A8, A1 og A2. De må gjøres samlet, fordi A2 er numerisk avhengig av A8 og logisk avhengig av A1.

**Forutsetter:** ingenting. Dette er første fase.

**Kommer senere — IKKE gjør nå:** pasientens eget respirasjonssenter, ny triggeralgoritme, ny cyclinglogikk (fase 2), ekspirasjonsmodell og lekkasje (fase 3), måleverdier (fase 4), monitorendringer (fase 5), nye moduser (fase 6).

---

## Regler for dette oppdraget

- **Gjør bare det som står i denne filen.** Oppdager du andre feil underveis, ikke fiks dem — list dem opp på slutten av svaret ditt i stedet.
- Behold norsk i all UI-tekst og alle kodekommentarer.
- Ingen nye biblioteker, ingen byggeverktøy, ingen rammeverk. Behold filstrukturen.
- Programmet skal kjøre og kunne testes når fasen er ferdig, selv om noen måleverdier midlertidig blir feil (de er avhengige av senere faser og rettes i fase 4).
- Ved faglig tvil: velg det som er fysiologisk riktig, og skriv en kort kodekommentar om valget.

---

## Bakgrunn: hvorfor denne fasen finnes

Dagens kode **tegner** trykket i stedet for å **beregne** det. I `simulator.js` linje 175–178 settes `paw` som en fast cosinusrampe mot IPAP, uten hensyn til flowbehov, pasientinnsats, lekkasje eller lungefylling. Deretter brukes dette påtvungne trykket til å regne ut flow og volum.

Konsekvensen er avgjørende: alle kurvefenomenene ved dårlig pasient–maskin-samspill er *avvik mellom ønsket og oppnådd trykk*. Trykkspiken ved rask stigetid, den avrundede skulderen ved lang stigetid, dippen når pasienten drar hardere enn maskinen leverer, trykkspiken når pasienten puster ut mot maskinen — dette er ikke pynt på trykkurven. Det **er** trykkurven, i det øyeblikket maskin og pasient er uenige. Når trykket dikteres på forhånd, kan uenighet ikke oppstå, og fenomenene kan bare etterlignes med hardkodede unntak.

Denne fasen erstatter den påtvungne kurven med en fysisk modell av blåser, regulator og lunge.

---

## A8 — Fast internt tidssteg (gjør denne først)

### Problem

`app.js` linje 426: `Math.min(0.1, (currentTimestamp - lastTimestamp) / 1000)`, og `simulator.js` linje 62: `subSteps = 10`. Ved 60 fps blir internt tidssteg 1,67 ms. Har fanen vært i bakgrunnen, klippes tidssprang på 0,1 s ned til 10 substeg à 10 ms.

Den nye trykkmodellen i A2 har tidskonstant ned mot 10 ms ved kort stigetid, og blir **numerisk ustabil** ved 10 ms tidssteg — kurvene vil svinge eller eksplodere. Verre: ustabiliteten ser bedragersk ut som fysiologi. «Spontane» svingninger kan lett forveksles med autotrigging.

### Bestilling

- Innfør fast internt tidssteg `DT = 0.0002` s (0,2 ms) som konstant i `simulator.js`.
- `step(frameDt)` skal beregne `n = Math.round(frameDt / DT)`, klippe `n` til maksimalt 2500 (= 0,5 s simulert tid per frame), og kalle `_singleStep(DT)` n ganger.
- Akkumuler resten i `state.dtCarry` slik at simulert tid ikke drifter fra veggklokken.
- Er `frameDt > 0.5` (fanen har vært i bakgrunnen), hopp over framen og fortsett — ikke prøv å ta igjen tapt tid.
- Legg inn en sikkerhetsventil: hvis `Math.abs(state.P_aw) > 200` eller `!isFinite(state.V)`, kall `reset()` og skriv en advarsel til konsollen. Da får du et tydelig signal hvis en senere endring bryter stabiliteten, i stedet for tomme kurver.
- 5000 iterasjoner per sekund med denne aritmetikken er ubetydelig for moderne nettlesere. Ikke optimaliser dette bort.

---

## A1 — Volum som ikke nullstilles

### Problem

`simulator.js` linje 247, i `_startInspiration()`:

```js
this.state.volume = 0; // Nullstill tidalvolum for dette innpustet
```

Volumet tvangsnullstilles ved hvert innpust. Ekspirasjonen tømmer mot 0 asymptotisk (linje 230–237) og klippes med `Math.max(0, ...)`.

### Fysiologisk begrunnelse

Dette er den alvorligste faglige feilen i programmet. Når volumet nullstilles, kan luft aldri hope seg opp i lungen. Dermed finnes ikke luftfanging, dynamisk hyperinflasjon, auto-PEEP (PEEPi) — eller den viktigste årsaken til mislykket trigging hos KOLS-pasienten.

Programmet har en KOLS-preset med τ = R × C = 18 × 0,07 = 1,26 s. Full tømming krever 3τ ≈ 3,8 s. Ved RR 20 har pasienten ca. 2 s ekspirasjonstid. En ekte KOLS-pasient ville da hope opp luft pust for pust til trykket i brystet nådde en ny likevekt flere cmH₂O over innstilt EPAP. Det er *hele* poenget med KOLS-caset. Dagens kode kaster denne resten 20 ganger i minuttet, og lærer dermed sykepleieren at obstruktiv lungesykdom bare betyr «litt slakere flow-hale».

### Bestilling

- Innfør `state.V` = lungevolum i liter **over FRC** (volumet lungen hviler på ved trykk 0). Denne skal *aldri* settes til 0 utenom i `reset()`.
- Fjern `this.state.volume = 0` fra `_startInspiration()` helt.
- Fjern `Math.max(0, ...)`-klippingen av volum. Volumet skal kunne gå under likevektsvolumet ved aktiv ekspirasjon (trengs i fase 3).
- Elastisk tilbakefjæring: `P_el = state.V / C_L`, der `C_L` = compliance i L/cmH₂O (`compliance / 1000`).
- Ved oppstart og `reset()`: initialiser `state.V = C_L * epap` (likevekt mot innstilt EPAP).
- Innfør separate målte størrelser i stedet for å lese `state.V` direkte:
  - `VTI` — integralet av positiv lungeflow gjennom inspirasjonen (ml)
  - `VTE` — integralet av negativ lungeflow gjennom ekspirasjonen (ml, oppgis positivt)
  - `V_endExp` — `state.V` i det øyeblikket et nytt innpust starter
  - `PEEPi` — `(V_endExp / C_L) - epap`, klippet til minimum 0 (iboende PEEP i cmH₂O)
- Volumkurven som tegnes skal vise `(state.V - C_L * epap) * 1000` i ml, altså volum over innstilt EPAP-nivå. Da ligger kurven på 0 ved normal tømming, og **driver oppover fra nullinjen ved luftfanging** — som er den kliniske signaturen sykepleieren skal kjenne igjen.

---

## A2 — Ventilatoren som fysisk trykkilde

### Problem

Trykket er predikert, ikke regulert (linje 175–178). Maskinen har uendelig kapasitet: den treffer alltid IPAP presist, uansett hvor hardt pasienten drar eller hvor mye det lekker. Pasientens innsats (`P_mus`) legges dessuten til drivtrykket på linje 192 uten å etterlate noe spor i trykkurven — klinisk er det motsatte sant, og det er nettopp trykkurven man leser pustearbeid av på en respirator.

### Fysiologisk begrunnelse

En ekte NIV-maskin er en blåser med en trykkregulator. Tre fysiske begrensninger gir alle kurveformene:

1. **Regulatoren er ikke uendelig rask.** Den er en tilbakekoblingssløyfe med demping. Ber du den nå målet på 50 ms, bommer den og skyter over — *dette er trykkspiken ved rask stigetid*. Ber du den bruke 900 ms, kryper den forsiktig opp og skyter aldri over — *dette er den avrundede kurven*.
2. **Blåseren har en utgangsimpedans.** Trykket måles i masken, ikke inne i maskinen. Går det mye flow gjennom systemet, faller masketrykket litt under det maskinen sikter mot. Drar pasienten hardt, øker flowen og trykket dipper — *dette er den «slurvete» trykkurven med skulder*. Snur pasienten og puster *ut* mot maskinen, faller flowen og trykket stiger over målet — *dette er terminal-spiken*.
3. **Blåseren har en maksimal flow.** Er etterspørselen større enn kapasiteten, faller trykket sammen uansett hva regulatoren vil (flow starvation).

### Bestilling

Erstatt trykkberegningen i `simulator.js` med en fysisk ventilatormodell, skrevet som fem steg per tidssteg. Opprett et nytt `machine`-objekt for maskinkonstantene (`R_out`, `Qmax`) slik at de kan justeres uten å lete i koden.

**Steg 1 — måltrykket `P_target`.** Den eneste «ønskede» verdien:
- Ekspirasjon: `P_target = settings.epap`
- Inspirasjon: `P_target = settings.ipap`

Rampen håndteres av regulatoren i steg 2, **ikke** av en cosinuskurve her. Den gamle `smoothRise`-koden skal fjernes.

**Steg 2 — regulatoren `P_servo`, en dempet andreordens sløyfe.** Nye tilstandsvariabler `state.P_servo` og `state.dP_servo`:

```js
const omega = 3.0 / Math.max(0.03, settings.riseTime);        // rad/s
const zeta  = clamp(0.42 + 0.60 * (settings.riseTime - 0.05) / 0.85, 0.42, 1.05);
const accel = omega * omega * (P_target - state.P_servo) - 2 * zeta * omega * state.dP_servo;
state.dP_servo += accel * dt;
state.P_servo  += state.dP_servo * dt;
```

Dette er hele mekanismen bak spiken og skulderen. Kort stigetid gir høy `omega` og lav `zeta` (underdempet → oversving 15–20 %). Lang stigetid gir lav `omega` og `zeta ≈ 1` (kritisk dempet → mykt avrundet uten oversving). **Ingen hardkodede spiker noe sted.**

**Steg 3 — masketrykket `P_aw`, løst algebraisk.** Masketrykket er servoens trykk minus fallet over blåserens utgangsimpedans `R_out` (standard `1.0` cmH₂O/(L/s)):

`P_aw = P_servo - R_out * Q_total`, der `Q_total = Q_lunge + Q_lekk`

Siden `Q_lunge` selv avhenger av `P_aw`, løs likningen direkte i stedet for iterativt:

```js
// Q_lunge = (P_aw + P_mus - P_el) / R_eff
// Q_lekk  = G_leak * P_aw          (G_leak = 0 i denne fasen, se fase 3)
const num = state.P_servo - machine.R_out * (state.P_mus - P_el) / R_eff;
const den = 1 + machine.R_out / R_eff + machine.R_out * G_leak;
let P_aw = num / den;
```

I denne fasen er `state.P_mus` foreløpig den eksisterende sinusbuen og `G_leak = 0`. Begge erstattes i senere faser — men **strukturen må være på plass nå**, ellers må steg 3 skrives om senere.

**Steg 4 — flowbegrensning.** Regn ut `Q_total` med det nye `P_aw`. Hvis `Q_total > machine.Qmax` (standard `3.0` L/s ≈ 180 L/min for en NIV-blåser), beregn `P_aw` på nytt fra kapasitetsgrensen:

```js
const Q_lung_max = machine.Qmax - Q_lekk;
P_aw = P_el - state.P_mus + Q_lung_max * R_eff;
```

**Steg 5 — lungen.** Bevegelseslikningen, nå løst med *beregnet* `P_aw`:

```js
const Q_lunge = (P_aw + state.P_mus - P_el) / R_eff;   // L/s
state.V += Q_lunge * dt;                                // aldri nullstilt (A1)
```

**Krav til tilstandsobjektet:** behold `P_target`, `P_servo`, `P_aw`, `P_mus`, `P_el`, `Q_lunge`, `Q_lekk` og `Q_total` som egne felter i `state`, slik at de kan tegnes og feilsøkes hver for seg. Ikke slå dem sammen.

**Ekspirasjonen** skal bruke samme modell: sett `P_target = epap` og la servoen og utgangsimpedansen gi trykkfallet. Fjern den faste 120 ms lineære rampen på linje 225–226. Den rampen har også en selvstendig feil — den starter fra `settings.ipap` i stedet for faktisk målt trykk ved cycling, slik at kurven hopper hvis du drar i IPAP-slideren midt i et pust. Full ekspirasjonsmodell med egen ventilmotstand kommer i fase 3.

---

## A2b — Utvid stigetid-slideren

Fageksperten skriver eksplisitt at referansesimulatoren ikke klarte å fremprovosere for lang stigetid, fordi den stopper på 0,40 s — og at dette er «et viktig poeng i læringen». Dagens `sliderRiseTime` har samme grense.

### Bestilling

- Endre `sliderRiseTime` i `index.html` fra `min="50" max="400"` til **`min="50" max="900" step="25"`**.
- Oppdater etikettene i `slider-limits` til «50 ms (Bratt/rask)» og «900 ms (Svært myk/treg)».
- Legg til en visuell markering ved 400 ms som viser hvor de fleste kliniske maskiner har sin øvre grense, slik at brukeren skjønner at området over er pedagogisk demonstrasjon og ikke en vanlig innstilling.

---

## Test før du går videre

Alle tester med normal lunge (C 50 ml/cmH₂O, R 5 cmH₂O/(L/s)) med mindre annet er oppgitt.

| # | Innstilling | Forventet | Toleranse |
|---|---|---|---|
| E1 | IPAP 15 / EPAP 5, Pmus 0, stigetid 200 ms, cycling 25 % | Vt ≈ 500 ml (`C × ΔP`) | ±60 ml |
| E2 | Som E1, men C 25 | Vt ≈ 250 ml | ±40 ml |
| E6 | Stigetid 50 ms, ΔP 10 | Trykkoversving 1–3 cmH₂O over IPAP i første 50–120 ms | må være > 0,5 |
| E7 | Stigetid 900 ms, ΔP 10 | Ingen oversving; trykket når 90 % av IPAP etter ca. 0,9 s | ±0,2 s |
| E15 | Alle slidere dratt fram og tilbake i 60 s, alle presets | Ingen NaN, ingen frosne kurver, ingen konsollfeil | absolutt krav |
| E16 | Fanen i bakgrunnen i 2 min, deretter tilbake | Fortsetter normalt, ingen tidssprang i kurvene | absolutt krav |

**I tillegg, tre kvalitative kontroller:**

1. **Skulderen.** Sett Pmus til 8 cmH₂O og stigetid til 800 ms. Trykkurven skal *dippe* under målet i første halvdel av innpustet. Uteblir dippen, er `R_out` satt til 0, eller `P_mus` er ikke med i den algebraiske løsningen i steg 3.
2. **Luftfanging.** Velg KOLS-preset og sett RR til 25. Volumkurvens bunnpunkt skal krype oppover i 8–15 pust og deretter stabilisere seg på et nytt, høyere nivå. Sett RR ned til 10: baselinjen skal falle tilbake mot 0 over noen pust.
3. **Kontinuitet.** Dra i IPAP-slideren midt i et innpust. Kurven skal forbli kontinuerlig, uten hopp.

**Forventede skjønnhetsfeil etter denne fasen (ikke fiks dem nå):** frekvens og minuttvolum vil vise gale tall, fordi de fortsatt regnes ut fra triggerslideren i gammel kode. Apné-alarmen vil oppføre seg rart. Trigging og cycling er fortsatt de gamle, hardkodede variantene. Alt dette er fase 2 og 4.

**Commit:** `fase 1: fysisk trykkmodell, kontinuerlig volummodell, fast tidssteg`
