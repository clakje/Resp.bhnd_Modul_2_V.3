# FASE 7 av 7 — Opprydding og verifisering

## Kontekst

Interaktiv NIV-respiratorsimulator for opplæring av sykepleiere. Ren HTML5, CSS3 og vanilla JavaScript. Fase 1–6 er gjennomført: fysisk trykkmodell, kontinuerlig lungevolum med auto-PEEP, uavhengig pasientdrive, fysisk trigger og cycling, ekspiratorisk motstand og flowbegrensning, kontinuerlig lekkasje, målte verdier og alarmer, ny monitor med fire spor, PS- og PC-modus, ST-backup, scenarioer og frysemodus.

**Denne fasen:** restfeil (C2, C4, C10, C11, C14, C15). De fleste er sannsynligvis alt løst underveis. Oppgaven er derfor delvis **verifisering**: gå gjennom hvert punkt, bekreft at det er i orden, og rett det som ikke er.

---

## Regler for dette oppdraget

- **Gjør bare det som står i denne filen.**
- For hvert punkt: si eksplisitt om det alt er løst, eller hva du endret.
- Ingen refaktorering «på veien». Finner du noe stygt som ikke står her, list det opp på slutten i stedet.
- Behold norsk i all UI-tekst og alle kodekommentarer.

---

## C2 — Ekspirasjonens trykkfall startet fra innstilt IPAP

Opprinnelig feil i `simulator.js` linje 226: trykkfallet i ekspirasjonen brukte `this.settings.ipap` som utgangspunkt, ikke faktisk målt trykk ved cycling. Dra IPAP-slideren mens et pust pågår, og kurven hoppet.

**Verifiser:** dra i IPAP-slideren midt i et innpust, med stigetid 800 ms (så pustet er langt nok å treffe). Trykkurven skal forbli kontinuerlig, uten hopp eller knekk. Gjenta i PC-modus.

---

## C4 — Modusetiketten

`index.html` viste «Modus: Spontan / Trykkstøtte (PSV / NIV-ST)» uten at noen ST-mekanisme fantes.

**Verifiser:** `modeBadge` skal nå vise gjeldende modus riktig, inkludert om ST-backup er aktiv eller ikke. En bruker skal kunne lese av headeren om maskinen vil gripe inn ved apné. Rett teksten hvis den fortsatt er statisk.

---

## C10 — RR-slideren gjorde tre jobber

`index.html` merket `sliderRR` som «Pasientens spontane pustefrekvens», mens `simulator.js` brukte den som maskinens syklustid (linje 102), som grunnlag for måleverdier (linje 266) **og** som grense for maksimal inspirasjonstid (linje 214). Tre ulike fysiske størrelser på én slider.

**Verifiser:** disse skal nå være tre uavhengige innstillinger:

| Innstilling | Hvor | Betydning |
|---|---|---|
| `patientDrive.rrSpont` | Pasientfysiologi-fanen | Pasientens egen frekvens |
| `settings.backupRate` | Respiratorinnstillinger | Maskinens backup-frekvens (ST) |
| `settings.tiMax` | Avansert-fanen | Maskinens maksimale inspirasjonstid |

Sjekk at ingen av dem leses noe sted den ikke hører hjemme. Søk gjennom koden på `settings.rr` og fjern eventuelle rester.

---

## C11 — Pmus uten spor i trykkurven

Opprinnelig `simulator.js` linje 192: `deltaP = (paw - epap) + pmus - (V_L/C_L)`. Pasientens innsats ga gratis volum uten noe avtrykk i trykkurven. Klinisk er det motsatte sant, og det er nettopp trykkurven man leser pustearbeid av på en respirator.

**Verifiser:** sett stigetid 800 ms og Pmus 8 cmH₂O. Trykkurven skal *dippe* under måltrykket i første halvdel av innpustet. Sett Pmus til 0: dippen skal forsvinne helt. Uteblir effekten, er `P_mus` ikke med i den algebraiske løsningen for `P_aw`, eller `machine.R_out` er 0.

---

## C14 — Stille klipp

Opprinnelig kode hadde flere udokumenterte klipp: `Math.max(5, rr)` (linje 102), `Math.max(0.05, riseTime)` (linje 175), `Math.max(1, ipap)` (linje 198), `Math.max(1, rr)` (linje 275). Slike klipp skjuler grensetilfeller — programmet oppfører seg annerledes enn innstillingene sier, uten at noe forteller det.

**Bestilling:** samle alle gjenværende klipp og grenseverdier i navngitte konstanter øverst i `simulator.js`, med kommentar om hvorfor hver finnes:

```js
const GRENSER = {
  MIN_RISETIME: 0.03,      // s — under dette blir servoen numerisk ustabil
  MIN_PAW_FOR_LEAK: 0.5,   // cmH2O — unngår divisjon på ~0 i G_leak
  // osv.
};
```

Behold klippene der de er nødvendige for å unngå divisjon på null, men gjør dem synlige.

---

## C15 — Pausefunksjonen

`app.js` linje 429 hoppet over `simulator.step()` og `renderer.addSample()` ved pause, men kalte fortsatt `renderer.render()`.

**Verifiser:** frysemodus fra fase 6 skal nå håndtere dette. Sjekk at pause/frys ikke akkumulerer tid i bakgrunnen — når du fortsetter, skal kurven gå videre der den var, ikke hoppe fram.

---

## Sluttkontroll

Kjør hele `08_VALIDERING_tester.md` (alle 18 E-tester) på nytt, i én sesjon, i denne rekkefølgen: normal lunge → KOLS → restriktiv → begge moduser → alle 10 scenarioer.

Gå deretter gjennom `09_SJEKKLISTE_fagekspert.md` en siste gang. Alle seks fenomenene skal kunne fremprovoseres **med slidere alene**, uten scenarioknappene. Klarer du det, er fagekspertens tilbakemeldinger besvart i sin helhet.

**Commit:** `fase 7: opprydding, navngitte grenser, sluttverifisering`
