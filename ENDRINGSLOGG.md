# Endringslogg — NIV Respirator Simulator V.3

Dette dokumentet gir en konsis oversikt over omleggingen gjennomført i fase 1–7, med begrunnelse, sentrale funn og hva som ble endret i hver fase.

---

## Bakgrunn: Hvorfor omleggingen var nødvendig

Under revisjon og fysiologisk kvalitetssikring ble det avdekket fire kritiske systemfeil som gjorde simulatoren uegnet som troverdig pedagogisk verktøy før omleggingen:

1. **Maskelekkasje var permanent 0:** Lekkasje-slideren fantes overhodet ikke i `index.html`. Maskelekkasje forble derfor 0 i hele applikasjonen, uansett innstilling eller scenario.
2. **ST-backup var hardkodet av:** ST-backup var eksplisitt overstyrt til `false` på tre uavhengige steder i koden, slik at backup-pust aldri kunne leveres ved apné eller redusert drive.
3. **Nettleserens stille avrunding:** En scenarioverdi på 0,75 ble rundet stille til 1,0 av nettleseren fordi slideren hadde `step="0.5"`. Scenarier kjørte dermed med utilsiktede parametere uten advarsel.
4. **Kunstig starvation-sprang:** En heuristisk `starvationScale` ganget kretsimpedansen med opptil 9,5 under kraftig muskelinnsats, og kollapset momentant til 1,0 i ett enkelt tidssteg når muskelen slo av. Dette skapte et kunstig, ufysiologisk trykksprang på 5,3 cmH₂O i masketrykket.

---

## Gjennomførte faser (Sammendrag)

### Fase 1: Prosjektstruktur, opprydding og baseline-testing
- Etablert strukturert kildekodestruktur og ryddet utlagte skriptfiler til `arkiv/`.
- Kartlagt tilstand, identifisert manglende elementer og etablert innledende testmiljø.

### Fase 2: Fysikkmotor og kretsimpedans
- Implementert realistisk kretsimpedans etter Rohrer: $(R_{\text{out}} + K_{\text{out}} \cdot |Q|) \cdot Q$, kalibrert til 3,8 cmH₂O ved 60 L/min og 10,8 cmH₂O ved 120 L/min.
- Fjernet den kunstige `starvationScale`-faktoren; erstattet med ekte Rohrer-trykkfall og blåserdynamikk.
- Implementert lastkompensasjon i blåserservoen med trykkintegrator plassert utenfor stigetidsrampen.
- Innført Bernoulli rot-karakteristikk for lekkasjestrøm ($Q_{\text{leak}} = k \cdot \sqrt{\Delta P}$).

### Fase 3: UI-komplettering og kurvesannhet
- Lagt til manglende lekkasje-slider (`sliderLeak`) og maksimal inspirasjonstid (`sliderTiMax`) i `index.html`.
- Implementert overlagret visning av sant lungevolum ($V_{\text{lunge}}$) og sann lungeflow ($Q_{\text{lunge}}$) som stiplede referansekurver styrt av `showTrueCurves`.
- Synkronisert autotriggingsfysiologi ved lekkasje med refraktærtid og turbulensstøy.

### Fase 4: Pasientantropometri, Pes-spor og ST-backup
- Aktivert ekte ST-backup (backup-frekvens, apné-forsinkelse og backup-pust uten falske apné-alarmer).
- Innført 4. kurvespor for muskelinnsats / spiserørstrykk ($P_{es} / P_{mus}$) med klinisk fortegnskonvensjon (negativt utslag ved innpust).
- Etablert pasientantropometri (høyde, kjønn, beregnet idealvekt IBW) og fysiologisk Pmus-relaksasjon uten diskontinuerlige sprang.

### Fase 5: 11 Pedagogiske scenarier (Ekte parametersett)
- Forlatt skriptede kurvebaner til fordel for 11 distinkte scenarier basert på reelle fysiologiske pasientprofiler.
- Hvert scenario tildelt en spesifikk pasienthistorie og fysiologisk begrunnelse for hvorfor innstillingen er feil for nettopp denne pasienten.
- Etablert stegvalidering for alle scenarioverdier mot HTML-slidernes `step`.

### Fase 6: Validerings- og kontrakttester
- Bygget komplett testbatteri for fysikkmotoren i `test_validering.js` (18 tester, E1–E18).
- Bygget pedagogisk kontrakttestbatteri i `test_scenarier.js` (13 kontrakter, S1–S13), inkludert automatisk kryssvalidering av slidersteg mot `index.html` (S13).
- Etablert frysemodus (D6) og interaktiv kursor for inspeksjon av kurveverdier.

### Fase 7: Dokumentasjon og opprydding
- Presets harmonisert: `'restrictive'` oppdatert til midtverdi ($C=28, R=6, \text{expRatio}=1.3$), `'normal'` justert til $C=80, P_{\text{mus}}=4.0$. `'copd'` bevart som moderat profil ($C=70, R=16$) og merket «KOLS (moderat)» i UI for å sikre fullstendig tømming ved lav frekvens (valideringstest E11).
- Volumvisning forbedret: `visSanneKurver` aktiveres automatisk i scenariene for autotrigging og tidlig avslutning.
- Diskret etikett `Maskinmålt volum ≠ pasientvolum (lekkasje)` vises i volumsporet når maskinmålt og sant volum divergerer med mer enn 200 ml ved slutt-ekspirasjon.
- `README.md` fullstendig oppdatert med kurvetabell, 11 scenarier, kretsimpedans, lastkompensasjon og komplett 29-sliders tabell med step-advarsel.
