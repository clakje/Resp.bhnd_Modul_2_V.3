# Sjekkliste — fagekspertens seks fenomener

Referansefil. **Ikke en bestilling om ny kode.** Dette er kvalitetskontroll: hver tilbakemelding fra fageksperten oversatt til noe du kan prøve å fremprovosere i det ferdige programmet.

Klarer du å fremprovosere alle seks med slidere alene, er fysikkmotoren riktig. Klarer du det ikke, står det under hvert punkt hva som mangler.

**Bruk listen to ganger:** etter fase 3 (er fenomenene fysisk mulige?) og etter fase 5 (er de synlige?).

---

## 1. Stigetid for rask

**Fagekspertens observasjon:** kort stigetid skal gi en tydelig spike på begynnelsen av trykkurven, og en skarp stigning på flowkurven. Referansesimulatoren viste Vt 350 ml.

**Innstilling:** stigetid 50 ms, Pmus 8.

**Skal skje:**
- Spisst oversving 1–3 cmH₂O over innstilt IPAP i de første 50–120 ms, som faller tilbake til platået.
- Nesten vertikal forkant på flowkurven, tidlig og høy topp.
- Høy toppflow som faller raskt → cyclingterskelen nås tidligere → kortere Ti → **lavere** Vt.

**En viktig faglig nyanse:** fageksperten skriver at lavere Vt ved rask stigetid kan skyldes stagging, økt lekkasje eller at pasienten motarbeider maskinen — men **også** at rask stigetid kan gi *større* volum, siden støtten kommer raskere i gang. Begge er riktige, og de trekker i motsatt retning.

Dette er ikke en motsetning som skal løses i koden. Det er nettopp derfor stigetid er en klinisk avveining og ikke en optimal verdi. **La ikke KI-en hardkode en retning.** I den fysiske modellen faller balansen ut av seg selv, og den vipper begge veier avhengig av lekkasje, cyclingprosent, Pmus og lungemekanikk. Bruk det aktivt: la sykepleieren oppdage at samme knapp gir motsatt effekt hos to ulike pasienter.

**Hvis det ikke virker:** oversvinget mangler → `zeta`-formelen skal komme *under* 0,5 ved korte stigetider. Vt endrer seg ikke → cycling måles fortsatt mot ukorrigert flow.

---

## 2. Stigetid for lang

**Fagekspertens observasjon:** lang stigetid gjør trykkurven avrundet, og flowkurven endres tilsvarende. Referansesimulatoren viste Vt 550 ml. Hun skriver eksplisitt at *for lang stigetid ikke kan fremprovoseres, og at det er et viktig poeng i læringen* — fordi referansesimulatoren stopper på 0,40 s.

**Innstilling:** stigetid 700–900 ms, Pmus 8. (Slideren ble utvidet til 900 ms i fase 1.)

**Skal skje:**
- Jevn, avrundet trykkstigning uten oversving. Trykket når kanskje **ikke** innstilt IPAP før cycling.
- Lav og bred flowkurve i stedet for høy og spiss. Lavere toppflow → terskelen (en prosent av en lavere topp) nås senere → lengre Ti → potensielt høyere Vt.
- Med kraftig Pmus: tydelig **dipp eller skulder** tidlig i trykkurven, fordi pasienten drar mer flow enn maskinen leverer. Dette er kurven fageksperten tegnet med det trappetrinnsformede platået.

**Hvis det ikke virker:** kurven er like bratt → stigetiden brukes fortsatt i den gamle cosinusformelen i stedet for i `omega`. Ingen skulder ved høy Pmus → `R_out` er 0, eller `P_mus` er ikke med i den algebraiske løsningen for `P_aw`.

---

## 3. Inspiratorisk avslutning for tidlig

**Fagekspertens observasjon:** maskinen avslutter inspirasjonen før pasienten vil avslutte. Hun skriver at dette i referansesimulatoren **bare** kunne vises ved å trykke på en ferdiglaget «early cycling»-knapp, og bare i PC-modus — og at det burde vært mulig også i trykkstøtte. Om dobbelttriggingen skriver hun: *«Dette funker i sim.»*

**Innstilling:** cycling 80–90 %, Pmus 6–8, tiNeural 1,2 s. **I PS-modus** — det er poenget.

**Skal skje:**
- Maskinen kutter støtten mens pasientens nevrale innpust er i full gang.
- Trykket faller mot EPAP, men pasienten drar fortsatt → trykkurven **dras under EPAP-linjen** rett etter cycling.
- Flowkurven snur mot utpust og straks tilbake mot innpust — det karakteristiske M-mønsteret.
- Når refraktærtiden (0,15 s) er over og innsatsen fortsatt holder: **dobbelttrigger**. Volumkurven viser to pust stablet på hverandre uten full tømming mellom.

**Hvis det ikke virker:** cycling går ikke høyt nok → utvid slideren til 90 %. Ingen dobbelttrigging → refraktærtiden er for lang, eller `tiNeural` er for kort til at det er innsats igjen.

---

## 4. Inspiratorisk avslutning for sen

**Fagekspertens observasjon:** flowen fortsetter inn i pasientens ekspirasjon. Referansefiguren viser «terminal upstroke» — en spike helt på slutten av inspirasjonen. Hun skriver: *«Klarer ikke å fremprovosere denne spiken i simulatoren»*, og at pasienten «prøver å puste ut».

**Dette er den viktigste enkeltprøven på hele ombyggingen.** Spiken kan ikke tegnes; den må falle ut av fysikken. Mekanismen: pasienten snur og bruker ekspirasjonsmusklene mens maskinen fortsatt holder inspiratorisk trykk. Flowen inn i lungen faller mot null og videre til negativ, og siden `P_aw = P_servo − R_out·Q_total`, stiger masketrykket når flowen faller. Mindre flow ut av maskinen betyr høyere trykk i masken. Spiken *er* den fysikken, direkte.

**Innstilling:** cycling 5–10 %, pmusExp 6–10, tiNeural 0,6 s (kort nevralt innpust, lang maskininspirasjon).

**Skal skje:**
- Tydelig oppadgående spike på 2–5 cmH₂O helt mot slutten av inspirasjonen.
- Flowkurven flater ut mot nullinjen og krysser den før maskinen cycler.
- På Pes-kurven ser du årsaken direkte: pasientens kurve har snudd til negativ mens maskinen fortsatt gir støtte.

**Hvis det ikke virker:** ingen spike → `R_out` er 0, eller trykket settes fortsatt fra en rampe. Flowen krysser aldri nullinjen → `pmusExp` mangler, eller negativ `P_mus` klippes bort et sted.

---

## 5. Ineffektiv trigger

**Fagekspertens observasjon** — den mest presise i hele materialet: i referansesimulatoren er ineffektiv trigger *delvis* riktig. Trekanten kommer bare når maskinen registrerer innsats, og gir da også støtte. Men resultatet blir en pasient som *ser ut som* han ikke puster i det hele tatt. Hun kaller det «litt uheldig», og foreslår at man i så fall må kalle pasientinnsatsen en artefakt, for eksempel hjerteslag.

**Oversatt til krav:** visningen kan ikke skille *pasienten forsøker ikke* fra *pasienten forsøker, men maskinen ser det ikke*. Klinisk er dette to helt ulike situasjoner med ulike tiltak — den første krever backup-ventilasjon, den andre krever justering av trigger eller behandling av auto-PEEP. Å blande dem i undervisning er direkte skadelig.

Den ærlige løsningen er å gjøre pasientinnsatsen synlig som egen kurve. Pes-sporet er derfor **svaret på denne tilbakemeldingen**, ikke en pynteoppgave.

**Innstilling:** Pmus 2,0, trigger 4–5 L/min.

**Skal skje:**
- Pes-kurven viser regelmessige, tydelige innsatser.
- Trykk- og flowkurven viser små avtrykk av hver innsats — dipp i trykket, bule mot nullinjen i ekspiratorisk flow — men ingen pust.
- Markørene skiller på type: fylt trekant = utløste pust, åpen trekant = mislykket innsats, trekant med kryss = autotrigger.
- Asynkroni-indeksen stiger.

**Artefakt-poenget skal også kunne prøves:** sett `cardiacArtifact` til 2,5 L/min, `rrSpont` til 0 og trigger til 1,0. Maskinen skal nå trigge på hjerteslag alene, uten noen pasientinnsats — presis situasjonen fageksperten beskriver, men nå som et bevisst valgt undervisningstilfelle.

---

## 6. Autotrigger

**Fagekspertens observasjon:** *«Denne lar seg ikke gjenskape i simulatoren. Simulatoren har kun falske triggere, ingen ekte blant de falske.»*

Dette er en skarp observasjon om hva autotrigging faktisk **er**. Det er ikke at maskinen går for fort. Det er at maskinen leverer noen pust på ekte innsats og andre på ingenting — **blandet**, uforutsigbart, i samme kurvebilde. Blandingen er det diagnostiske funnet, og det som gjør at man kjenner det igjen på sengekanten.

**Innstilling:** rrSpont 12, Pmus 2,5, lekkasje 35 L/min, trigger 1 L/min.

**Skal skje:**
- Maskinfrekvensen ligger klart over pasientens egen (f.eks. 28 mot 12).
- Markørrekken viser **blandede** typer: noen fylte (ekte, assisterte pust), noen med kryss (falske).
- Volumkurven viser vekslende store og små pust, og baselinjen krøller oppover (hyperinflasjon).
- Skru lekkasjen ned til 5 L/min: falske pust forsvinner, ekte består. Skru i stedet triggeren opp til 3 L/min: samme effekt, annen mekanisme. Det er den kliniske avveiningen, gjort prøvbar.

**Hvis det ikke virker:** ingen falske pust → maskinens lekkasjeestimat er satt til den sanne lekkasjen i stedet for et tregt glidende gjennomsnitt. Alle pust er falske → `patientDrive` er ikke koblet inn i bevegelseslikningen.
