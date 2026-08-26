# Mekanisk Ventilator Simulator (NIV / Respirator) - Sandkasse

En interaktiv, sanntids simulator bygget for opplæring av sykepleiere, leger og helsepersonell i **Non-Invasiv Ventilasjon (NIV)** og respiratorbehandling. Simulatoren visualiserer trykk-, flow-, volum- og spiserørskurver med høy presisjon og gir umiddelbar pedagogisk feedback på pasient-respirator interaksjon og asynkroni.

---

## 🎨 Kurvefarger og Visning (Hamilton / Klinisk standard)

| Spor | Parameter | Kurvefarge | Enhet | Beskrivelse |
|---|---|---|---|---|
| **1** | **Luftveistrykk ($P_{aw}$)** | 🟨 **Gul** (`#eab308`) | $\text{cmH}_2\text{O}$ | Trykk levert ved maske/luftvei (IPAP, EPAP, trykkstigning) |
| **2** | **Flow ($\dot{V}$)** | 🟧 **Oransje** (`#f97316`) | $\text{L/min}$ | Gasshastighet inn/ut av pasienten (med nullinje og integrert areal) |
| **3** | **Tidalvolum ($V$)** | 🟦 **Cyan** (`#06b6d4`) | $\text{ml}$ | Levert og ekspirert luftvolum per pust |
| **4** | **Muskelinnsats ($P_{es} / P_{mus}$)** | 🟪 **Magenta / Lilla** (`#d946ef`) | $\text{cmH}_2\text{O}$ | Pasientens nevrale pustearbeid (valgfritt 4. spor) |

---

## 🧮 Fysiologisk og Fysisk Modell

Simulatoren løser bevegelsesligningen for lungemekanikk i sanntid med 1000 sub-steps per sekund ($dt = 0.001\text{ s}$):

$$P_{aw}(t) + P_{mus}(t) = \frac{V(t)}{C} + \dot{V}(t) \cdot R$$

### Avanserte Fysiologiske Moduler:
- **Tidskonstant ($\tau = R \times C$):** Bestemmer fyllings- og tømmingstid for lungene.
- **Ekspiratorisk motstand & Flowbegrensning (KOLS):** Økt ekspiratorisk motstand og dynamisk luftveiskollaps gir ekspiratorisk flowbegrensning og forlenget ekspirasjonstid.
- **Auto-PEEP ($PEEP_i$) & Luftfanging:** Ufullstendig ekspirasjon før neste innpust bygger opp et indre overtrykk i alveolene som pasienten må overvinne før trigging kan oppstå.
- **Maskelekkasje:** Realistisk lekkasjestrøm ($Q_{\text{leak}} = k \cdot \sqrt{\Delta P}$) med flow-offset, volumtap ($\Delta V$) og kompensasjon.
- **Pustevariasjon & Kardiogene Artefakter:** Naturlig biologisk variasjon i frekvens og innsats, samt flow-oscillasjoner fra hjerteslag.

---

## 🎛️ Ventilasjonsmoduser

### 1. PS (Trykkstøtte / PSV / NIV-ST)
- **Inspirasjon:** Utløses av pasientens innsats via flow- eller trykktrigger.
- **Avslutning (Cycling):** Pasientstyrt via flow-cycling (f.eks. ved 25 % av toppflow).
- **Sikkerhet:** $T_{i,max}$ avbryter innpustet dersom stor lekkasje hindrer flow-cycling.
- **NIV-ST Backup:** Ved fravær av pasientinnsats leverer maskinen tidsstyrte backup-pust (■) med innstilt backup-frekvens.

### 2. PC (Trykkontroll / PCV / A/C)
- **Inspirasjon:** Starter på fast frekvens eller assistert ved pasienttrigger.
- **Avslutning:** Maskinstyrt utelukkende på tid ($T_i$, innstillbar 0.6–2.0 s). Flow-cycling er inaktiv.

---

## ⚡ 10 Asynkroni- & Læringsscenarioer (Ekte parametersett)

Alle scenarioer i simulatoren er **ekte parametersett** — ingen skriptede kurver. Fysikkmotoren genererer dynamikken:

1. **Godt tilpasset NIV:** Referansebilde for harmonisk ventilasjon (100 % ▲ assisterte pust).
2. **Trigger for treg:** Høy triggerterskel gir mislykkede innsatser (△) og fall i % Spont.
3. **Autotrigging:** Lekkasje og følsom trigger trigger maskinen uten pasientinnsats (⨂).
4. **Stigetid for treg:** Langsom trykkstigning (800 ms) gir markant trykkdipp ved kraftig pasientdrive.
5. **Stigetid for rask:** Aggressiv trykkstigning (50 ms) skaper trykkoversving (spike) og for tidlig avslutning.
6. **For tidlig avslutning:** Høy cycling (85 %) avslutter før pasienten er ferdig, med fare for dobbelttrigging.
7. **For sen avslutning:** Lav cycling (5 %) tvinger pasienten til å puste ut mot maskinen (terminal trykk-spike).
8. **KOLS med auto-PEEP:** Takypné og luftveismotstand gir ufullstendig tømming og auto-PEEP > 5 cmH₂O.
9. **Hyperkapnisk KOLS, behandlet:** Optimalisert EPAP (8 cmH₂O) og IPAP (20 cmH₂O) løser auto-PEEP og gjenoppretter trigging.
10. **Redusert respirasjonsdrive:** Svak egenrespirasjon overtas sømløst av NIV-ST backup (■) uten apné-alarm.

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
   git clone https://github.com/kokkos88/Resp.bhnd_Modul_2_V.1.git
   ```
2. Åpne `index.html` direkte i nettleseren, eller kjør en lokal webserver:
   ```bash
   python -m http.server 8080
   ```
3. Naviger til `http://localhost:8080`.
