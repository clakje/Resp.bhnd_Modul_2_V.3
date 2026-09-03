# Mekanisk Ventilator Simulator (NIV / Respirator) - Sandkasse

En interaktiv, sanntids simulator bygget for opplæring av sykepleiere, leger og helsepersonell i **Non-Invasiv Ventilasjon (NIV)** og respiratorbehandling. Simulatoren visualiserer trykk-, flow-, volum- og spiserørskurver med høy presisjon og gir umiddelbar pedagogisk feedback på pasient-respirator interaksjon og asynkroni.

---

## 🎨 Kurvefarger og Visning (Hamilton / Klinisk standard)

| Spor | Parameter | Kurvefarge | Enhet | Beskrivelse |
|---|---|---|---|---|
| **1** | **Luftveistrykk ($P_{aw}$)** | 🟨 **Gul** (`#eab308`) | $\text{cmH}_2\text{O}$ | Trykk levert ved maske/luftvei (IPAP, EPAP, trykkstigning) |
| **2** | **Flow ($\dot{V}$)** | 🟩 **Klinisk Grønn** (`#22c55e`) | $\text{L/min}$ | Gasshastighet inn/ut av pasienten (med nullinje og integrert areal) |
| **3** | **Tidalvolum ($V$)** | 🟦 **Cyan** (`#06b6d4`) | $\text{ml}$ | Levert og ekspirert luftvolum per pust (maskinmålt $V_{\text{meas}}$ og overlagret sant $V_{\text{lunge}}$) |
| **4** | **Muskelinnsats ($P_{es} / P_{mus}$)** | 🟪 **Magenta / Lilla** (`#d946ef`) | $\text{cmH}_2\text{O}$ | Pasientens nevrale pustearbeid (valgfritt 4. spor, slås på med avkrysningsboks). Fortegnet følger klinisk konvensjon: inspiratorisk innsats gir fall i kurven. |

---

## 🧮 Fysiologisk og Fysisk Modell

Simulatoren løser bevegelsesligningen for lungemekanikk i sanntid med 1000 sub-steps per sekund ($dt = 0.001\text{ s}$):

$$P_{aw}(t) + P_{mus}(t) = \frac{V(t)}{C} + \dot{V}(t) \cdot R$$

### Avanserte Fysiologiske Moduler:
- **Tidskonstant ($\tau = R \times C$):** Bestemmer fyllings- og tømmingstid for lungene.
- **Ekspiratorisk motstand & Flowbegrensning (KOLS):** Økt ekspiratorisk motstand og dynamisk luftveiskollaps gir ekspiratorisk flowbegrensning og forlenget ekspirasjonstid.
- **Auto-PEEP ($PEEP_i$) & Luftfanging:** Ufullstendig ekspirasjon før neste innpust bygger opp et indre overtrykk i alveolene som pasienten må overvinne før trigging kan oppstå.
- **Maskelekkasje:** Realistisk lekkasjestrøm ($Q_{\text{leak}} = k \cdot \sqrt{\Delta P}$) med Bernoulli rot-karakteristikk, flow-offset, volumtap og maskinkompensasjon.
- **Pustevariasjon & Kardiogene Artefakter:** Naturlig biologisk variasjon i frekvens og innsats, samt flow-oscillasjoner fra hjerteslag.
- **Kretsimpedans:** Trykkfallet mot masken modelleres etter Rohrer som $(R_{\text{out}} + K_{\text{out}} \cdot |Q|) \cdot Q$. Kalibrert til 3,8 $\text{cmH}_2\text{O}$ ved 60 L/min og 10,8 $\text{cmH}_2\text{O}$ ved 120 L/min. Det er dette trykkfallet i krets og maske som skaper reell flow starvation og skallopering under kraftig pasientinnsats.
- **Lastkompensasjon:** Blåseren måler masketrykket kontinuerlig og hever utgangstrykket til referansebanen nås, slik virkelige NIV-ventilatorer gjør. Integratoren er lagt utenfor stigetidsrampen, slik at den kompenserer effektivt for pasientlast uten å forstyrre den tilsiktede trykkstigningen.

---

## 🎛️ Ventilasjonsmoduser

### 1. BPAP / PS (Trykkstøtte / PSV / NIV-ST)
- **Inspirasjon:** Utløses av pasientens innsats via flow- eller trykktrigger.
- **Avslutning (Cycling):** Pasientstyrt via flow-cycling (f.eks. ved 25 % av toppflow).
- **Sikkerhet:** $T_{i,\text{max}}$ avbryter innpustet dersom stor lekkasje hindrer flow-cycling.
- **NIV-ST Backup:** Ved fravær av pasientinnsats leverer maskinen tidsstyrte backup-pust (■) med innstilt backup-frekvens.

### 2. PC (Trykkontroll / PCV / A/C)
- **Inspirasjon:** Starter på fast frekvens eller assistert ved pasienttrigger.
- **Avslutning:** Maskinstyrt utelukkende på tid ($T_i$, innstillbar 0.6–2.0 s). Flow-cycling er inaktiv.

---

## ⚡ 11 Asynkroni- & Læringsscenarioer (Ekte parametersett)

Alle scenarioer i simulatoren er **ekte parametersett** — ingen skriptede kurver. Fysikkmotoren genererer dynamikken fritt:

> **Designprinsipp:** Hvert scenario har sin egen tilpassede pasient (antropometri, lungecompliance, luftveismotstand, nevral drive og tidskonstant). Innstillingen som er feil i ett scenario, ville vært fullt forsvarlig eller optimal hos en annen pasient — det er kombinasjonen av pasientens fysiologi og maskinens parametere som skaper asynkronien. Merk at KOLS-scenariene (9 og 10) bruker en mer alvorlig eksaserbasjonsprofil ($C=68, R=22, \text{expRatio}=2.0$) enn den moderate hurtigvalg-preset-en «KOLS (moderat)» ($C=70, R=16, \text{expRatio}=1.4$).

1. **Godt tilpasset NIV** (Kvinne 68 år, kardiogent lungeødem i bedring): Riktig innstilt referansescenario (100 % ▲ assisterte pust, $\text{auto-PEEP} = 0$, asynkroni-indeks 0 %).
2. **Lungefrisk, lett sedert** (Mann 54 år, laparoskopisk operert, normale lunger): Riktig innstilt ved lav respiratorisk drive (rolig pustemønster, moderat $\Delta P = 5\text{ cmH}_2\text{O}$ gir adekvat tidalvolum).
3. **For ufølsom trigger** (Mann 74 år, pneumoni med uttalt muskelsvekkelse): Flow-trigger satt for høyt (5,0 L/min) i forhold til pasientens svake innsats (3–5 L/min) gir mislykkede innsatser (△) og tapt assistanse.
4. **Autotrigging** (Mann 61 år, nesesonde under maske med lekkasje 45 L/min): Flow-trigger for følsom (1,0 L/min) i kombinasjon med kraftig lekkasje og lav drive trigger falske innpust (⨂) uten pasientinnsats, og innpust avsluttes på $T_{i,\text{max}}$.
5. **Stigetid for treg** (Mann 45 år, alvorlig pneumoni med kraftig drive og kort nevral $T_i$): Stigetid for langsom (750 ms) i forhold til pasientens raske flowbehov gir flow starvation, skallopering og kuppelformet trykkurve.
6. **Stigetid for rask** (Mann 58 år, obesitas-hypoventilasjon med stiv brystvegg og høy impedans): Stigetid for bratt (50 ms) gir markant trykkoversving ($+1{,}3\text{ cmH}_2\text{O}$ over IPAP), flowspiss og økt maskelekkasje.
7. **For tidlig avslutning** (Kvinne 39 år, viral ARDS-lignende pneumoni med lang nevral $T_i$): Cycling satt for høyt (50 %) kutter maskinstøtten etter 0,5 s mens pasientens nevrale innpust varer 1,35 s, noe som fremprovoserer dobbelttrigging og volumstabling.
8. **For sen avslutning** (Mann 71 år, KOLS med lang tidskonstant): Cycling satt for lavt (5 %) forlenger maskinpustet til 2,3 s mens pasienten presser aktivt med bukmuskler for å puste ut (terminal trykkstigning, I:E nær 1:1).
9. **KOLS med auto-PEEP** (Kvinne 66 år, alvorlig KOLS-eksaserbasjon, takypnoisk 28/min): EPAP for lavt (4 $\text{cmH}_2\text{O}$) motvirker ikke ekspiratorisk luftveiskollaps og dynamisk hyperinflasjon ($\text{PEEP}_i \approx 4{,}6\text{ cmH}_2\text{O}$ skaper mislykkede triggere △).
10. **Hyperkapnisk KOLS, behandlet** (Samme kvinne 66 år, optimalisert): Riktig innstilt (EPAP hevet til 9 $\text{cmH}_2\text{O}$ for å balansere auto-PEEP, IPAP hevet til 24 for å beholde $\Delta P = 15$, cycling 30 % gir tilstrekkelig ekspirasjonstid).
11. **Redusert respirasjonsdrive** (Mann 79 år, CO₂-narkose, bradypnoisk 5/min): Pasientinnsats for svak og sjelden til å trigge; ST-backup (14/min) overtar ventilasjonen med tidsstyrte pust (■) uten apné-alarm.

---

## 🎚️ Slidertabell og Parametergrenser

> [!WARNING]
> **Advarsel om slider-steg:** En scenarioverdi som ikke treffer et definert steg i nettleserens slider (`min`, `max`, `step`), rundes stille av nettleseren. Dette har tidligere forårsaket at et scenario kjørte med utilsiktede parametere. Ved opprettelse eller endring av scenarier må alle numeriske verdier treffe et eksakt gyldig slidersteg. Kontrakttesten `node test_scenarier.js` (test S13) validerer dette automatisk mot `index.html`.

| Slider ID | Parameter / Beskrivelse | Min | Maks | Steg (`step`) |
|---|---|---|---|---|
| `sliderIpap` | IPAP (Inspiratorisk trykk / PC over PEEP) | 8 | 30 | 1 |
| `sliderEpap` | EPAP / PEEP (Ekspiratorisk trykk) | 3 | 15 | 1 |
| `sliderTiSet` | $T_{i,\text{innstilt}}$ (Inspirasjonstid ved PC-modus) | 0.6 | 2.0 | 0.05 |
| `sliderBackupRate` | Backup-frekvens (ST-modus) | 0 | 30 | 1 |
| `sliderFio2` | $\text{FiO}_2$ (Oksygenprosent) | 21 | 100 | 1 |
| `sliderRR` | Frekvens (PC-modus) | 8 | 35 | 1 |
| `sliderTrigger` | Inspirasjonstrigger (Flow: 1–5 L/min, Trykk: 0.2–5 cmH₂O) | 1 (0.2) | 5 | 0.5 (0.1) |
| `sliderCycling` | Avslutningskriterium / Cycling (% av toppflow) | 5 | 90 | 5 |
| `sliderTiMax` | $T_{i,\text{max}}$ (Maksimal inspirasjonstid ved PS) | 0.8 | 3.0 | 0.1 |
| `sliderRiseTime` | Stigetid / Rise time (ms) | 50 | 900 | 25 |
| `sliderLeak` | Maskelekkasje ved 10 cmH₂O (L/min) | 0 | 60 | 5 |
| `sliderHeight` | Pasienthøyde (for IBW-beregning) (cm) | 140 | 205 | 1 |
| `sliderRrSpont` | Spontanfrekvens ($rr_{\text{spont}}$) (/min) | 0 | 40 | 1 |
| `sliderPmus` | Nevral muskelkraft ($P_{\text{mus,max}}$) (cmH₂O) | 0 | 20 | 0.5 |
| `sliderTiNeural` | Nevral inspirasjonstid ($T_{i,\text{neural}}$) (s) | 0.4 | 1.6 | 0.05 |
| `sliderPmusExp` | Aktiv ekspirasjonskraft ($P_{\text{mus,exp}}$) (cmH₂O) | 0 | 10 | 0.5 |
| `sliderFlowLimitation` | Dynamisk flowbegrensning (Starling/KOLS) | 0 | 1 | 0.05 |
| `sliderExpRatio` | Ekspiratorisk motstandsforhold ($R_{\text{exp}} / R_{\text{insp}}$) | 1.0 | 3.0 | 0.1 |
| `sliderVariability` | Biologisk pustevariasjon (%) | 0 | 30 | 1 |
| `sliderCardiacArtifact` | Kardiogent artefakt / pulssvingninger (L/min) | 0 | 3 | 0.1 |
| `sliderCompliance` | Lungecompliance ($C$) (ml/cmH₂O) | 15 | 100 | 1 |
| `sliderResistance` | Luftveismotstand ($R_{\text{insp}}$) (cmH₂O/(L/s)) | 2 | 25 | 1 |
| `sliderApneaDelay` | Apné-forsinkelse før alarm (s) | 5 | 30 | 1 |
| `sliderAlarmLeak` | Høy lekkasje alarmgrense (L/min eller %) | 10 | 60 (80) | 5 |
| `sliderAlarmLowVt` | Lavt tidalvolum alarmgrense (ml) | 100 | 600 | 25 |
| `sliderAlarmHighVt` | Høyt tidalvolum alarmgrense (ml) | 300 | 1000 | 25 |
| `sliderAlarmLowRr` | Lav respirasjonsfrekvens alarmgrense (/min) | 0 | 25 | 1 |
| `sliderAlarmHighRr` | Høy respirasjonsfrekvens alarmgrense (/min) | 20 | 50 | 1 |
| `sliderAlarmHighPpeak` | Høy topptrykk ($P_{\text{peak}}$) alarmgrense (cmH₂O) | 0 | 50 | 1 |

---

## 📸 Undervisnings- og Fryseverktøy

- **❄️ Frys / Pause:** Stopper bølgebevegelsen og fryser kurvebildet.
- **🔍 Sanntids Kursor:** Beveg musen over kurvene i fryst tilstand for å lese av eksakte tallverdier ($P_{aw}$, $\dot{V}$, $V$, $P_{es}$) og tidspunkt.
- **📸 Kopier Skjermbilde:** Ett-klikks eksport av monitoren direkte til utklippstavlen for innliming i Rise 360, PowerPoint eller Word.
- **💡 Vis Fasit:** Overlagrer pedagogiske ringer, piler og funnbeskrivelser for aktivt scenario.

---

## 🚀 Kjøre lokalt

Simulatoren er bygget i ren Vanilla HTML5, CSS3 og JavaScript uten eksterne avhengigheter.

1. Klon repoet:
   ```bash
   git clone https://github.com/clakj/Resp.bhnd_Modul_2_V.3.git
   ```
2. Åpne `index.html` direkte i nettleseren, eller kjør en lokal webserver:
   ```bash
   python -m http.server 8080
   ```
3. Naviger til `http://localhost:8080`.

---

## Tester

```bash
node test_validering.js    # fysikkmotoren (E1–E18)
node test_scenarier.js     # scenariene som pedagogisk kontrakt (S1–S13)
```

Begge må passere før endringer i `simulator.js` eller i `SCENARIOS` merges.
Scenariotestene leser `SCENARIOS` direkte fra `app.js` og slidergrensene
direkte fra `index.html`, så de følger endringer der automatisk.
