/**
 * app.js - Hovedapplikasjon og kontrollerkobling for NIV Simulatoren (Hamilton-stil)
 * 
 * FASE 6:
 * - D1: PC-modus (trykkontroll) vs PS-modus (trykkstøtte) med modusvelger, fast Ti, Ti-slider og grået cycling-slider
 * - D2: NIV-ST Backup-frekvens, maskinutløste pust (■), % spontane pust, og apné-alarm skille
 * - D4: 10 asynkroni- og læringsscenarioer som EKTE parametersett med 3-punkts pedagogisk forklaring
 * - D6: Frys- og pek undervisningsmodus: kursor med sanntidsverdier for alle 4 spor ved hover, «Kopier bilde» og «Vis fasit»-annotasjonslag
 * - C12: Uavhengig regelbasert innsiktsboks
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialiser kjernekomponenter
    const simulator = new VentilatorSimulator();
    const renderer = new WaveformRenderer('waveformCanvas');

    let isPaused = false;
    let lastTimestamp = performance.now();
    let currentGender = 'male';
    let currentScenarioKey = 'wellAdjusted';
    let isScenarioActive = false;

    // 2. DOM Referanser
    // Header & Status
    const modeBadge = document.getElementById('modeBadge');
    const toastNotification = document.getElementById('toastNotification');
    const btnCopyScreenshot = document.getElementById('btnCopyScreenshot');
    const btnToggleAnnotations = document.getElementById('btnToggleAnnotations');
    const textToggleAnnotations = document.getElementById('textToggleAnnotations');

    let hasShownSettingChangedToast = false;

    function setAnnotationButtonState(active) {
        if (btnToggleAnnotations) {
            btnToggleAnnotations.classList.toggle('active', !!active);
        }
        if (textToggleAnnotations) {
            textToggleAnnotations.textContent = active ? 'Skjul fasit' : 'Vis fasit';
        }
        if (renderer) {
            renderer.showAnnotations = !!active;
        }
    }

    // Alarm-banner & Alarm-liste (C3)
    const alarmBanner = document.getElementById('alarmBanner');
    const alarmList = document.getElementById('alarmList');

    // Primære måleverdier (D5)
    const valPpeak = document.getElementById('valPpeak');
    const valVt = document.getElementById('valVt');
    const valMv = document.getElementById('valMv');
    const valRR = document.getElementById('valRR');

    // Målekort (for styling ved alarm)
    const cardMetricPpeak = document.getElementById('cardMetricPpeak');
    const cardMetricVt = document.getElementById('cardMetricVt');
    const cardMetricMv = document.getElementById('cardMetricMv');
    const cardMetricRR = document.getElementById('cardMetricRR');

    // Sekundære måleverdier (D5)
    const dispPeepPeepi = document.getElementById('dispPeepPeepi');
    const dispPeepTot = document.getElementById('dispPeepTot');
    const dispLeakSec = document.getElementById('dispLeakSec');
    const dispLeakStatus = document.getElementById('dispLeakStatus');

    // Modusvelger & Kort (D1)
    const selectMode = document.getElementById('selectMode');
    const cardPressure = document.getElementById('cardPressure');
    const labelPressureMode = document.getElementById('labelPressureMode');
    const sublabelPressureMode = document.getElementById('sublabelPressureMode');
    const labelDeltaPInfo = document.getElementById('labelDeltaPInfo');
    const cardTiSet = document.getElementById('cardTiSet');
    const labelTiSet = document.getElementById('labelTiSet');
    const sublabelTiSet = document.getElementById('sublabelTiSet');
    const labelTiSetStatus = document.getElementById('labelTiSetStatus');

    // ST-backup kontroller (D2)
    const cardStBackup = document.getElementById('cardStBackup');
    const checkStActive = document.getElementById('checkStActive');

    // Cycling & TiMax kort (Fane 3)
    const cardCycling = document.getElementById('cardCycling');
    const labelCyclingStatus = document.getElementById('labelCyclingStatus');
    const cardTiMax = document.getElementById('cardTiMax');

    // Trigger-modus knapper og etiketter
    const btnTrigModeFlow = document.getElementById('btnTrigModeFlow');
    const btnTrigModePressure = document.getElementById('btnTrigModePressure');
    const triggerTitle = document.getElementById('triggerTitle');
    const triggerSublabel = document.getElementById('triggerSublabel');
    const triggerLimitMin = document.getElementById('triggerLimitMin');
    const triggerLimitMid = document.getElementById('triggerLimitMid');
    const triggerLimitMax = document.getElementById('triggerLimitMax');

    // Pasientprofil & Kjønnsknapper (D5)
    const btnGenderMale = document.getElementById('btnGenderMale');
    const btnGenderFemale = document.getElementById('btnGenderFemale');
    const badgeIbwCalc = document.getElementById('badgeIbwCalc');

    // Avkrysningsboks for pedagogisk lungekurvevisning (A7)
    const checkShowTrueCurves = document.getElementById('checkShowTrueCurves');

    // Monitor verktøylinje (C8, C9)
    const btnSweep15 = document.getElementById('btnSweep15');
    const btnScaleLocked = document.getElementById('btnScaleLocked');
    const btnScaleAuto = document.getElementById('btnScaleAuto');

    // Slidere
    const sliders = {
        ipap: document.getElementById('sliderIpap'),
        epap: document.getElementById('sliderEpap'),
        tiSet: document.getElementById('sliderTiSet'),
        backupRate: document.getElementById('sliderBackupRate'),
        rr: document.getElementById('sliderRR'),
        fio2: document.getElementById('sliderFio2'),
        trigger: document.getElementById('sliderTrigger'),
        compliance: document.getElementById('sliderCompliance'),
        resistance: document.getElementById('sliderResistance'),
        flowLimitation: document.getElementById('sliderFlowLimitation'),
        expRatio: document.getElementById('sliderExpRatio'),
        rrSpont: document.getElementById('sliderRrSpont'),
        pmus: document.getElementById('sliderPmus'),
        tiNeural: document.getElementById('sliderTiNeural'),
        pmusExp: document.getElementById('sliderPmusExp'),
        variability: document.getElementById('sliderVariability'),
        cardiacArtifact: document.getElementById('sliderCardiacArtifact'),
        cycling: document.getElementById('sliderCycling'),
        tiMax: document.getElementById('sliderTiMax'),
        riseTime: document.getElementById('sliderRiseTime'),
        leak: document.getElementById('sliderLeak'),
        
        // Fase 4: Pasientprofil og Alarmer
        height: document.getElementById('sliderHeight'),
        apneaDelay: document.getElementById('sliderApneaDelay'),
        alarmLeak: document.getElementById('sliderAlarmLeak'),
        alarmLowVt: document.getElementById('sliderAlarmLowVt'),
        alarmHighVt: document.getElementById('sliderAlarmHighVt'),
        alarmLowRr: document.getElementById('sliderAlarmLowRr'),
        alarmHighRr: document.getElementById('sliderAlarmHighRr'),
        alarmHighPpeak: document.getElementById('sliderAlarmHighPpeak')
    };

    // Badges
    const badges = {
        ipap: document.getElementById('badgeIpap'),
        epap: document.getElementById('badgeEpap'),
        tiSet: document.getElementById('badgeTiSet'),
        backupRate: document.getElementById('badgeBackupRate'),
        rr: document.getElementById('badgeRR'),
        fio2: document.getElementById('badgeFio2'),
        trigger: document.getElementById('badgeTrigger'),
        compliance: document.getElementById('badgeCompliance'),
        resistance: document.getElementById('badgeResistance'),
        flowLimitation: document.getElementById('badgeFlowLimitation'),
        expRatio: document.getElementById('badgeExpRatio'),
        rrSpont: document.getElementById('badgeRrSpont'),
        pmus: document.getElementById('badgePmus'),
        tiNeural: document.getElementById('badgeTiNeural'),
        pmusExp: document.getElementById('badgePmusExp'),
        variability: document.getElementById('badgeVariability'),
        cardiacArtifact: document.getElementById('badgeCardiacArtifact'),
        cycling: document.getElementById('badgeCycling'),
        tiMax: document.getElementById('badgeTiMax'),
        riseTime: document.getElementById('badgeRiseTime'),
        leak: document.getElementById('badgeLeak'),

        // Fase 4 Badges & Labels
        height: document.getElementById('badgeHeight'),
        apneaDelay: document.getElementById('badgeApneaDelay'),
        alarmLeak: document.getElementById('badgeAlarmLeak'),
        alarmLowVt: document.getElementById('badgeAlarmLowVt'),
        alarmHighVt: document.getElementById('badgeAlarmHighVt'),
        alarmLowRr: document.getElementById('badgeAlarmLowRr'),
        alarmHighRr: document.getElementById('badgeAlarmHighRr'),
        alarmHighPpeak: document.getElementById('badgeAlarmHighPpeak')
    };

    // Alarmgrenser etiketter og enhetsvelger
    const labelAlarmLowVtVal = document.getElementById('labelAlarmLowVtVal');
    const labelAlarmHighVtVal = document.getElementById('labelAlarmHighVtVal');
    const labelAlarmLowRrVal = document.getElementById('labelAlarmLowRrVal');
    const labelAlarmHighRrVal = document.getElementById('labelAlarmHighRrVal');

    const btnLeakUnitLmin = document.getElementById('btnLeakUnitLmin');
    const btnLeakUnitPercent = document.getElementById('btnLeakUnitPercent');
    const leakLimitMin = document.getElementById('leakLimitMin');
    const leakLimitMid = document.getElementById('leakLimitMid');
    const leakLimitMax = document.getElementById('leakLimitMax');
    const leakSublabel = document.getElementById('leakSublabel');
    const btnAlarmLeakStepDown = document.getElementById('btnAlarmLeakStepDown');
    const btnAlarmLeakStepUp = document.getElementById('btnAlarmLeakStepUp');

    // Trigger-samkjøringsfelter (UI/UX)
    const triggerSyncBox = document.getElementById('triggerSyncBox');
    const triggerSyncBadge = document.getElementById('triggerSyncBadge');
    const syncTriggerReq = document.getElementById('syncTriggerReq');
    const syncPatientEffort = document.getElementById('syncPatientEffort');
    const triggerGaugeFill = document.getElementById('triggerGaugeFill');
    const triggerGaugeThreshold = document.getElementById('triggerGaugeThreshold');
    const triggerSyncMessage = document.getElementById('triggerSyncMessage');

    // Knapper
    const btnPause = document.getElementById('btnPause');
    const pauseIcon = document.getElementById('pauseIcon');
    const pauseText = document.getElementById('pauseText');
    const btnReset = document.getElementById('btnReset');

    // Presets (Kliniske pasientprofiler)
    const presetBtns = {
        normal: document.getElementById('presetNormal'),
        copd: document.getElementById('presetCopd'),
        restrictive: document.getElementById('presetRestrictive')
    };

    // Scenarioknapper (D4: Asynkroni- & Læringsscenarioer)
    const scenarioBtns = {
        wellAdjusted: document.getElementById('scenWellAdjusted'),
        mildlySedated: document.getElementById('scenMildlySedated'),
        slowTrigger: document.getElementById('scenSlowTrigger'),
        autotrigger: document.getElementById('scenAutotrigger'),
        slowRise: document.getElementById('scenSlowRise'),
        fastRise: document.getElementById('scenFastRise'),
        earlyCycle: document.getElementById('scenEarlyCycle'),
        lateCycle: document.getElementById('scenLateCycle'),
        copdAutoPeep: document.getElementById('scenCopdAutoPeep'),
        copdAdjusted: document.getElementById('scenCopdAdjusted'),
        lowDrive: document.getElementById('scenLowDrive')
    };

// Innsiktspanel
    const insightTau = document.getElementById('insightTau');
    const insightDeltaP = document.getElementById('insightDeltaP');
    const insightTheoVt = document.getElementById('insightTheoVt');
    const insightCycleReason = document.getElementById('insightCycleReason');
    const insightText = document.getElementById('insightText');

    // =========================================================================
    // SCENARIO-DEFINISJONER v4 — EGEN TILPASSET PASIENT PER SCENARIO
    //
    // Prinsipp: respiratoren er den samme maskinen i alle scenarier. Det som
    // varierer er (a) hvilken pasient som ligger i den, og (b) hvilken
    // innstilling som er feil FOR NETTOPP DEN PASIENTEN.
    //
    // Alle verdier er verifisert mot slidernes min/max/step i index.html.
    // Alle måletall i kommentarene er målt over 60 s i fysikkmotoren.
    //
    // FORUTSETNINGER (se Pasientdesign_Simulator_V4.md):
    //   Trinn 1: sliderLeak og sliderTiMax må finnes i index.html;
    //            stActive må leses fra checkStActive, ikke hardkodes til false.
    //   Trinn 2: motorendringene A–E må være på plass.
    // =========================================================================

    // ADVARSEL: whatYouSee-tekstene inneholder konkrete måletall som er målt mot
    // disse parameterverdiene. Endrer du et parameter, må teksten oppdateres —
    // eller tallet fjernes fra teksten. Kontrakttestene i test_scenarier.js
    // (fase 6) fanger avvik automatisk.
    const SCENARIOS = {

        // ---------------------------------------------------------------------
        // 1. REFERANSE — riktig innstilt
        // Målt (median av 5 kjøringer): Vt 475 ml (7,2 ml/kg) · RRtot 16 · Ti 0,85 s · PEEPi 0,1 · fanget 100 % · AI 0 %
        // ---------------------------------------------------------------------
        wellAdjusted: {
            name: 'Godt tilpasset NIV',
            badge: '✅ Referanse',
            pasient: 'Kvinne 68 år, kardiogent lungeødem i bedring. Våken, samarbeidende.',
            mode: 'PS', ipap: 11, epap: 6, rr: 16, fio2: 35,
            riseTime: 150, cycling: 25, tiSet: 1.0, tiMax: 2.0, leak: 5,
            triggerMode: 'flow', triggerVal: 2.0, stActive: false, backupRate: 12,
            compliance: 55, resistance: 6, expRatio: 1.2, flowLimitation: 0.0,
            rrSpont: 16, pmus: 5, tiNeural: 0.8, pmusExp: 0.0,
            variability: 12, cardiac: 0.3, height: 175, gender: 'female',
            tolkning: 'Moderat redusert compliance (55 ml/cmH₂O) etter væske i lungene, men normal luftveismotstand (6 cmH₂O/L/s) og bevart muskelkraft (Pmus 5 cmH₂O). Tidskonstanten er kort (τ_insp 0,33 s), så lungene fylles og tømmes raskt. Frekvensen på 16/min er forhøyet men ikke alarmerende.',
            whatYouSee: 'Trykkurven når innstilt IPAP og holder et jevnt platå. Flowkurven faller jevnt av og krysser nullinjen godt før neste innpust. Volumkurven returnerer helt til null. Alle pasientinnsatser besvares (100 % ▲), auto-PEEP 0 og asynkroni-indeks 0 %.',
            whyItHappens: 'Trigger (2,0 L/min), stigetid (150 ms) og avslutning (25 %) er alle tilpasset denne pasientens korte tidskonstant og moderate drive. Maskinpustet varer 0,83 s mot pasientens nevrale 0,8 s — de slutter praktisk talt samtidig.',
            whatToDo: 'Ingenting. Dette er bildet du sammenligner de neste ti scenariene mot. Legg merke til formen på alle tre kurvene før du går videre.',
            annotations: [
                { track: 'paw', relX: 0.45, relY: 0.30, title: 'Jevnt platå', desc: 'Trykket når og holder innstilt IPAP' },
                { track: 'flow', relX: 0.55, relY: 0.55, title: 'Fullstendig tømming', desc: 'Flow når 0 før neste pust' }
            ]
        },

        // ---------------------------------------------------------------------
        // 2. REFERANSE — lav drive, riktig innstilt
        // Målt: Vt 545 ml (7,7 ml/kg) · RRtot 11 · Ti 1,01 s · PEEPi 0 · fanget 100 % · AI 0 %
        // ---------------------------------------------------------------------
        mildlySedated: {
            name: 'Lungefrisk, lett sedert',
            badge: '😴 Lett sedert',
            pasient: 'Mann 54 år, første natt etter laparoskopisk kirurgi. Lett sedert, normale lunger.',
            mode: 'PS', ipap: 10, epap: 5, rr: 11, fio2: 30,
            riseTime: 200, cycling: 25, tiSet: 1.0, tiMax: 2.0, leak: 5,
            triggerMode: 'flow', triggerVal: 1.5, stActive: false, backupRate: 10,
            compliance: 75, resistance: 5, expRatio: 1.0, flowLimitation: 0.0,
            rrSpont: 11, pmus: 3, tiNeural: 1.0, pmusExp: 0.0,
            variability: 6, cardiac: 0.2, height: 175, gender: 'male',
            tolkning: 'Normale lunger (C 75, R 5) og passiv ekspirasjon. Sedasjonen demper respirasjonssenteret: frekvensen er 11/min og muskelkraften bare 3 cmH₂O. Pustemønsteret er svært regelmessig — variabiliteten er lav nettopp fordi sedasjonen demper den naturlige biologiske variasjonen.',
            whatYouSee: 'Samme grunnform som referansen, men roligere og med lengre ekspirasjonstid (I:E 1:4,4). Trykkurven har en mykere forkant fordi stigetiden er 200 ms. Ingen asynkroni.',
            whyItHappens: 'Lav drive og god lungemekanikk gjør at selv en beskjeden trykkstøtte (ΔP 5 cmH₂O) gir fullgodt tidalvolum. Den lave triggerterskelen (1,5 L/min) fanger den svake innsatsen uten problem.',
            whatToDo: 'Fortsett overvåking av sedasjonsdybde. Merk hvor lite trykkstøtte som trengs når lungene er friske — sammenlign med KOLS-pasienten som trenger ΔP 15.',
            annotations: [
                { track: 'paw', relX: 0.42, relY: 0.32, title: 'Myk forkant', desc: 'Stigetid 200 ms gir avrundet start' }
            ]
        },

        // ---------------------------------------------------------------------
        // 3. TRIGGER — for ufølsom
        // Målt: Vt 279 ml (4,2 ml/kg) · RRtot 15 mot drive 26 · Ti 0,40 s · fanget 50–62 % · AI ca. 40 %
        // ---------------------------------------------------------------------
        slowTrigger: {
            name: 'For ufølsom trigger',
            badge: '🐢 Mislykkede innsatser',
            pasient: 'Mann 74 år, pneumoni på dag 9. Stive lunger OG uttalt muskelsvekkelse (kritisk sykdom-myopati).',
            mode: 'PS', ipap: 16, epap: 6, rr: 26, fio2: 45,
            riseTime: 150, cycling: 25, tiSet: 1.0, tiMax: 2.0, leak: 5,
            triggerMode: 'flow', triggerVal: 5.0, stActive: false, backupRate: 12,
            compliance: 25, resistance: 6, expRatio: 1.2, flowLimitation: 0.0,
            rrSpont: 26, pmus: 1.5, tiNeural: 0.55, pmusExp: 0.0,
            variability: 18, cardiac: 0.3, height: 170, gender: 'male',
            tolkning: 'To ting samtidig: lungene er stive (C 25 ml/cmH₂O) og muskelen er svak (Pmus 1,5 cmH₂O). Kombinasjonen er avgjørende. Flowen en pasientinnsats kan skape er omtrent C × (dPmus/dt), altså compliance ganger hvor raskt muskeltrykket bygges opp — ikke Pmus delt på motstanden. Her gir det bare 3–5 L/min. Frekvensen på 26/min er kroppens kompensasjon for det lave volumet. Variabiliteten på 18 % er høy fordi en utslitt muskel gir ujevne innsatser.',
            whatYouSee: 'Omtrent halvparten av innsatsene besvares (▲), resten blir mislykkede (△). Se etter små hakk i ekspirasjonsflowen og små bulker i volumkurven mellom pustene — de er små, men de er der. På Pes/Pmus-sporet er hver innsats tydelig. RRtot 14 mot pasientens 26/min: maskinen registrerer bare halvparten.',
            whyItHappens: 'Triggerterskelen står på 5,0 L/min. Pasientens innsats når 3–5 L/min, altså akkurat rundt terskelen — derfor slipper de sterkeste innsatsene gjennom og de svakeste ikke. Terskelen ble hevet for å stoppe autotrigging fra en lekkasje. Masken ble byttet, men triggeren ble aldri satt tilbake.',
            whatToDo: 'Senk flow-triggeren til 1,5–2,0 L/min. Da fanges alle innsatser og % Spont går til 100. Merk at pasienten fortsatt har for lavt tidalvolum — det er et separat problem som krever mer trykkstøtte. Legg også merke til hvor vanskelig △ er å se på trykk og flow. Det er nettopp derfor mislykkede innsatser overses klinisk, og derfor % Spont og Pes-sporet er verdt å lese.',
            annotations: [
                { track: 'flow', relX: 0.40, relY: 0.60, title: 'Mislykket innsats (△)', desc: 'Lite hakk i ekspirasjonsflowen — ingen trykkstøtte følger' },
                { track: 'pes', relX: 0.40, relY: 0.40, title: 'Innsatsen er der', desc: 'Pes viser innsatsen maskinen ikke ser' }
            ]
        },

        // ---------------------------------------------------------------------
        // 4. TRIGGER — for følsom + lekkasje
        // Målt: RRtot 15–16 mot drive 8 · 8–11 autotriggere/min · Ti 1,8–2,0 s (Ti-max) · Vt 502 ml (6,9 ml/kg)
        // ---------------------------------------------------------------------
        autotrigger: {
            name: 'Autotrigging',
            badge: '⚡ Falsk trigging',
            pasient: 'Mann 61 år, opioidsedert etter thoraxkirurgi. Nesesonde under masken gir dårlig passform.',
            mode: 'PS', ipap: 13, epap: 5, rr: 12, fio2: 40,
            riseTime: 150, cycling: 25, tiSet: 1.0, tiMax: 2.0, leak: 45,
            triggerMode: 'flow', triggerVal: 1.0, stActive: false, backupRate: 12,
            compliance: 60, resistance: 6, expRatio: 1.2, flowLimitation: 0.0,
            rrSpont: 8, pmus: 2.5, tiNeural: 0.8, pmusExp: 0.0,
            variability: 8, cardiac: 1.5, height: 178, gender: 'male',
            tolkning: 'Lungene er greie (C 60, R 6). Problemet er utenfor pasienten: 45 L/min maskelekkasje skaper turbulente flowsvingninger, og opioidene har senket driven til 8/min. Når pasienten selv nesten ikke puster, er maskinens støy det sterkeste signalet triggeren ser. Hjerteslagene bidrar også (kardiogent artefakt 1,5 L/min).',
            whatYouSee: 'Maskinen leverer 15 pust/min mens pasienten bare puster 8 — halvparten er ⨂ autotriggere uten pasientinnsats. Flowkurven vender aldri til null i ekspirasjonen, den ligger forskjøvet oppover av lekkasjen. Volumkurven returnerer ikke til null og driver oppover. Nesten hvert innpust avsluttes på Ti-max (1,8 s) i stedet for på flow.',
            whyItHappens: 'Triggeren står på 1,0 L/min — mer følsom enn lekkasjeturbulensen. Og lekkasjen gjør at flowen aldri faller under avslutningsterskelen, så maskinen må bruke sikkerhetstiden Ti-max for å slippe utpustet. Legg merke til at lekkasjen skaper begge feilene samtidig.',
            whatToDo: 'Tett masken først — det løser både autotriggingen og den forlengede inspirasjonstiden. Hev deretter triggeren til 2,5–3,0 L/min hvis det fortsatt trigger falskt. Å heve triggeren uten å tette masken flytter problemet til scenario 3.',
            annotations: [
                { track: 'flow', relX: 0.35, relY: 0.42, title: 'Autotrigger (⨂)', desc: 'Lekkasjeturbulens utløser innpust uten innsats' },
                { track: 'flow', relX: 0.70, relY: 0.62, title: 'Forskjøvet nullinje', desc: 'Lekkasjen løfter hele ekspirasjonsflowen' }
            ]
        },

        // ---------------------------------------------------------------------
        // 5. STIGETID — for treg
        // Målt: Vt 594 ml (7,9 ml/kg) · RRtot 30 · Ti 0,63 s · sagg mot mål 3,3 cmH₂O · fanget 100 %
        // ---------------------------------------------------------------------
        slowRise: {
            name: 'Stigetid for treg',
            badge: '📉 Flow starvation',
            pasient: 'Mann 45 år, alvorlig pneumoni. Våken, svært høy respiratorisk drive (Pmus 15 cmH₂O), 30/min.',
            mode: 'PS', ipap: 16, epap: 6, rr: 30, fio2: 60,
            riseTime: 750, cycling: 25, tiSet: 1.0, tiMax: 2.0, leak: 5,
            triggerMode: 'flow', triggerVal: 2.0, stActive: false, backupRate: 14,
            compliance: 32, resistance: 6, expRatio: 1.3, flowLimitation: 0.0,
            rrSpont: 30, pmus: 15, tiNeural: 0.55, pmusExp: 2.0,
            variability: 8, cardiac: 0.3, height: 180, gender: 'male',
            tolkning: 'Dette er nøkkelpasienten for stigetid: kort nevral inspirasjonstid (0,55 s) kombinert med svært kraftig muskelinnsats (15 cmH₂O). Han vil ha alt volumet sitt i løpet av et halvt sekund og etterspør nesten 90 L/min. Lungene er stive (C 32), så han kompenserer med frekvens. Han bruker også bukmusklene aktivt i utpust (Pmus_exp 2).',
            whatYouSee: 'Trykkurven er avrundet og kuppelformet i stedet for firkantet — den rekker aldri opp til platå før innpustet er over. Flowkurven har en bred, langsom dome i stedet for en bratt forkant. Trykket ligger 3–4 cmH₂O under der maskinen sikter, gjennom hele innpustet.',
            whyItHappens: 'Stigetiden står på 750 ms mens pasientens nevrale innpust bare varer 550 ms. Maskinen bygger opp trykket saktere enn pasienten suger, og trykkfallet over slange og maske vokser med flowen (sagg = R_krets × flow). Pasienten gjør pustearbeidet maskinen skulle gjort — det er flow starvation.',
            whatToDo: 'Kort ned stigetiden til 100–150 ms. Trykkurven blir firkantet, flowforkanten bratt, og pustearbeidet flyttes fra pasienten til maskinen. Sammenlign formen direkte med referansescenariet.',
            annotations: [
                { track: 'paw', relX: 0.35, relY: 0.55, title: 'Kuppelformet trykk', desc: 'Rekker aldri platå — maskinen henger etter' },
                { track: 'flow', relX: 0.35, relY: 0.30, title: 'Treg forkant', desc: 'Bred dome i stedet for bratt stigning' }
            ]
        },

        // ---------------------------------------------------------------------
        // 6. STIGETID — for rask
        // Målt: Vt 508 ml (7,9 ml/kg) · RRtot 18 · Ti 0,71 s · topp-Paw 21,3 mot IPAP 20 · fanget 100 %
        // ---------------------------------------------------------------------
        fastRise: {
            name: 'Stigetid for rask',
            badge: '📈 Trykkoversving',
            pasient: 'Mann 58 år, obesitas-hypoventilasjon (BMI 44). Stiv thorax, trenger høyt IPAP.',
            mode: 'PS', ipap: 20, epap: 8, rr: 18, fio2: 35,
            riseTime: 50, cycling: 30, tiSet: 1.0, tiMax: 2.0, leak: 10,
            triggerMode: 'flow', triggerVal: 2.0, stActive: false, backupRate: 14,
            compliance: 35, resistance: 10, expRatio: 1.5, flowLimitation: 0.1,
            rrSpont: 18, pmus: 6, tiNeural: 0.7, pmusExp: 0.0,
            variability: 8, cardiac: 0.3, height: 168, gender: 'male',
            tolkning: 'Denne pasienten trenger et stort trykksprang (ΔP 12 cmH₂O) fordi brystveggen er stiv, og har samtidig forhøyet luftveismotstand (R 10). Høy impedans betyr at blåserens akselerasjon møter motstand — det er nettopp da et bratt trykksprang gir oversving. Sammenlign med den treg-stigetid-pasienten som har lav motstand.',
            whatYouSee: 'Trykkurven har en skarp spiss ved innpuststart som går over innstilt IPAP, før den faller ned på platået. Flowkurven har en nesten loddrett forkant med en høy, kortvarig topp. Lekkasjen (10 L/min) øker i takt med trykktoppene.',
            whyItHappens: 'Stigetiden er 50 ms. Blåseren akselererer så brått at trykkreguleringen svinger over målet før den fanger seg inn — det klassiske oversvinget. Hos en pasient med høy impedans kommer sprang tydeligere fram i masketrykket enn hos en med lave motstander.',
            whatToDo: 'Myk opp stigetiden til 150–250 ms. Oversvinget forsvinner, flowforkanten blir jevnere, og lekkasjen faller fordi trykktoppene mot masken blir mindre. Merk at rask stigetid ikke gir for lite volum her — den gir ubehag, oversving og lekkasje.',
            annotations: [
                { track: 'paw', relX: 0.30, relY: 0.18, title: 'Oversving', desc: 'Trykket skyter over innstilt IPAP ved start' },
                { track: 'flow', relX: 0.30, relY: 0.22, title: 'Loddrett forkant', desc: 'Brå flowakselerasjon' }
            ]
        },

        // ---------------------------------------------------------------------
        // 7. AVSLUTNING — for tidlig
        // Målt: Vt 341 ml (5,2 ml/kg) · RRtot 36 mot drive 28 · Ti 0,50 s · PEEPi 2,4 · 5–9 dobbelttriggere/min
        // ---------------------------------------------------------------------
        earlyCycle: {
            name: 'For tidlig avslutning',
            badge: '⏱️ Dobbelttrigging',
            pasient: 'Kvinne 39 år, alvorlig viral pneumoni med ARDS-lignende bilde. Meget høy drive, lang nevral inspirasjon.',
            mode: 'PS', ipap: 13, epap: 6, rr: 28, fio2: 70,
            riseTime: 150, cycling: 50, tiSet: 1.0, tiMax: 2.0, leak: 5,
            triggerMode: 'flow', triggerVal: 2.0, stActive: false, backupRate: 14,
            compliance: 26, resistance: 6, expRatio: 1.3, flowLimitation: 0.0,
            rrSpont: 28, pmus: 13, tiNeural: 1.35, pmusExp: 0.0,
            variability: 8, cardiac: 0.3, height: 175, gender: 'female',
            tolkning: 'Dobbelttrigging krever tre ting samtidig, og alle tre finnes her: kraftig drive (Pmus 13), lang nevral inspirasjonstid (1,35 s) og for lite levert volum. Den lave compliancen (C 26) er avgjørende i to retninger — den gjør at maskinen leverer lite volum, men også at det elastiske tilbaketrekket blir stort. Pasienten må være sterkere enn tilbaketrekket for å kunne trigge på nytt. Med Vt 230 ml er tilbaketrekket ca. 9 cmH₂O, og Pmus 13 klarer det.',
            whatYouSee: 'Par av pust rett etter hverandre: maskinen avslutter, pasienten suger videre, og et nytt innpust utløses før lungen har tømt seg. Volumkurven stables oppover på de doble pustene. Auto-PEEP stiger kraftig (PEEPi 13 cmH₂O) — ikke fordi luftveiene er trange, men fordi det ikke er tid til å puste ut mellom de stablede pustene.',
            whyItHappens: 'Avslutningen står på 50 % av toppflow. Maskinen slipper innpustet etter 0,53 s mens pasientens nevrale innpust varer 1,35 s. Hun er altså bare en tredjedel ferdig når maskinen gir seg, og trykkstøtten (ΔP 7) er for liten for hennes behov.',
            whatToDo: 'To grep, i denne rekkefølgen: senk avslutningen til 20–25 % så maskinpustet varer lenger, og øk deretter IPAP til pasienten faktisk får volumet hun etterspør. Bare det ene grepet er ikke nok. Merk at auto-PEEP her løses ved å fjerne dobbelttriggingen, ikke ved å øke EPAP — motsatt av KOLS-scenariet.',
            annotations: [
                { track: 'paw', relX: 0.40, relY: 0.60, title: 'Dobbelttrigger', desc: 'To pust på én nevral innsats' },
                { track: 'vol', relX: 0.45, relY: 0.30, title: 'Volumstabling', desc: 'Lungen tømmes ikke mellom pustene' }
            ]
        },

        // ---------------------------------------------------------------------
        // 8. AVSLUTNING — for sen
        // Målt: Ti 2,0 s mot nevral 0,60 s · Vt 364 ml (5,4 ml/kg) · PEEPi 2,3–5,6 · fanget 81–100 %
        // ---------------------------------------------------------------------
        lateCycle: {
            name: 'For sen avslutning',
            badge: '⏳ Kamp mot maskinen',
            pasient: 'Mann 71 år, KOLS i trykkstøtte. Kort nevralt innpust, bruker bukmusklene aktivt i utpust.',
            mode: 'PS', ipap: 18, epap: 6, rr: 16, fio2: 30,
            riseTime: 200, cycling: 5, tiSet: 1.0, tiMax: 2.5, leak: 5,
            triggerMode: 'flow', triggerVal: 2.0, stActive: false, backupRate: 12,
            compliance: 62, resistance: 16, expRatio: 1.8, flowLimitation: 0.35,
            rrSpont: 16, pmus: 7, tiNeural: 0.6, pmusExp: 2.5,
            variability: 8, cardiac: 0.2, height: 172, gender: 'male',
            tolkning: 'Sen avslutning er et langtidskonstant-fenomen — det kan ikke oppstå hos en pasient med friske luftveier. Her er τ_insp 0,99 s fordi motstanden er høy (R 16), så flowen faller svært langsomt og bruker evigheter på å nå avslutningsterskelen. Pasientens eget innpust varer bare 0,6 s. Han svarer med å bruke bukmusklene (Pmus_exp 2,5) for å tvinge luften ut mot en maskin som fortsatt blåser inn.',
            whatYouSee: 'Uvanlig lange trykkplatåer — 2,3 sekunder mot pasientens nevrale 0,6. Mot slutten av platået stiger trykket litt over IPAP: det er pasienten som presser mot maskinen. Flowkurven flater helt ut og krysser til og med under nullinjen mens maskinen fortsatt er i innpust. I:E blir nær 1:1. Noen innsatser går tapt fordi maskinpustet okkuperer så mye av pusterytmen.',
            whyItHappens: 'Avslutningen står på 5 % av toppflow. Med τ_insp på 1 sekund tar det over 2 sekunder å komme dit, og innpustet avbrytes til slutt på sikkerhetstiden Ti-max. Innstillingen ville vært helt ufarlig hos en pasient med friske luftveier — det er kombinasjonen med høy motstand som gjør den skadelig.',
            whatToDo: 'Hev avslutningen til 35–50 %. Ved KOLS i trykkstøtte er høy avslutningsterskel regelen, ikke unntaket, nettopp fordi tidskonstanten er lang. Kort eventuelt også ned Ti-max. Se hvordan I:E normaliseres og de tapte innsatsene forsvinner.',
            annotations: [
                { track: 'paw', relX: 0.48, relY: 0.20, title: 'Terminal trykkstigning', desc: 'Pasienten presser mot maskinen' },
                { track: 'flow', relX: 0.45, relY: 0.48, title: 'Flow under null i innpust', desc: 'Han puster ut mens maskinen blåser inn' }
            ]
        },

        // ---------------------------------------------------------------------
        // 9. KOLS — auto-PEEP, EPAP for lav
        // Målt: PEEPi 4,6 · Vt 329 ml (5,2 ml/kg) · RRtot 14 mot drive 28 · fanget 48–50 % · AI 50 %
        // ---------------------------------------------------------------------
        copdAutoPeep: {
            name: 'KOLS med auto-PEEP',
            badge: '⚠️ Luftfanging',
            pasient: 'Kvinne 66 år, alvorlig KOLS-eksaserbasjon. Takypnoisk 28/min, pH 7,24, pCO₂ 9,1 kPa.',
            mode: 'PS', ipap: 18, epap: 4, rr: 28, fio2: 28,
            riseTime: 150, cycling: 25, tiSet: 1.0, tiMax: 2.0, leak: 5,
            triggerMode: 'flow', triggerVal: 2.0, stActive: false, backupRate: 14,
            compliance: 68, resistance: 22, expRatio: 2.0, flowLimitation: 0.6,
            rrSpont: 28, pmus: 7, tiNeural: 0.65, pmusExp: 2.5,
            variability: 8, cardiac: 0.2, height: 172, gender: 'female',
            tolkning: 'Den ekspiratoriske tidskonstanten er 3,1 sekunder — lungene trenger nesten 10 sekunder for å tømmes helt. Ved 28 pust i minuttet er det bare 2,1 sekunder til hele syklusen. Ekspirasjonen blir avbrutt hver gang, og resten hoper seg opp. Den dynamiske flowbegrensningen (0,6) betyr at små luftveier klapper sammen når hun presser, så hardere utpust hjelper ikke.',
            whatYouSee: 'Ekspirasjonsflowen når aldri nullinjen før neste pust starter — den ligger fortsatt på −5 til −10 L/min når innpustet kommer. PEEPi er 4,6 cmH₂O. Bare halvparten av innsatsene besvares: RRtot 14 mot hennes 28/min, med △ mellom pustene. Trykket dras under EPAP før hver trigging.',
            whyItHappens: 'Fanget luft gir et indre overtrykk på 4,6 cmH₂O. Før hun kan skape flow inn i lungen må hun først overvinne det med muskelkraft. Med Pmus 7 cmH₂O går det halvparten av gangene. EPAP på 4 cmH₂O er for lavt til å motvirke luftveiskollapsen. Legg merke til at auto-PEEP og mislykkede innsatser er samme problem: PEEPi er årsaken, △ er symptomet.',
            whatToDo: 'Øk EPAP til 8–10 cmH₂O for å holde de små luftveiene åpne i utpust, og øk IPAP tilsvarende for å beholde trykkstøtten. Hev avslutningen til 30–40 % så innpustet blir kortere og utpustet lengre. Gå til neste scenario for å se resultatet på samme pasient.',
            annotations: [
                { track: 'flow', relX: 0.55, relY: 0.62, title: 'Ufullstendig tømming', desc: 'Flow er negativ når neste pust starter' },
                { track: 'paw', relX: 0.30, relY: 0.72, title: 'Trykkdipp før trigging', desc: 'Hun må overvinne PEEPi først' }
            ]
        },

        // ---------------------------------------------------------------------
        // 10. KOLS — samme pasient, riktig innstilt
        // Målt: PEEPi 3,9 (fra 4,6) · Vt 387 ml (6,1 ml/kg, fra 5,2) · fanget 100 % (fra 50 %) · AI 0 %
        // ---------------------------------------------------------------------
        copdAdjusted: {
            name: 'Hyperkapnisk KOLS, behandlet',
            badge: '✨ Optimalisert',
            pasient: 'SAMME pasient, 45 minutter senere. Identisk lungemekanikk — bare innstillingene er endret.',
            mode: 'PS', ipap: 24, epap: 9, rr: 14, fio2: 28,
            riseTime: 150, cycling: 30, tiSet: 1.0, tiMax: 1.8, leak: 5,
            triggerMode: 'flow', triggerVal: 1.5, stActive: false, backupRate: 14,
            compliance: 68, resistance: 22, expRatio: 2.0, flowLimitation: 0.6,
            rrSpont: 14, pmus: 7, tiNeural: 0.65, pmusExp: 2.5,
            variability: 8, cardiac: 0.2, height: 172, gender: 'female',
            tolkning: 'Compliance, motstand og flowbegrensning er uendret — dette er de samme lungene. Det som er endret er innstillingene, og som følge av dem pasientens respirasjonsfrekvens: når ventilasjonen bedres faller CO₂, og driven synker fra 28 til 14/min. Det er den kliniske virkningskjeden, og den er halve gevinsten. Frekvensfallet gir dobbelt så lang ekspirasjonstid.',
            whatYouSee: 'Ekspirasjonsflowen kommer nå nesten helt til null før neste pust. PEEPi er nede fra 4,6 til 3,9 cmH₂O. Alle innsatser besvares (100 % ▲, asynkroni-indeks 0 %). Tidalvolumet er opp fra 4,7 til 5,6 ml/kg og minuttvolumet er høyere til tross for lavere frekvens.',
            whyItHappens: 'EPAP 9 cmH₂O motvirker luftveiskollapsen i utpust og «balanserer» auto-PEEP, slik at hun ikke lenger må overvinne et indre overtrykk før hun kan trigge. IPAP 24 holder trykkstøtten oppe (ΔP 15). Avslutning 30 % gir kortere innpust og mer tid til å tømme. Lavere frekvens gir lengre Te.',
            whatToDo: 'Målet er nådd. Bytt fram og tilbake mellom dette og forrige scenario og se på ett spor om gangen. Merk at tidalvolumet fortsatt er beskjedent (5,6 ml/kg) — hos KOLS er det ikke store volum som er målet, men lavere pustearbeid, gjenopprettet samspill og CO₂-utlufting.',
            annotations: [
                { track: 'flow', relX: 0.55, relY: 0.55, title: 'Nesten full tømming', desc: 'Flow kommer til null før neste pust' },
                { track: 'paw', relX: 0.42, relY: 0.28, title: 'Alle innsatser fanges', desc: 'Lavere terskel og lengre Te — ingen △ igjen' }
            ]
        },

        // ---------------------------------------------------------------------
        // 11. DRIVE — ST-backup tar over
        // Målt: RRtot 14 · 15–18 backup-pust/min · % spont 0 · Vt 523 ml (7,4 ml/kg) · ingen apné-alarm
        // ---------------------------------------------------------------------
        lowDrive: {
            name: 'Redusert respirasjonsdrive',
            badge: '💤 ST-backup',
            pasient: 'Mann 79 år, CO₂-narkose etter uttrapping av oksygen. Somnolent, puster 5/min.',
            mode: 'PS', ipap: 16, epap: 6, rr: 14, fio2: 28,
            riseTime: 150, cycling: 25, tiSet: 1.0, tiMax: 2.0, leak: 5,
            triggerMode: 'flow', triggerVal: 1.5, stActive: true, backupRate: 14,
            compliance: 55, resistance: 8, expRatio: 1.4, flowLimitation: 0.1,
            rrSpont: 5, pmus: 1.5, tiNeural: 0.9, pmusExp: 0.0,
            variability: 10, cardiac: 0.3, height: 175, gender: 'male',
            tolkning: 'Lungemekanikken er nesten normal (C 55, R 8). Det som svikter er styringen: respirasjonssenteret er dempet av CO₂ og gir bare 5 pust i minuttet med 1,5 cmH₂O kraft. Uten backup ville minuttvolumet vært under 3 L/min. Dette er ikke en trigger- eller innstillingsfeil — det er en pasient som må overtas.',
            whatYouSee: 'Alle pust er maskinutløste (■) og kommer med jevn takt på 14/min. % Spontane pust står på 0. Ingen apné-alarm utløses, fordi maskinen selv sørger for ventilasjonen. Innpustene avsluttes på tid, ikke på flow — backup-pust er tidsstyrte.',
            whyItHappens: 'ST-backup er aktivert med 14/min. Hver gang det går lenger enn 4,3 sekunder uten pust, leverer maskinen et pust selv. Pasientens egne innsatser er for svake og for sjeldne til å komme først.',
            whatToDo: 'ST-backup hindrer hypoventilasjon her og nå, men behandler ikke årsaken. Finn ut hvorfor driven er borte — CO₂-narkose, opioider, sedasjon — og vurder intubasjon dersom bevisstheten ikke bedres. Prøv å slå av ST og se hva som skjer med minuttvolumet: det er poenget med scenariet.',
            annotations: [
                { track: 'paw', relX: 0.42, relY: 0.32, title: 'Backup-pust (■)', desc: 'Maskinutløst, tidsavsluttet' },
                { track: 'pes', relX: 0.65, relY: 0.50, title: 'Nesten ingen egeninnsats', desc: 'Pmus 1,5 cmH₂O, 5/min' }
            ]
        }
    };

    // =========================================================================
    // TOAST NOTIFIKASJONER (D6)
    // =========================================================================
    let toastTimer = null;
    function showToast(message, durationMs = 3500) {
        if (!toastNotification) return;
        toastNotification.innerHTML = message;
        toastNotification.classList.remove('hidden');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toastNotification.classList.add('hidden');
        }, durationMs);
    }

    // =========================================================================
    // D1: MODUS-HÅNDTERING (PS vs PC)
    // =========================================================================
    function setVentilationMode(mode) {
        simulator.settings.mode = mode;
        if (selectMode) selectMode.value = mode;

        if (mode === 'PC') {
            if (modeBadge) {
                modeBadge.innerHTML = '<span>Modus: Trykkontroll (PCV / A/C)</span>';
            }
            if (labelPressureMode) labelPressureMode.textContent = 'PC over PEEP (Trykkontroll)';
            if (sublabelPressureMode) sublabelPressureMode.textContent = 'Inspiratorisk trykknivå levert under innpust';

            // Grå ut cycling-slider i Fane 3 (D1: ikke skjul, grå ut)
            if (cardCycling) {
                cardCycling.classList.add('control-disabled');
                if (sliders.cycling) sliders.cycling.disabled = true;
                if (labelCyclingStatus) {
                    labelCyclingStatus.textContent = '⛔ Inaktiv i PC-modus (avsluttes på Ti)';
                    labelCyclingStatus.style.color = 'var(--color-warning)';
                }
            }

            // Aktiver TiSet slider i Fane 1
            if (cardTiSet) {
                cardTiSet.classList.remove('control-disabled');
                if (sliders.tiSet) sliders.tiSet.disabled = false;
                if (labelTiSetStatus) {
                    labelTiSetStatus.textContent = '✅ Aktiv (Innpuststid = Ti)';
                    labelTiSetStatus.style.color = 'var(--color-accent)';
                }
            }

            // TiMax er inaktiv i PC (siden Ti er fast satt)
            if (cardTiMax) {
                cardTiMax.classList.add('control-disabled');
                if (sliders.tiMax) sliders.tiMax.disabled = true;
            }

        } else {
            // PS-modus (Standard)
            if (modeBadge) {
                modeBadge.innerHTML = '<span>Modus: BPAP</span>';
            }
            if (labelPressureMode) labelPressureMode.textContent = 'IPAP (Inspiratorisk trykk)';
            if (sublabelPressureMode) sublabelPressureMode.textContent = 'Trykkstøtte levert under innpust';

            // Aktiver cycling-slider i Fane 3
            if (cardCycling) {
                cardCycling.classList.remove('control-disabled');
                if (sliders.cycling) sliders.cycling.disabled = false;
                if (labelCyclingStatus) {
                    labelCyclingStatus.textContent = 'Gjelder i PS-modus';
                    labelCyclingStatus.style.color = 'var(--color-accent)';
                }
            }

            // Grå ut TiSet slider i Fane 1
            if (cardTiSet) {
                cardTiSet.classList.add('control-disabled');
                if (sliders.tiSet) sliders.tiSet.disabled = true;
                if (labelTiSetStatus) {
                    labelTiSetStatus.textContent = 'Gjelder kun i PC-modus';
                    labelTiSetStatus.style.color = 'var(--text-dim)';
                }
            }

            // Aktiver TiMax i PS
            if (cardTiMax) {
                cardTiMax.classList.remove('control-disabled');
                if (sliders.tiMax) sliders.tiMax.disabled = false;
            }
        }

        updateSimulatorFromUI();
    }

    if (selectMode) {
        selectMode.addEventListener('change', () => {
            setVentilationMode(selectMode.value);
        });
    }

    // Avkrysningsboks for lungekurver (A7)
    if (checkShowTrueCurves) {
        checkShowTrueCurves.addEventListener('change', () => {
            renderer.showTrueCurves = checkShowTrueCurves.checked;
        });
    }

    // FASE 4: Avkrysningsboks for 4. spor (P_es / muskelinnsats)
    const checkShowPes = document.getElementById('checkShowPes');
    if (checkShowPes) {
        checkShowPes.addEventListener('change', () => {
            renderer.showPesTrack = checkShowPes.checked;
            renderer.resize();   // sporlayouten må regnes om
        });
    }

    // Trigger-modus veksling (Flow / Trykk)
    function setTriggerMode(mode) {
        simulator.settings.triggerMode = mode;

        if (mode === 'flow') {
            if (btnTrigModeFlow) btnTrigModeFlow.classList.add('active');
            if (btnTrigModePressure) btnTrigModePressure.classList.remove('active');

            if (triggerTitle) triggerTitle.textContent = 'Flow-trigger (Inspirasjonstrigger)';
            if (triggerSublabel) triggerSublabel.textContent = 'Påkrevd pasientflow for å utløse støtte (1–5 L/min)';
            if (triggerLimitMin) triggerLimitMin.textContent = '1.0 L/min (100% utløst ▲)';
            if (triggerLimitMid) triggerLimitMid.textContent = '4.0 L/min (Asynkroni)';
            if (triggerLimitMax) triggerLimitMax.textContent = '5.0 L/min (Apné / 0%)';

            if (sliders.trigger) {
                sliders.trigger.min = '1';
                sliders.trigger.max = '5';
                sliders.trigger.step = '0.5';
                sliders.trigger.value = simulator.settings.triggerFlow;
            }
        } else {
            if (btnTrigModePressure) btnTrigModePressure.classList.add('active');
            if (btnTrigModeFlow) btnTrigModeFlow.classList.remove('active');

            if (triggerTitle) triggerTitle.textContent = 'Trykk-trigger (Inspirasjonstrigger)';
            if (triggerSublabel) triggerSublabel.textContent = 'Trykkfall under EPAP for å utløse støtte (0.2–5.0 cmH₂O)';
            if (triggerLimitMin) triggerLimitMin.textContent = '0.2 cmH₂O (Svært lett)';
            if (triggerLimitMid) triggerLimitMid.textContent = '1.0 cmH₂O';
            if (triggerLimitMax) triggerLimitMax.textContent = '5.0 cmH₂O (Tung)';

            if (sliders.trigger) {
                sliders.trigger.min = '0.2';
                sliders.trigger.max = '5';
                sliders.trigger.step = '0.1';
                sliders.trigger.value = simulator.settings.triggerPressure;
            }
        }

        updateSimulatorFromUI();
    }

    if (btnTrigModeFlow) {
        btnTrigModeFlow.addEventListener('click', () => setTriggerMode('flow'));
    }
    if (btnTrigModePressure) {
        btnTrigModePressure.addEventListener('click', () => setTriggerMode('pressure'));
    }

    // =========================================================================
    // LEKKASJE ALARM ENHET (L/min vs %)
    // =========================================================================
    function setLeakAlarmUnit(unit) {
        simulator.settings.alarmLeakUnit = unit;
        if (unit === 'lmin') {
            if (btnLeakUnitLmin) btnLeakUnitLmin.classList.add('active');
            if (btnLeakUnitPercent) btnLeakUnitPercent.classList.remove('active');
            if (leakSublabel) leakSublabel.textContent = 'Utløses ved lekkasje over grensen i > 10 sekunder';
            if (leakLimitMin) leakLimitMin.textContent = '10 L/min';
            if (leakLimitMid) leakLimitMid.textContent = '40 L/min';
            if (leakLimitMax) leakLimitMax.textContent = '60 L/min';
            if (btnAlarmLeakStepDown) btnAlarmLeakStepDown.dataset.step = '-5';
            if (btnAlarmLeakStepUp) btnAlarmLeakStepUp.dataset.step = '5';
            if (sliders.alarmLeak) {
                sliders.alarmLeak.min = '10';
                sliders.alarmLeak.max = '60';
                sliders.alarmLeak.step = '5';
                sliders.alarmLeak.value = simulator.settings.alarmLeakLimit || 40;
            }
        } else {
            if (btnLeakUnitPercent) btnLeakUnitPercent.classList.add('active');
            if (btnLeakUnitLmin) btnLeakUnitLmin.classList.remove('active');
            if (leakSublabel) leakSublabel.textContent = 'Utløses ved lekkasjeprosent over grensen i > 10 sekunder';
            if (leakLimitMin) leakLimitMin.textContent = '10 %';
            if (leakLimitMid) leakLimitMid.textContent = '50 %';
            if (leakLimitMax) leakLimitMax.textContent = '80 %';
            if (btnAlarmLeakStepDown) btnAlarmLeakStepDown.dataset.step = '-5';
            if (btnAlarmLeakStepUp) btnAlarmLeakStepUp.dataset.step = '5';
            if (sliders.alarmLeak) {
                sliders.alarmLeak.min = '10';
                sliders.alarmLeak.max = '80';
                sliders.alarmLeak.step = '5';
                sliders.alarmLeak.value = simulator.settings.alarmLeakPercentLimit || 50;
            }
        }
        updateSimulatorFromUI();
    }

    if (btnLeakUnitLmin) {
        btnLeakUnitLmin.addEventListener('click', () => setLeakAlarmUnit('lmin'));
    }
    if (btnLeakUnitPercent) {
        btnLeakUnitPercent.addEventListener('click', () => setLeakAlarmUnit('percent'));
    }

    // Funksjon for sanntids samkjøring av pasientflow og trigger (A4 & A6)
    function updateTriggerSyncUI() {
        const isFlowMode = (simulator.settings.triggerMode === 'flow');
        const trigFlow = simulator.settings.triggerFlow;
        const trigPress = simulator.settings.triggerPressure;
        const pmus = simulator.patientDrive.pmusMax;
        const R = simulator.patient.resistance;
        const rrSpont = simulator.patientDrive.rrSpont;
        const peepi = simulator.state.PEEPi || 0;
        const effectiveDrivingForce = Math.max(0, pmus - peepi);
        const patientPeakFlow = isFlowMode
            ? parseFloat((simulator.state.visPeakTriggerFlow * 60).toFixed(1))
            : parseFloat(((effectiveDrivingForce / R) * 60).toFixed(1));
        const cardiac = simulator.patientDrive.cardiacArtifact;
        const isStActive = simulator.settings.stActive && simulator.settings.backupRate > 0;

        const syncPatientLabel = syncPatientEffort ? syncPatientEffort.previousElementSibling : null;

        if (isFlowMode) {
            if (syncPatientLabel && syncPatientLabel.classList.contains('sync-label')) {
                syncPatientLabel.textContent = 'Pasientens topp-innsats (målt):';
                syncPatientLabel.title = 'Toppholdt måling over de siste sekundene, ikke en øyeblikksverdi';
            }
            if (syncTriggerReq) syncTriggerReq.textContent = `${trigFlow.toFixed(1)} L/min`;
            if (syncPatientEffort) {
                syncPatientEffort.textContent = `${patientPeakFlow.toFixed(1)} L/min`;
                syncPatientEffort.title = 'Toppholdt måling over de siste sekundene, ikke en øyeblikksverdi';
            }

            const maxVal = 6.0;
            const threshPct = Math.min(95, Math.max(5, (trigFlow / maxVal) * 100));
            const effortPct = Math.min(100, Math.max(5, (patientPeakFlow / maxVal) * 100));

            if (triggerGaugeThreshold) triggerGaugeThreshold.style.left = `${threshPct}%`;
            if (triggerGaugeFill) triggerGaugeFill.style.width = `${effortPct}%`;

            if (rrSpont === 0) {
                if (cardiac >= trigFlow) {
                    if (triggerSyncBox) triggerSyncBox.className = 'trigger-sync-box warning-state';
                    if (triggerGaugeFill) triggerGaugeFill.className = 'trigger-gauge-fill warning-fill';
                    if (triggerSyncBadge) {
                        triggerSyncBadge.className = 'trigger-sync-status-badge status-warning';
                        triggerSyncBadge.textContent = '⚡ Autotrigging';
                    }
                    if (badges.trigger) {
                        badges.trigger.classList.add('badge-warning-pill');
                        badges.trigger.classList.remove('badge-danger-pill');
                    }
                    if (triggerSyncMessage) {
                        triggerSyncMessage.innerHTML = `⚡ <strong>Kardiogen autotrigging:</strong> Pulsslag (${cardiac.toFixed(1)} L/min) er kraftigere enn triggerterskelen (${trigFlow.toFixed(1)} L/min) og trigger innpust uten pasientinnsats.`;
                    }
                } else if (isStActive) {
                    if (triggerSyncBox) triggerSyncBox.className = 'trigger-sync-box';
                    if (triggerGaugeFill) triggerGaugeFill.className = 'trigger-gauge-fill';
                    if (triggerSyncBadge) {
                        triggerSyncBadge.className = 'trigger-sync-status-badge status-ok';
                        triggerSyncBadge.textContent = '■ ST-Backup aktiv';
                    }
                    if (badges.trigger) {
                        badges.trigger.classList.remove('badge-warning-pill', 'badge-danger-pill');
                    }
                    if (triggerSyncMessage) {
                        triggerSyncMessage.innerHTML = `■ <strong>ST-Backup aktiv:</strong> Pasienten er passiv (rrSpont = 0). Maskinen leverer ${simulator.settings.backupRate} backup-pust/min uten apné-alarm.`;
                    }
                } else {
                    if (triggerSyncBox) triggerSyncBox.className = 'trigger-sync-box danger-state';
                    if (triggerGaugeFill) triggerGaugeFill.className = 'trigger-gauge-fill danger-fill';
                    if (triggerSyncBadge) {
                        triggerSyncBadge.className = 'trigger-sync-status-badge status-danger';
                        triggerSyncBadge.textContent = '🚨 Passiv / Apné';
                    }
                    if (badges.trigger) {
                        badges.trigger.classList.remove('badge-warning-pill');
                        badges.trigger.classList.remove('badge-danger-pill');
                    }
                    if (triggerSyncMessage) {
                        triggerSyncMessage.innerHTML = `🚨 <strong>Passiv pasient (rrSpont = 0, ST av):</strong> Ingen pasientinnsats eller backup. Apné-alarm utløses etter ${simulator.settings.apneaDelay} sekunder.`;
                    }
                }
            } else if (peepi > 1.5 && patientPeakFlow < trigFlow) {
                if (triggerSyncBox) triggerSyncBox.className = 'trigger-sync-box warning-state';
                if (triggerGaugeFill) triggerGaugeFill.className = 'trigger-gauge-fill warning-fill';
                if (triggerSyncBadge) {
                    triggerSyncBadge.className = 'trigger-sync-status-badge status-warning';
                    triggerSyncBadge.textContent = '⚠️ Auto-PEEP asynkroni';
                }
                if (badges.trigger) {
                    badges.trigger.classList.add('badge-warning-pill');
                    badges.trigger.classList.remove('badge-danger-pill');
                }
                if (triggerSyncMessage) {
                    triggerSyncMessage.innerHTML = `⚠️ <strong>Mislykket trigger pga. Auto-PEEP (${peepi.toFixed(1)} cmH₂O):</strong> Pasienten må overvinne mottrykket i lungene før flow snur til positiv. Generert triggerflow er kun ${patientPeakFlow} L/min vs krav ${trigFlow.toFixed(1)} L/min.`;
                }
            } else if (patientPeakFlow >= trigFlow) {
                if (triggerSyncBox) triggerSyncBox.className = 'trigger-sync-box';
                if (triggerGaugeFill) triggerGaugeFill.className = 'trigger-gauge-fill';
                if (triggerSyncBadge) {
                    triggerSyncBadge.className = 'trigger-sync-status-badge status-ok';
                    triggerSyncBadge.textContent = '✅ 100% Utløst';
                }
                if (badges.trigger) badges.trigger.classList.remove('badge-warning-pill', 'badge-danger-pill');
                if (triggerSyncMessage) {
                    triggerSyncMessage.innerHTML = `Flow-trigger på <strong>${trigFlow.toFixed(1)} L/min</strong>: Pasienten genererer nok flow (${patientPeakFlow} L/min) til å utløse maskinen pålitelig ved hvert innpust (100%).`;
                }
            } else {
                if (triggerSyncBox) triggerSyncBox.className = 'trigger-sync-box warning-state';
                if (triggerGaugeFill) triggerGaugeFill.className = 'trigger-gauge-fill warning-fill';
                if (triggerSyncBadge) {
                    triggerSyncBadge.className = 'trigger-sync-status-badge status-warning';
                    triggerSyncBadge.textContent = '⚠️ Mislykket trigger';
                }
                if (badges.trigger) {
                    badges.trigger.classList.add('badge-warning-pill');
                    badges.trigger.classList.remove('badge-danger-pill');
                }
                if (triggerSyncMessage) {
                    triggerSyncMessage.innerHTML = `⚠️ <strong>Mislykket innsats (Missed effort):</strong> Pasientens innsatsflow (${patientPeakFlow} L/min) når ikke triggerkravet (${trigFlow.toFixed(1)} L/min). Innsatsen sees i flowkurven uten at maskinen gir trykkstøtte!`;
                }
            }
        } else {
            // Trykkmodus
            if (syncPatientLabel && syncPatientLabel.classList.contains('sync-label')) {
                syncPatientLabel.textContent = 'Pasientinnsats:';
                syncPatientLabel.removeAttribute('title');
            }
            if (syncTriggerReq) syncTriggerReq.textContent = `-${trigPress.toFixed(1)} cmH₂O`;
            if (syncPatientEffort) {
                syncPatientEffort.textContent = `Pmus ${pmus.toFixed(1)}`;
                syncPatientEffort.removeAttribute('title');
            }
            if (triggerSyncBox) triggerSyncBox.className = 'trigger-sync-box';
            if (triggerGaugeFill) triggerGaugeFill.className = 'trigger-gauge-fill';
            if (triggerSyncBadge) {
                triggerSyncBadge.className = 'trigger-sync-status-badge status-ok';
                triggerSyncBadge.textContent = '⚡ Trykk-trigger';
            }
            if (badges.trigger) badges.trigger.classList.remove('badge-warning-pill', 'badge-danger-pill');
            if (triggerSyncMessage) {
                triggerSyncMessage.innerHTML = `Trykk-trigger på <strong>${trigPress.toFixed(1)} cmH₂O</strong>: Maskinen trigger innpust når masketrykket suges under ${(simulator.settings.epap - trigPress).toFixed(1)} cmH₂O.`;
            }
        }
    }

    // Kjønnsvalg (D5)
    function setGender(gender) {
        currentGender = gender || 'male';
        if (btnGenderMale && btnGenderFemale) {
            if (currentGender === 'female') {
                btnGenderFemale.classList.add('active');
                btnGenderMale.classList.remove('active');
            } else {
                btnGenderMale.classList.add('active');
                btnGenderFemale.classList.remove('active');
            }
        }
        updateSimulatorFromUI();
    }

    if (btnGenderMale && btnGenderFemale) {
        btnGenderMale.addEventListener('click', () => {
            setGender('male');
        });
        btnGenderFemale.addEventListener('click', () => {
            setGender('female');
        });
    }

    // 3. Koble til Sliders og synkroniser UI
    function updateSimulatorFromUI() {
        const ipap = parseFloat(sliders.ipap.value);
        let epap = parseFloat(sliders.epap.value);

        // Sikre at IPAP alltid er minst 2 cmH2O høyere enn EPAP
        if (epap >= ipap) {
            epap = ipap - 2;
            sliders.epap.value = epap;
        }

        const deltaP = ipap - epap;
        const tiSet = sliders.tiSet ? parseFloat(sliders.tiSet.value) : 1.0;
        const backupRate = sliders.backupRate ? parseInt(sliders.backupRate.value, 10) : 12;
        const stActive = checkStActive ? checkStActive.checked : false;
        const rr = parseInt(sliders.rr.value, 10);
        const fio2 = parseInt(sliders.fio2.value, 10);
        const compliance = parseFloat(sliders.compliance.value);
        const resistance = parseFloat(sliders.resistance.value);
        const flowLimitation = sliders.flowLimitation ? parseFloat(sliders.flowLimitation.value) : 0.0;
        const expRatio = sliders.expRatio ? parseFloat(sliders.expRatio.value) : 1.5;
        const rrSpont = parseInt(sliders.rrSpont.value, 10);
        const pmus = parseFloat(sliders.pmus.value);
        const tiNeural = parseFloat(sliders.tiNeural.value);
        const pmusExp = parseFloat(sliders.pmusExp.value);
        const variability = parseInt(sliders.variability.value, 10);
        const cardiac = parseFloat(sliders.cardiacArtifact.value);
        const cycling = parseFloat(sliders.cycling.value) / 100;
        const tiMax = sliders.tiMax ? parseFloat(sliders.tiMax.value) : (simulator.settings.tiMax || 2.0);
        const riseTime = parseFloat(sliders.riseTime.value) / 1000;
        const leak = sliders.leak ? parseFloat(sliders.leak.value) : 0;
        const triggerVal = parseFloat(sliders.trigger.value);

        // Fase 4: Pasientantropometri og Alarmgrenser
        const height = sliders.height ? parseInt(sliders.height.value, 10) : 175;
        const apneaDelay = sliders.apneaDelay ? parseInt(sliders.apneaDelay.value, 10) : 20;
        const alarmLeakVal = sliders.alarmLeak ? parseFloat(sliders.alarmLeak.value) : 40;
        const alarmLowVt = sliders.alarmLowVt ? parseInt(sliders.alarmLowVt.value, 10) : 300;
        const alarmHighVt = sliders.alarmHighVt ? parseInt(sliders.alarmHighVt.value, 10) : 800;
        const alarmLowRr = sliders.alarmLowRr ? parseInt(sliders.alarmLowRr.value, 10) : 0;
        const alarmHighRr = sliders.alarmHighRr ? parseInt(sliders.alarmHighRr.value, 10) : 30;
        const alarmHighPpeak = sliders.alarmHighPpeak ? parseFloat(sliders.alarmHighPpeak.value) : 40;

        // Oppdater simulatoren
        simulator.settings.mode = selectMode ? selectMode.value : 'PS';
        simulator.settings.ipap = ipap;
        simulator.settings.epap = epap;
        simulator.settings.tiSet = tiSet;
        simulator.settings.backupRate = backupRate;
        simulator.settings.stActive = stActive;
        simulator.settings.rr = rr;
        simulator.settings.fio2 = fio2;
        simulator.settings.riseTime = riseTime;
        simulator.settings.cyclingPercent = cycling;
        simulator.settings.tiMax = tiMax;
        simulator.settings.leak = leak;
        simulator.settings.apneaDelay = apneaDelay;
        if (simulator.settings.alarmLeakUnit === 'percent') {
            simulator.settings.alarmLeakPercentLimit = alarmLeakVal;
        } else {
            simulator.settings.alarmLeakLimit = alarmLeakVal;
        }
        simulator.settings.alarmLowVtLimit = alarmLowVt;
        simulator.settings.alarmHighVtLimit = alarmHighVt;
        simulator.settings.alarmLowRrLimit = alarmLowRr;
        simulator.settings.alarmHighRrLimit = alarmHighRr;
        simulator.settings.alarmHighPpeak = alarmHighPpeak;
        simulator.settings.alarmHighPpeakDelta = alarmHighPpeak - ipap;

        if (simulator.settings.triggerMode === 'flow') {
            simulator.settings.triggerFlow = triggerVal;
        } else {
            simulator.settings.triggerPressure = triggerVal;
        }

        simulator.patient.compliance = compliance;
        simulator.patient.resistance = resistance;
        simulator.patient.flowLimitation = flowLimitation;
        simulator.patient.expRatio = expRatio;
        simulator.patient.height = height;
        simulator.patient.gender = currentGender;

        simulator.patientDrive.rrSpont = rrSpont;
        simulator.patientDrive.pmusMax = pmus;
        simulator.patientDrive.tiNeural = tiNeural;
        simulator.patientDrive.pmusExp = pmusExp;
        simulator.patientDrive.variability = variability;
        simulator.patientDrive.cardiacArtifact = cardiac;

        // D1: Viser både absolutt trykk og ΔP samtidig i begge moduser
        if (badges.ipap) badges.ipap.textContent = `${ipap} cmH₂O (ΔP ${deltaP})`;
        if (labelDeltaPInfo) labelDeltaPInfo.textContent = `ΔP over PEEP: ${deltaP} cmH₂O`;
        if (badges.epap) badges.epap.textContent = `${epap} cmH₂O`;
        if (badges.tiSet) badges.tiSet.textContent = `${tiSet.toFixed(2)} s`;
        if (badges.backupRate) badges.backupRate.textContent = `${backupRate} /min`;
        if (badges.rr) badges.rr.textContent = `${rr} /min`;
        if (badges.fio2) badges.fio2.textContent = `${fio2} %`;
        if (badges.compliance) badges.compliance.textContent = `${compliance} ml/cmH₂O`;
        if (badges.resistance) badges.resistance.textContent = `${resistance} cmH₂O/(L/s)`;
        if (badges.flowLimitation) badges.flowLimitation.textContent = `${flowLimitation.toFixed(2)}`;
        if (badges.expRatio) badges.expRatio.textContent = `${expRatio.toFixed(1)} ×`;
        if (badges.rrSpont) badges.rrSpont.textContent = `${rrSpont} /min`;
        if (badges.pmus) badges.pmus.textContent = `${pmus.toFixed(1)} cmH₂O`;
        if (badges.tiNeural) badges.tiNeural.textContent = `${tiNeural.toFixed(2)} s`;
        if (badges.pmusExp) badges.pmusExp.textContent = `${pmusExp.toFixed(1)} cmH₂O`;
        if (badges.variability) badges.variability.textContent = `${variability} %`;
        if (badges.cardiacArtifact) badges.cardiacArtifact.textContent = `${cardiac.toFixed(1)} L/min`;
        if (badges.cycling) badges.cycling.textContent = `${Math.round(cycling * 100)} %`;
        if (badges.tiMax) badges.tiMax.textContent = `${tiMax.toFixed(1)} s`;
        if (badges.riseTime) badges.riseTime.textContent = `${Math.round(riseTime * 1000)} ms`;
        if (badges.leak) badges.leak.textContent = `${leak} L/min`;

        // Fase 4 Badges & Labels
        if (badges.height) badges.height.textContent = `${height} cm`;
        const currentIbw = simulator.getPatientIBW();
        if (badgeIbwCalc) badgeIbwCalc.textContent = `IBW: ${currentIbw} kg`;
        if (badges.apneaDelay) badges.apneaDelay.textContent = `${apneaDelay} s`;
        if (badges.alarmLeak) {
            if (simulator.settings.alarmLeakUnit === 'percent') {
                badges.alarmLeak.textContent = `${Math.round(alarmLeakVal)} %`;
            } else {
                badges.alarmLeak.textContent = `${Math.round(alarmLeakVal)} L/min`;
            }
        }
        if (badges.alarmLowVt) badges.alarmLowVt.textContent = `Lav: ${alarmLowVt} ml`;
        if (badges.alarmHighVt) badges.alarmHighVt.textContent = `Høy: ${alarmHighVt} ml`;
        if (labelAlarmLowVtVal) labelAlarmLowVtVal.textContent = `${alarmLowVt} ml`;
        if (labelAlarmHighVtVal) labelAlarmHighVtVal.textContent = `${alarmHighVt} ml`;

        if (badges.alarmLowRr) badges.alarmLowRr.textContent = `Lav: ${alarmLowRr} /min`;
        if (badges.alarmHighRr) badges.alarmHighRr.textContent = `Høy: ${alarmHighRr} /min`;
        if (labelAlarmLowRrVal) labelAlarmLowRrVal.textContent = alarmLowRr === 0 ? `0 /min (Av)` : `${alarmLowRr} /min`;
        if (labelAlarmHighRrVal) labelAlarmHighRrVal.textContent = `${alarmHighRr} /min`;

        if (badges.alarmHighPpeak) {
            badges.alarmHighPpeak.textContent = `${alarmHighPpeak} cmH₂O`;
        }

        if (badges.trigger) {
            if (simulator.settings.triggerMode === 'flow') {
                badges.trigger.textContent = `${triggerVal.toFixed(1)} L/min`;
            } else {
                badges.trigger.textContent = `${triggerVal.toFixed(1)} cmH₂O`;
            }
        }

        updateTriggerSyncUI();

        // C4: Oppdater modusetiketten dynamisk når ST-innstillinger endres
        if (simulator.settings.mode === 'PS' && modeBadge) {
            modeBadge.innerHTML = '<span>Modus: BPAP</span>';
        }
        if (!isScenarioActive) {
            updateInsights();
        }
    }

    // Lytt på slider-endringer (T25: Situasjonen utvikler seg naturlig videre)
    Object.values(sliders).forEach(slider => {
        if (!slider) return;
        slider.addEventListener('input', () => {
            if (slider === sliders.compliance || slider === sliders.resistance ||
                slider === sliders.flowLimitation || slider === sliders.expRatio ||
                slider === sliders.rrSpont || slider === sliders.pmus ||
                slider === sliders.tiNeural || slider === sliders.pmusExp) {
                setActivePresetButton(null);
                simulator.patient.preset = 'custom';
            }
            // Når en slider endres manuelt, overtar normal fysiologisk analyse
            isScenarioActive = false;

            // Fasiten gjelder scenariets utgangspunkt. Så snart brukeren endrer
            // en innstilling er den ikke lenger gyldig.
            renderer.setAnnotations([]);
            if (typeof setAnnotationButtonState === 'function') setAnnotationButtonState(false);
            if (!hasShownSettingChangedToast) {
                hasShownSettingChangedToast = true;
                showToast('🔧 <strong>Du har endret en innstilling.</strong> Fasiten gjaldt scenariets utgangspunkt og er slått av. Les kurvene på nytt.');
            }

            updateSimulatorFromUI();
            updateInsights();
        });
    });

    if (checkStActive) {
        checkStActive.addEventListener('change', () => {
            isScenarioActive = false;

            // Fasiten gjelder scenariets utgangspunkt. Så snart brukeren endrer
            // en innstilling er den ikke lenger gyldig.
            renderer.setAnnotations([]);
            if (typeof setAnnotationButtonState === 'function') setAnnotationButtonState(false);
            if (!hasShownSettingChangedToast) {
                hasShownSettingChangedToast = true;
                showToast('🔧 <strong>Du har endret en innstilling.</strong> Fasiten gjaldt scenariets utgangspunkt og er slått av. Les kurvene på nytt.');
            }

            updateSimulatorFromUI();
            updateInsights();
        });
    }

    // Trinnknapper (+ / -)
    document.querySelectorAll('.step-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-target');
            const step = parseFloat(btn.getAttribute('data-step'));
            const targetSlider = document.getElementById(targetId);
            if (targetSlider && !targetSlider.disabled) {
                let currentVal = parseFloat(targetSlider.value);
                let min = parseFloat(targetSlider.min);
                let max = parseFloat(targetSlider.max);
                let newVal = Math.min(max, Math.max(min, currentVal + step));
                
                if (step % 1 !== 0) {
                    const decimals = (step.toString().split('.')[1] || '').length;
                    newVal = parseFloat(newVal.toFixed(decimals));
                }
                
                targetSlider.value = newVal;
                targetSlider.dispatchEvent(new Event('input'));
            }
        });
    });

    // =========================================================================
    // 4. PRESETS (KLINISKE PASIENTPROFILER)
    // =========================================================================
    function setActivePresetButton(activeKey) {
        Object.entries(presetBtns).forEach(([key, btn]) => {
            if (!btn) return;
            btn.classList.toggle('active', key === activeKey);
        });
    }

    function setActiveScenarioButton(activeKey) {
        Object.entries(scenarioBtns).forEach(([key, btn]) => {
            if (!btn) return;
            btn.classList.toggle('active', key === activeKey);
        });
    }

    function applyPreset(presetKey) {
        simulator.setPreset(presetKey);
        setActivePresetButton(presetKey);
        setActiveScenarioButton(null);
        isScenarioActive = false;

        // Synkroniser slidere med den nye preset-tilstanden (A6)
        if (sliders.compliance) sliders.compliance.value = simulator.patient.compliance;
        if (sliders.resistance) sliders.resistance.value = simulator.patient.resistance;
        if (sliders.flowLimitation) sliders.flowLimitation.value = simulator.patient.flowLimitation;
        if (sliders.expRatio) sliders.expRatio.value = simulator.patient.expRatio;
        if (sliders.rrSpont) sliders.rrSpont.value = simulator.patientDrive.rrSpont;
        if (sliders.pmus) sliders.pmus.value = simulator.patientDrive.pmusMax;
        if (sliders.tiNeural) sliders.tiNeural.value = simulator.patientDrive.tiNeural;
        if (sliders.pmusExp) sliders.pmusExp.value = simulator.patientDrive.pmusExp;
        if (sliders.variability) sliders.variability.value = simulator.patientDrive.variability;
        if (sliders.cardiacArtifact) sliders.cardiacArtifact.value = simulator.patientDrive.cardiacArtifact;

        if (presetKey === 'copd') {
            if (sliders.ipap) sliders.ipap.value = 16;
            if (sliders.epap) sliders.epap.value = 5;
            if (sliders.rr) sliders.rr.value = 16;
            if (sliders.cycling) sliders.cycling.value = 25;
            if (sliders.tiMax) sliders.tiMax.value = 2.0;
        } else if (presetKey === 'restrictive') {
            if (sliders.ipap) sliders.ipap.value = 18;
            if (sliders.epap) sliders.epap.value = 8;
            if (sliders.rr) sliders.rr.value = 20;
            if (sliders.cycling) sliders.cycling.value = 25;
            if (sliders.tiMax) sliders.tiMax.value = 2.0;
        } else if (presetKey === 'normal') {
            if (sliders.ipap) sliders.ipap.value = 8;
            if (sliders.epap) sliders.epap.value = 5;
            if (sliders.rr) sliders.rr.value = 12;
            if (sliders.cycling) sliders.cycling.value = 25;
            if (sliders.tiMax) sliders.tiMax.value = 2.0;
        }

        renderer.setAnnotations([]);
        setVentilationMode('PS');
        updateSimulatorFromUI();
        updateInsights();
    }

    Object.entries(presetBtns).forEach(([key, btn]) => {
        if (btn) {
            btn.addEventListener('click', () => applyPreset(key));
        }
    });

    // =========================================================================
    // D4: SCENARIO-HANDLER (EKTE PARAMETERSETT — T24 & T25)
    // =========================================================================
    function applyScenario(scenarioKey) {
        const scen = SCENARIOS[scenarioKey];
        if (!scen) return;

        currentScenarioKey = scenarioKey;
        isScenarioActive = true;
        setActiveScenarioButton(scenarioKey);
        setActivePresetButton(null);

        // 1. Sett ALLE innstillinger synlig på slidere
        if (selectMode) selectMode.value = scen.mode;
        if (sliders.ipap) sliders.ipap.value = scen.ipap;
        if (sliders.epap) sliders.epap.value = scen.epap;
        if (sliders.tiSet) sliders.tiSet.value = scen.tiSet;
        if (sliders.backupRate) sliders.backupRate.value = scen.backupRate;
        if (checkStActive) checkStActive.checked = !!scen.stActive;
        if (sliders.rr) sliders.rr.value = scen.rr;
        if (sliders.fio2) sliders.fio2.value = scen.fio2;
        if (sliders.riseTime) sliders.riseTime.value = scen.riseTime;
        if (sliders.cycling) sliders.cycling.value = scen.cycling;
        if (sliders.tiMax) sliders.tiMax.value = scen.tiMax;
        if (sliders.leak) sliders.leak.value = scen.leak;
        if (sliders.compliance) sliders.compliance.value = scen.compliance;
        if (sliders.resistance) sliders.resistance.value = scen.resistance;
        if (sliders.flowLimitation) sliders.flowLimitation.value = scen.flowLimitation;
        if (sliders.expRatio) sliders.expRatio.value = scen.expRatio;
        if (sliders.rrSpont) sliders.rrSpont.value = scen.rrSpont;
        if (sliders.pmus) sliders.pmus.value = scen.pmus;
        if (sliders.tiNeural) sliders.tiNeural.value = scen.tiNeural;
        if (sliders.pmusExp) sliders.pmusExp.value = scen.pmusExp;
        if (sliders.variability) sliders.variability.value = scen.variability;
        if (sliders.cardiacArtifact) sliders.cardiacArtifact.value = scen.cardiac;
        if (sliders.height) sliders.height.value = scen.height;
        setGender(scen.gender || 'male');

        // Sett triggermodus og triggerverdi
        setTriggerMode(scen.triggerMode || 'flow');
        if (sliders.trigger) sliders.trigger.value = scen.triggerVal;

        // Sett ventilasjonsmodus (PS/PC)
        setVentilationMode(scen.mode);

        // D6: Klargjør fasit-annotasjoner for dette scenarioet
        renderer.setAnnotations(scen.annotations || []);
        if (typeof setAnnotationButtonState === 'function') setAnnotationButtonState(false);
        hasShownSettingChangedToast = false;

        // Oppdater innsiktsboksen med tre punkter (D4 krav) + eventuell Tolkning
        if (insightText) {
            insightText.innerHTML = `
                <div style="margin-bottom: 8px; font-size: 14px; font-weight: 700; color: #f0abfc;">
                    🎯 Scenario: ${scen.name} (${scen.badge})
                </div>
                ${scen.pasient ? `
                <div style="margin-bottom: 8px; padding: 7px 10px; background: rgba(168, 85, 247, 0.10); border-left: 3px solid #a855f7; border-radius: 4px; font-size: 12.5px; line-height: 1.45;">
                    🧑 <strong>Pasient:</strong> ${scen.pasient}
                </div>` : ''}
                ${scen.tolkning ? `
                <div style="margin-bottom: 8px; padding: 7px 10px; background: rgba(56, 189, 248, 0.08); border-left: 3px solid #38bdf8; border-radius: 4px; font-size: 12.5px; line-height: 1.45; color: #e0f2fe;">
                    📋 <strong>Tolkning:</strong> ${scen.tolkning}
                </div>` : ''}
                <div style="margin-bottom: 6px;">
                    👁️ <strong>Hva du ser:</strong> ${scen.whatYouSee}
                </div>
                <div style="margin-bottom: 6px;">
                    🔍 <strong>Hvorfor det skjer:</strong> ${scen.whyItHappens}
                </div>
                <div style="margin-bottom: 6px;">
                    🛠️ <strong>Hva du gjør med det:</strong> ${scen.whatToDo}
                </div>
                <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.1); font-size: 11.5px; color: var(--text-muted);">
                    💡 <em>Pedagogisk tips: Endre en hvilken som helst slider nå for å se hvordan situasjonen utvikler seg videre!</em>
                </div>
            `;
        }

        // Utviklingssjekk: fang scenarioverdier som ikke treffer slidernes step.
        // Nettleseren runder dem stille, og simulatoren kjører da med en annen
        // verdi enn scenariet er definert med.
        const STEG_SJEKK = {
            ipap: 'ipap', epap: 'epap', rr: 'rr', riseTime: 'riseTime',
            cycling: 'cycling', tiMax: 'tiMax', tiSet: 'tiSet', leak: 'leak',
            backupRate: 'backupRate', compliance: 'compliance', resistance: 'resistance',
            expRatio: 'expRatio', flowLimitation: 'flowLimitation', rrSpont: 'rrSpont',
            pmus: 'pmus', tiNeural: 'tiNeural', pmusExp: 'pmusExp',
            variability: 'variability', height: 'height',
            cardiac: 'cardiacArtifact', triggerVal: 'trigger'
        };
        Object.entries(STEG_SJEKK).forEach(([scenKey, sliderKey]) => {
            const el = sliders[sliderKey];
            if (!el || scen[scenKey] === undefined) return;
            if (parseFloat(el.value) !== parseFloat(scen[scenKey])) {
                console.warn(
                    `[Scenario "${scenarioKey}"] ${scenKey}: definert ${scen[scenKey]}, ` +
                    `slideren ble ${el.value} (min ${el.min}, max ${el.max}, step ${el.step})`
                );
            }
        });

        updateSimulatorFromUI();
    }

    Object.entries(scenarioBtns).forEach(([key, btn]) => {
        if (btn) {
            btn.addEventListener('click', () => applyScenario(key));
        }
    });

    // 5. Fane-veksling
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.style.display = 'none');

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            const targetPane = document.getElementById(targetId);
            if (targetPane) {
                targetPane.style.display = 'block';
            }
        });
    });

    // Monitor verktøylinje event listeners (C8, D3, C9)
    function setSweepDurationUI(duration = 15) {
        if (btnSweep15) {
            btnSweep15.classList.add('active');
        }
        renderer.setSweepDuration(15);
    }

    if (btnSweep15) btnSweep15.addEventListener('click', () => setSweepDurationUI(15));

    function setScaleModeUI(isAuto = true) {
        if (btnScaleLocked) btnScaleLocked.classList.toggle('active', !isAuto);
        if (btnScaleAuto) btnScaleAuto.classList.add('active');
        renderer.setAutoScale('all', true);
    }

    if (btnScaleLocked) btnScaleLocked.addEventListener('click', () => setScaleModeUI(false));
    if (btnScaleAuto) btnScaleAuto.addEventListener('click', () => setScaleModeUI(true));

    // =========================================================================
    // D6: UNDERVISNINGSMODUS (FRYS, KURSOR, KOPIER BILDE, VIS FASIT)
    // =========================================================================
    // 1. Frys / Pause
    btnPause.addEventListener('click', () => {
        isPaused = !isPaused;
        simulator.isRunning = !isPaused;
        renderer.setFrozen(isPaused);

        if (isPaused) {
            pauseIcon.textContent = '▶';
            pauseText.textContent = 'Fortsett';
            btnPause.classList.add('active');
            showToast('❄️ <strong>Simulering fryst:</strong> Beveg musen eller trykk på kurven for å inspisere verdier.');
        } else {
            pauseIcon.textContent = '⏸';
            pauseText.textContent = 'Pause / Frys';
            btnPause.classList.remove('active');
            renderer.clearCursor();
            lastTimestamp = performance.now();
        }
    });

    // 2. Kursor-sporing over canvas (D6)
    const canvasElem = document.getElementById('waveformCanvas');
    function handleCursorMove(e) {
        if (!canvasElem) return;
        const rect = canvasElem.getBoundingClientRect();
        const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
        const clientY = (e.touches && e.touches.length > 0) ? e.touches[0].clientY : e.clientY;
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        renderer.setCursor(x, y);
    }

    function handleCursorLeave() {
        renderer.clearCursor();
    }

    if (canvasElem) {
        canvasElem.addEventListener('mousemove', handleCursorMove);
        canvasElem.addEventListener('mouseleave', handleCursorLeave);
        canvasElem.addEventListener('touchmove', handleCursorMove, { passive: true });
        canvasElem.addEventListener('touchstart', handleCursorMove, { passive: true });
        canvasElem.addEventListener('touchend', handleCursorLeave);
    }

    // 3. Kopier skjermbilde til utklippstavle (D6)
    if (btnCopyScreenshot) {
        btnCopyScreenshot.addEventListener('click', async () => {
            const success = await renderer.copyToClipboard();
            if (success) {
                showToast('📸 <strong>Skjermbilde kopiert:</strong> Kurvebildet er lagt på utklippstavlen og kan limes rett inn i Rise 360 / PPT!');
            } else {
                showToast('⚠️ Kunne ikke legge bilde på utklippstavlen direkte. Bruk Win+Shift+S (skjermklipp).');
            }
        });
    }

    // 4. Vis fasit / annotasjoner (D6)
    if (btnToggleAnnotations) {
        btnToggleAnnotations.addEventListener('click', () => {
            const isShown = renderer.toggleAnnotations();
            setAnnotationButtonState(isShown);
            if (isShown) {
                showToast('💡 <strong>Fasit aktivert:</strong> Viser pedagogiske piler og markeringer for gjeldende scenario.');
            }
        });
    }

    // Nullstill-knapp
    btnReset.addEventListener('click', () => {
        simulator.reset();
        currentGender = 'male';
        if (btnGenderMale) btnGenderMale.classList.add('active');
        if (btnGenderFemale) btnGenderFemale.classList.remove('active');
        
        applyScenario('wellAdjusted');

        if (checkShowTrueCurves) {
            checkShowTrueCurves.checked = false;
            renderer.showTrueCurves = false;
        }

        // Tilbakestill monitorinnstillinger til klinisk standard (C8, C9)
        setSweepDurationUI(15);
        setScaleModeUI(false);
        setLeakAlarmUnit('lmin');
        if (sliders.apneaDelay) sliders.apneaDelay.value = 20;
        if (sliders.alarmLeak) sliders.alarmLeak.value = 40;
        if (sliders.alarmLowVt) sliders.alarmLowVt.value = 300;
        if (sliders.alarmHighVt) sliders.alarmHighVt.value = 800;
        if (sliders.alarmLowRr) sliders.alarmLowRr.value = 0;
        if (sliders.alarmHighRr) sliders.alarmHighRr.value = 30;
        if (sliders.alarmHighPpeak) sliders.alarmHighPpeak.value = 40;

        if (isPaused) {
            isPaused = false;
            simulator.isRunning = true;
            renderer.setFrozen(false);
            pauseIcon.textContent = '⏸';
            pauseText.textContent = 'Pause / Frys';
            btnPause.classList.remove('active');
        }

        renderer.initCanvas();
        updateSimulatorFromUI();
        showToast('↺ Simuleringen er nullstilt til standardinnstillinger.');
    });

    // 7. Oppdater pedagogisk innsikt (C12: Regelbasert)
    function updateInsights() {
        const insights = simulator.getPhysiologicalInsights();
        if (insightTau) insightTau.textContent = `${insights.tau} s`;
        if (insightDeltaP) insightDeltaP.textContent = `${insights.drivingPressure} cmH₂O`;
        if (insightTheoVt) {
            insightTheoVt.textContent = `${insights.theoreticalVt} ml`;
            const parent = insightTheoVt.parentElement;
            if (parent) {
                if (!parent.dataset.labeled) {
                    parent.dataset.labeled = 'true';
                    for (const node of parent.childNodes) {
                        if (node.nodeType === Node.TEXT_NODE && node.textContent.includes('Teoretisk')) {
                            node.textContent = node.textContent.replace('Teoretisk', 'Forventet');
                        }
                    }
                    const sub = parent.querySelector('sub');
                    if (sub && sub.nextSibling && sub.nextSibling.nodeType === Node.TEXT_NODE) {
                        sub.nextSibling.textContent = ' (maskin + pasient): ';
                    }
                }
                const titleText = `Forventet Vt (maskin + pasient):\n• Maskin: ${insights.machineVt} ml\n• Pasient: ${insights.patientVt} ml`;
                parent.title = titleText;
                insightTheoVt.title = titleText;

                let subtext = parent.querySelector('.insight-breakdown');
                if (!subtext) {
                    subtext = document.createElement('span');
                    subtext.className = 'insight-breakdown';
                    subtext.style.marginLeft = '5px';
                    subtext.style.fontSize = '0.85em';
                    subtext.style.opacity = '0.85';
                    parent.appendChild(subtext);
                }
                subtext.textContent = `(maskin ${insights.machineVt} + pasient ${insights.patientVt} ml)`;
            }
        }
        
        if (insightCycleReason) {
            if (insights.lastCycleReason === 'pressureLimit') {
                const setLim = simulator.settings.alarmHighPpeak !== undefined ? simulator.settings.alarmHighPpeak : 40;
                const effLim = Math.max(simulator.settings.epap + 2, setLim - 10).toFixed(0);
                insightCycleReason.textContent = `🛑 P-maks (${effLim} cmH₂O)`;
                insightCycleReason.style.color = '#ef4444';
            } else if (insights.lastCycleReason === 'tiMax') {
                insightCycleReason.textContent = `⚠️ Ti-max (${simulator.settings.tiMax.toFixed(1)}s)`;
                insightCycleReason.style.color = 'var(--color-warning)';
            } else if (insights.lastCycleReason === 'timeSet') {
                insightCycleReason.textContent = `Ti-innstilt (${simulator.settings.tiSet.toFixed(2)}s)`;
                insightCycleReason.style.color = '#38bdf8';
            } else {
                insightCycleReason.textContent = `Flow (${Math.round(simulator.settings.cyclingPercent * 100)}%)`;
                insightCycleReason.style.color = '#38bdf8';
            }
        }

        if (insightText && !isScenarioActive) {
            insightText.innerHTML = insights.clinicalNote;
        }
    }

    // 8. Oppdater målte pasientverdier i displayet og håndter alarmtilstand (C1, C3, C5, C6, D5)
    let readoutUpdateTimer = 0;
    function updateReadouts(dt) {
        readoutUpdateTimer += dt;
        if (readoutUpdateTimer >= 0.25) {
            readoutUpdateTimer = 0;

            const m = simulator.state.measured;
            const activeAlarms = simulator.state.activeAlarms || [];

            // C3: Oppdater alarmbanner med alle aktive alarmer
            if (alarmBanner && alarmList) {
                if (activeAlarms.length > 0) {
                    alarmBanner.classList.remove('hidden');
                    alarmList.innerHTML = activeAlarms.map(a => `
                        <div class="alarm-item alarm-type-${a.type}">
                            <span class="alarm-icon">${a.type === 'danger' ? '🚨' : '⚠️'}</span>
                            <div class="alarm-text-block">
                                <span class="alarm-title">${a.title}</span>
                                <span class="alarm-msg">${a.msg}</span>
                            </div>
                        </div>
                    `).join('');
                } else {
                    alarmBanner.classList.add('hidden');
                    alarmList.innerHTML = '';
                }
            }

            // Primære måleverdier (C1, C5: ekte målinger, aldri snappet til 0)
            if (valPpeak) valPpeak.textContent = m.ppeak.toFixed(1);
            if (valVt) valVt.textContent = m.vt;
            if (valMv) valMv.textContent = m.mv.toFixed(1);
            if (valRR) valRR.textContent = m.rrTotal;

            // Målekort visuell alarm-status
            const hasApnea = activeAlarms.some(a => a.id === 'apnea');
            const hasHighPressure = activeAlarms.some(a => a.id === 'high_pressure');
            const hasLowVt = activeAlarms.some(a => a.id === 'low_vt');
            const hasHighVt = activeAlarms.some(a => a.id === 'high_vt');
            const hasLowRr = activeAlarms.some(a => a.id === 'low_rr');
            const hasHighRr = activeAlarms.some(a => a.id === 'high_rr');

            if (cardMetricPpeak) cardMetricPpeak.classList.toggle('metric-alarm-active', hasHighPressure);
            if (cardMetricVt) cardMetricVt.classList.toggle('metric-alarm-active', hasLowVt || hasHighVt);
            if (cardMetricMv) cardMetricMv.classList.toggle('metric-alarm-active', hasApnea);
            if (cardMetricRR) cardMetricRR.classList.toggle('metric-alarm-active', hasApnea || hasHighRr || hasLowRr);

            // Sekundære måleverdier (D5)
            const peepTot = (simulator.settings.epap + m.peepi).toFixed(1);
            if (dispPeepPeepi) dispPeepPeepi.textContent = `${simulator.settings.epap.toFixed(1)} / ${m.peepi.toFixed(1)}`;
            if (dispPeepTot) dispPeepTot.innerHTML = `PEEP<sub>tot</sub>: ${peepTot} cmH₂O`;

            if (dispLeakSec) dispLeakSec.innerHTML = `${m.leak.toFixed(1)} <span class="sub-val-secondary">(${m.leakPercent.toFixed(0)}%)</span>`;
            if (dispLeakStatus) {
                dispLeakStatus.textContent = (m.leak > 40 || m.leakPercent > 40) ? '⚠️ Høy lekkasje' : ((m.leak > 15 || m.leakPercent > 20) ? 'Moderat lekkasje' : 'Tett krets');
            }

            updateInsights();
        }
    }

    // 9. Hoved-animasjonsloop (60 FPS)
    function loop(currentTimestamp) {
        const elapsedSec = (currentTimestamp - lastTimestamp) / 1000;
        lastTimestamp = currentTimestamp;

        if (!isPaused && elapsedSec > 0) {
            if (elapsedSec > 0.5) {
                // Fanen har vært i bakgrunnen — hopp over uten å skape tidssprang i kurvene
                simulator.step(elapsedSec);
            } else {
                // 1. Simuler fysiologi
                simulator.step(elapsedSec);

                // 2. C7 & D3: Send min/maks-konvolutt og hendelser til grafisk monitor
                const wasTriggered = simulator.state.justTriggered;
                simulator.state.justTriggered = false;

                renderer.addSample(
                    elapsedSec,
                    simulator.frameSample,
                    simulator.state.volume,
                    simulator.state.flow,
                    wasTriggered,
                    simulator.settings.epap,
                    simulator.state.volume_lung,
                    simulator.state.flow_lung,
                    simulator.frameEvents
                );

                // 3. Oppdater måletall og alarmbanner
                updateReadouts(elapsedSec);
            }
        }

        // 4. Tegn kurver (renderer håndterer frys, kursor og annotasjoner)
        renderer.render();

        requestAnimationFrame(loop);
    }

    // Start opp med default-verdier
    applyScenario('wellAdjusted');
    requestAnimationFrame(loop);
});
