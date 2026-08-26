# Valideringstester — alle 18 samlet

Referansefil. Kan gis til KI-en sammen med hvilken som helst fase, eller brukes alene til sluttkontroll.

Testene er tallfestet med vilje. Da kan du og KI-en være uenige om noe konkret, i stedet for om hvorvidt kurven «ser riktig ut».

Alle tester med normal lunge (C 50 ml/cmH₂O, R 5 cmH₂O/(L/s)) med mindre annet er oppgitt.

| # | Innstilling | Forventet resultat | Toleranse | Testes fra fase |
|---|---|---|---|---|
| E1 | IPAP 15 / EPAP 5, Pmus 0, rrSpont 0, ST backup 15, stigetid 200 ms, cycling 25 % | Vt ≈ 500 ml (`C × ΔP`) | ±60 ml | 1 |
| E2 | Som E1, men C 25 | Vt ≈ 250 ml | ±40 ml | 1 |
| E3 | Som E1, men Pmus 5 | Vt ≈ 600–750 ml (pasienten bidrar) | retning, ikke tall | 2 |
| E4 | Som E1, men R 20 | Lengre Ti, lavere toppflow, τ = 1,0 s | τ ±0,05 s | 1 |
| E5 | C 50, R 5, lekkasje 0 | Ekspiratorisk flow faller til 5 % av topp etter ca. 3τ = 0,75 s | ±0,15 s | 3 |
| E6 | Stigetid 50 ms, ΔP 10 | Trykkoversving 1–3 cmH₂O over IPAP | må være > 0,5 | 1 |
| E7 | Stigetid 900 ms, ΔP 10 | Ingen oversving; trykket når 90 % av IPAP etter ca. 0,9 s | ±0,2 s | 1 |
| E8 | Lekkasje 30 L/min @ 10 cmH₂O, IPAP 15 | Lekkasjeflow ca. 30 × √(15/10) ≈ 37 L/min ved topptrykk | ±15 % | 3 |
| E9 | Lekkasje 30, begge volumkurver synlige | Maskinmålt volum returnerer **ikke** til null; sant lungevolum gjør det | kvalitativt | 3 |
| E10 | KOLS-preset, rrSpont 25, EPAP 5 | PEEPi stabiliserer seg på 3–8 cmH₂O etter 10–20 pust | må være > 2 | 3 |
| E11 | Som E10, men rrSpont 10 | PEEPi < 1 cmH₂O | krav | 3 |
| E12 | Pmus 2, trigger 5 L/min | Mislykkede innsatser med synlig avtrykk i flow og trykk | må forekomme | 2 |
| E13 | Cycling 85 %, Pmus 7, tiNeural 1,2 s | Dobbelttrigging oppstår | må forekomme | 2 |
| E14 | Cycling 5 %, pmusExp 8, tiNeural 0,6 s | Terminal trykkspike > 2 cmH₂O over platå | må være > 1 | 3 |
| E15 | Alle slidere fram og tilbake i 60 s, alle presets, begge moduser | Ingen NaN, ingen frosne kurver, ingen eksplosjon, ingen konsollfeil | absolutt krav | 1 |
| E16 | Fanen i bakgrunnen i 2 min, deretter tilbake | Fortsetter normalt, ingen tidssprang i kurvene | absolutt krav | 1 |
| E17 | rrSpont 0, ST av | Apné-alarm etter 15 s | ±2 s | 4 |
| E18 | rrSpont 0, ST på, backup 12 | Ingen apné-alarm, alle pust markert maskinutløste, RRtot = 12 | ±1 | 6 |

---

## De tre viktigste

**E14 — terminal-spiken.** Den beste enkeltprøven på at fysikken er ekte. Spiken kan ikke oppstå ved et uhell og kan ikke tegnes uten å hardkode den. Den oppstår fordi pasienten snur og bruker ekspirasjonsmusklene mens maskinen fortsatt holder inspiratorisk trykk: flowen inn i lungen faller mot null og videre til negativ, og siden masketrykket er servotrykket minus fallet over utgangsimpedansen (`P_aw = P_servo − R_out·Q_total`), stiger masketrykket når flowen faller. Mindre flow ut av maskinen gir høyere trykk i masken. Får du spiken, har du en fungerende fysikkmotor.

**E10/E11 — auto-PEEP.** Prøven på at volummodellen er kontinuerlig. At samme pasient hyperinflateres ved høy frekvens og tømmer seg ved lav, uten at noen har rørt annet enn frekvensen, er hele KOLS-caset.

**E15/E16 — stabilitet.** Kjedelig, men absolutt. En numerisk ustabilitet i den nye trykkmodellen ser bedragersk ut som fysiologi: «spontane» svingninger kan lett forveksles med autotrigging, og da tror du at programmet virker når det ikke gjør det.
