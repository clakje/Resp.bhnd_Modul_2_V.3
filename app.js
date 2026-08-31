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
    const dispPipPplat = document.getElementById('dispPipPplat');
    const dispDeltaPres = document.getElementById('dispDeltaPres');
    const dispPeepPeepi = document.getElementById('dispPeepPeepi');
    const dispPeepTot = document.getElementById('dispPeepTot');
    const dispVtiVte = document.getElementById('dispVtiVte');
    const dispLeakPerBreath = document.getElementById('dispLeakPerBreath');
    const dispVtPerKg = document.getElementById('dispVtPerKg');
    const dispIbwFoot = document.getElementById('dispIbwFoot');
    const dispTiTe = document.getElementById('dispTiTe');
    const dispIeRatio = document.getElementById('dispIeRatio');
    const dispRrSpont = document.getElementById('dispRrSpont');
    const dispSpontFoot = document.getElementById('dispSpontFoot');
    const dispLeakSec = document.getElementById('dispLeakSec');
    const dispLeakStatus = document.getElementById('dispLeakStatus');
    const dispAsynchronyIndex = document.getElementById('dispAsynchronyIndex');
    const dispCycleReasonFoot = document.getElementById('dispCycleReasonFoot');

    // Innstilte visningsbokser
    const dispIpap = document.getElementById('dispIpap');
    const dispEpap = document.getElementById('dispEpap');
    const dispFio2 = document.getElementById('dispFio2');

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
    // D4: SCENARIO-DEFINISJONER (EKTE PARAMETERSETT + 3 PUNKTER + ANNOTASJONER)
    // =========================================================================
    const SCENARIOS = {
        wellAdjusted: {
            name: 'Godt tilpasset NIV',
            badge: '✅ Referanse',
            mode: 'PS',
            ipap: 8,
            epap: 5,
            rr: 12,
            fio2: 30,
            riseTime: 150,
            cycling: 25,
            tiSet: 1.0,
            tiMax: 2.0,
            leak: 0,
            triggerMode: 'flow',
            triggerVal: 1.5,
            stActive: false,
            backupRate: 12,
            compliance: 90,
            resistance: 5,
            flowLimitation: 0.0,
            expRatio: 1.0,
            rrSpont: 12,
            pmus: 5.0,
            tiNeural: 1.0,
            pmusExp: 0.0,
            variability: 15,
            cardiac: 0.0,
            height: 175,
            whatYouSee: 'Alle pasientinnsatser utløser assisterte pust (▲) med stabilt tidalvolum (~500 ml). Ekspirasjonsflow returnerer uanstrengt til null før neste innpust (Auto-PEEP 0 cmH₂O).',
            whyItHappens: 'Respiratorens trykkstøtte (IPAP 8 / EPAP 5), stigetid, trigger og cycling er optimalt synkronisert med pasientens egen pusterytme (12/min, Ti 1,0 s, Pmus 5 cmH₂O) og lungefysiologi (C 90, R 5).',
            whatToDo: 'Referansebildet for vellykket NIV-behandling. Pasienten er godt ventilert og synkron — fortsett klinisk overvåking.',
            annotations: [
                { track: 'paw', relX: 0.45, relY: 0.35, title: 'Stabil Paw', desc: 'Jevnt trykkplatå' },
                { track: 'flow', relX: 0.50, relY: 0.50, title: 'God tømming', desc: 'Flow når 0 før neste pust (Auto-PEEP 0)' }
            ]
        },
        mildlySedated: {
            name: 'Lungefrisk, lett sedert',
            badge: '😴 Lett sedert',
            mode: 'PS',
            ipap: 9,
            epap: 5,
            rr: 11,
            fio2: 30,
            riseTime: 150,
            cycling: 25,
            tiSet: 1.0,
            tiMax: 2.0,
            leak: 0,
            triggerMode: 'flow',
            triggerVal: 1.5,
            stActive: false,
            backupRate: 10,
            compliance: 90,
            resistance: 5,
            flowLimitation: 0.0,
            expRatio: 1.0,
            rrSpont: 11,
            pmus: 3.0,
            tiNeural: 1.0,
            pmusExp: 0.0,
            variability: 5,
            cardiac: 0.0,
            height: 175,
            tolkning: 'Pasienten har normale lunger og normal respiratorisk muskelstyrke. Den lette sedasjonen reduserer respiratorisk drive noe, som gir litt lavere respirasjonsfrekvens og lavere Pmus,insp enn hos en våken person. Ekspirasjonen er passiv uten bukmuskelaktivitet. Pustemønsteret er regelmessig og stabilt.',
            whatYouSee: 'Regelmessig og rolig pustemønster (11/min) med stabilt tidalvolum (~500 ml). Ekspirasjonsflow returnerer fullstendig til null før neste innpust (Auto-PEEP 0 cmH₂O).',
            whyItHappens: 'Den lette sedasjonen reduserer pasientens eget respiratoriske drive (Pmus,insp 3 cmH₂O, 11/min), men trykkstøtten (IPAP 9 / EPAP 5, ΔP 4 cmH₂O) og normal lungefysiologi (C 90, R 5) sikrer harmonisk og fullgod ventilasjon.',
            whatToDo: 'Optimal klinisk situasjon. Ekspirasjonen er passiv uten bukmuskelaktivitet. Fortsett overvåking av sedasjonsdybde og respirasjonsdrive.',
            annotations: [
                { track: 'paw', relX: 0.45, relY: 0.35, title: 'Stabil trykkstøtte', desc: 'Jevnt og synkront platå' },
                { track: 'flow', relX: 0.50, relY: 0.50, title: 'Rolig tømming', desc: 'Flow når 0 før neste pust (Auto-PEEP 0)' }
            ]
        },
        slowTrigger: {
            name: 'For høy triggersensitivitet',
            badge: '🐢 Ufølsom trigger',
            mode: 'PS',
            ipap: 10,
            epap: 5,
            rr: 12,
            fio2: 30,
            riseTime: 150,
            cycling: 25,
            tiSet: 1.0,
            tiMax: 2.0,
            leak: 0,
            triggerMode: 'flow',
            triggerVal: 5.0,
            stActive: false,
            backupRate: 10,
            compliance: 90,
            resistance: 5,
            flowLimitation: 0.0,
            expRatio: 1.0,
            rrSpont: 12,
            pmus: 0.75,
            tiNeural: 1.0,
            pmusExp: 0.0,
            variability: 10,
            cardiac: 0.0,
            height: 175,
            tolkning: 'Pasienten har normal lungefysiologi (C 90 mL/cmH₂O, Rinsp 5 cmH₂O/L/s, Rexp 5 cmH₂O/L/s, Auto-PEEP 0 cmH₂O), men lav inspiratorisk muskelinnsats (Pmus,insp 2–3 cmH₂O, Pmus,max kap. 100 cmH₂O) som bare klarer å generere omtrent 3–4 L/min triggerflow. Dette demonstrerer effekten av triggerfølsomhet alene, uten forstyrrende variabler som auto-PEEP eller obstruksjon.',
            whatYouSee: 'Ved Trigger 5,0 L/min: Ingen trigging (0 %) — alle pasientinnsatser blir uassisterte med åpne trekanter (△) og «buler» i ekspirasjonsflowen. Ved Trigger 4,0 L/min: Sporadisk trigging. Ved Trigger 3,0 L/min: 100 % stabil og synkron trigging (▲) med tidalvolum ~450 ml.',
            whyItHappens: 'Respiratorens flow-triggerterskel er innstilt for ufølsomt (5,0 L/min) i forhold til pasientens svake inspiratoriske innsats (~3–4 L/min triggerflow). Pasienten når ikke over terskelen, og innpustene forblir uassisterte inntil triggeren justeres ned.',
            whatToDo: 'Gjør triggeren mer følsom ved å redusere flow-triggeren til 3,0 L/min eller lavere (f.eks. 1,5–2,0 L/min). Da trigges alle pust stabilt og maskinen leverer optimal trykkstøtte (IPAP 10 / EPAP 5, ΔP 5 cmH₂O, Vt 450 ml).',
            annotations: [
                { track: 'flow', relX: 0.45, relY: 0.65, title: 'Mislykket innsats', desc: 'Bule i ekspirasjonsflow (△)' },
                { track: 'paw', relX: 0.45, relY: 0.85, title: 'Uassistert innsats', desc: 'Maskinen reagerer ikke med trykkstøtte (△)' }
            ]
        },
        autotrigger: {
            name: 'Autotrigging',
            badge: '⚡ Falsk trigging',
            mode: 'PS',
            ipap: 14,
            epap: 5,
            rr: 12,
            fio2: 30,
            riseTime: 150,
            cycling: 25,
            tiSet: 1.0,
            tiMax: 2.0,
            leak: 40,
            triggerMode: 'flow',
            triggerVal: 1.0,
            stActive: false,
            backupRate: 12,
            compliance: 50,
            resistance: 5,
            flowLimitation: 0.0,
            expRatio: 1.5,
            rrSpont: 12,
            pmus: 2.0,
            tiNeural: 0.9,
            pmusExp: 0.0,
            variability: 5,
            cardiac: 0.0,
            height: 175,
            whatYouSee: 'Maskinfrekvensen (RRtot) er langt høyere enn pasientens spontane frekvens. Blandede markører med kryss-trekant (⨂).',
            whyItHappens: 'Kombinasjonen av stor maskelekkasje (40 L/min) og svært følsom trigger (1.0 L/min) gjør at turbulens og flow-svingninger trigger maskinen uten pasientinnsats.',
            whatToDo: 'Juster og stram masken for å eliminere lekkasje, og øk triggerterskelen til f.eks. 2.5–3.0 L/min.',
            annotations: [
                { track: 'flow', relX: 0.35, relY: 0.40, title: 'Autotrigger (⨂)', desc: 'Lekkasjefluktuasjon utløser innpust' }
            ]
        },
        slowRise: {
            name: 'Stigetid for treg',
            badge: '📉 Trykkdipp',
            mode: 'PS',
            ipap: 14,
            epap: 5,
            rr: 14,
            fio2: 30,
            riseTime: 800,
            cycling: 25,
            tiSet: 1.0,
            tiMax: 2.0,
            leak: 5,
            triggerMode: 'flow',
            triggerVal: 1.5,
            stActive: false,
            backupRate: 12,
            compliance: 50,
            resistance: 5,
            flowLimitation: 0.0,
            expRatio: 1.5,
            rrSpont: 14,
            pmus: 8.0,
            tiNeural: 0.9,
            pmusExp: 0.0,
            variability: 5,
            cardiac: 0.0,
            height: 175,
            whatYouSee: 'Avrundet trykkurve med en markant «dipp» eller skulder i starten av innpustet. Flowkurven blir lav, bred og flat.',
            whyItHappens: 'Stigetiden er satt for tregt (800 ms) i forhold til pasientens kraftige inspirasjonsdrive (Pmus 8 cmH₂O). Pasienten «suger ned» trykket raskere enn maskinen klarer å bygge det opp.',
            whatToDo: 'Forkort stigetiden (f.eks. til 100–150 ms) slik at maskinen raskt møter pasientens flow-etterspørsel og avlaster pustearbeidet.',
            annotations: [
                { track: 'paw', relX: 0.38, relY: 0.55, title: 'Trykkdipp', desc: 'Pasienten suger ned trykket pga. treg stigetid' }
            ]
        },
        fastRise: {
            name: 'Stigetid for rask',
            badge: '📈 Trykkoversving',
            mode: 'PS',
            ipap: 14,
            epap: 5,
            rr: 14,
            fio2: 30,
            riseTime: 50,
            cycling: 25,
            tiSet: 1.0,
            tiMax: 2.0,
            leak: 5,
            triggerMode: 'flow',
            triggerVal: 1.5,
            stActive: false,
            backupRate: 12,
            compliance: 50,
            resistance: 5,
            flowLimitation: 0.0,
            expRatio: 1.5,
            rrSpont: 14,
            pmus: 8.0,
            tiNeural: 0.9,
            pmusExp: 0.0,
            variability: 5,
            cardiac: 0.0,
            height: 175,
            whatYouSee: 'Skarp trykk-spike (overshoot) over innstilt IPAP ved innpuststart, etterfulgt av bratt flowforkant, tidlig avslutning og redusert tidalvolum.',
            whyItHappens: 'Blåseren akselererer for brått (50 ms) inn i luftveismotstanden. Trykksjokket gjør at flow faller prematurt til cycling-terskelen.',
            whatToDo: 'Myk opp stigetiden (f.eks. til 150–200 ms) for å unngå trykk-spikes og gi et fyldigere innpust.',
            annotations: [
                { track: 'paw', relX: 0.32, relY: 0.25, title: 'Trykkoversving (Spike)', desc: 'For bratt trykkstigning ved innpuststart' }
            ]
        },
        earlyCycle: {
            name: 'For tidlig avslutning',
            badge: '⏱️ Dobbelttrigger',
            mode: 'PS',
            ipap: 14,
            epap: 5,
            rr: 14,
            fio2: 30,
            riseTime: 150,
            cycling: 85,
            tiSet: 1.0,
            tiMax: 2.0,
            leak: 5,
            triggerMode: 'flow',
            triggerVal: 1.5,
            stActive: false,
            backupRate: 12,
            compliance: 50,
            resistance: 5,
            flowLimitation: 0.0,
            expRatio: 1.5,
            rrSpont: 14,
            pmus: 7.0,
            tiNeural: 1.2,
            pmusExp: 0.0,
            variability: 5,
            cardiac: 0.0,
            height: 175,
            whatYouSee: 'Dobbelttrigging (to maskinstøttede pust rett etter hverandre) eller trykk som dras dypt under EPAP like etter at maskinen avslutter innpustet.',
            whyItHappens: 'Cycling er satt for høyt (85 % av toppflow). Maskinen avslutter innpustet mens pasientens nevrale innpust (1.2 s) fortsatt pågår, og pasientens fortsatte sug trigger et nytt innpust.',
            whatToDo: 'Senk cycling-prosenten (f.eks. til 20–25 %) eller forleng Ti_max slik at maskinen leverer støtte gjennom hele pasientens innpust.',
            annotations: [
                { track: 'paw', relX: 0.42, relY: 0.65, title: 'Dobbelttrigging / Dipp', desc: 'Pasienten suger videre etter tidlig cycling' }
            ]
        },
        lateCycle: {
            name: 'For sen avslutning',
            badge: '⏳ Terminal spike',
            mode: 'PS',
            ipap: 14,
            epap: 5,
            rr: 14,
            fio2: 30,
            riseTime: 150,
            cycling: 5,
            tiSet: 1.0,
            tiMax: 2.0,
            leak: 5,
            triggerMode: 'flow',
            triggerVal: 1.5,
            stActive: false,
            backupRate: 12,
            compliance: 50,
            resistance: 5,
            flowLimitation: 0.0,
            expRatio: 1.5,
            rrSpont: 14,
            pmus: 3.0,
            tiNeural: 0.6,
            pmusExp: 8.0,
            variability: 5,
            cardiac: 0.0,
            height: 175,
            whatYouSee: 'Markant trykkstigning (terminal trykk-spike) mot slutten av innpustet. Flow krysser ned mot eller under nullinjen før maskinen slipper ekspirasjonen.',
            whyItHappens: 'Pasienten har avsluttet sitt innpust (0.6 s) og aktiverer utpustmusklene (Pmus_exp 8 cmH₂O), men maskinen fortsetter å presse luft inn fordi cycling-terskelen er satt for lavt (5 %).',
            whatToDo: 'Øk cycling-prosenten (f.eks. til 30–40 %) eller forkort Ti_max slik at maskinen slipper utpustet i takt med pasienten.',
            annotations: [
                { track: 'paw', relX: 0.48, relY: 0.22, title: 'Terminal trykk-spike', desc: 'Pasienten kjemper for å puste ut mot maskinen' }
            ]
        },
        copdAutoPeep: {
            name: 'KOLS med auto-PEEP',
            badge: '⚠️ Auto-PEEP',
            mode: 'PS',
            ipap: 14,
            epap: 5,
            rr: 25,
            fio2: 30,
            riseTime: 150,
            cycling: 25,
            tiSet: 1.0,
            tiMax: 2.0,
            leak: 0,
            triggerMode: 'flow',
            triggerVal: 2.0,
            stActive: false,
            backupRate: 12,
            compliance: 70,
            resistance: 18,
            flowLimitation: 0.7,
            expRatio: 1.5,
            rrSpont: 25,
            pmus: 3.0,
            tiNeural: 0.8,
            pmusExp: 1.0,
            variability: 5,
            cardiac: 0.0,
            height: 175,
            whatYouSee: 'Ekspirasjonsflow når aldri nullinjen før neste pust starter. PEEPi stiger (> 5 cmH₂O), og det oppstår spontant mislykkede triggere (△). Volumkurven akkumulerer luftfanging.',
            whyItHappens: 'Høy ekspiratorisk motstand (R 18), flowbegrensning og takypné (RR 25) gir utilstrekkelig ekspirasjonstid. Fanget luft skaper et positivt indre mottrykk som må overvinnes før triggerflow kan dannes.',
            whatToDo: 'Øk EPAP for å motvirke luftveiskollaps og «balansere» auto-PEEP, samt senk frekvensen (se neste scenario).',
            annotations: [
                { track: 'flow', relX: 0.52, relY: 0.62, title: 'Ufullstendig tømming', desc: 'Ekspirasjonsflow treffer aldri nullinjen' },
                { track: 'paw', relX: 0.55, relY: 0.50, title: 'Auto-PEEP', desc: 'Innestengt trykk i lungene (PEEPi > 5)' }
            ]
        },
        copdAdjusted: {
            name: 'Hyperkapnisk KOLS, behandlet',
            badge: '✨ Optimalisert',
            mode: 'PS',
            ipap: 20,
            epap: 8,
            rr: 18,
            fio2: 30,
            riseTime: 150,
            cycling: 25,
            tiSet: 1.0,
            tiMax: 2.0,
            leak: 0,
            triggerMode: 'flow',
            triggerVal: 1.5,
            stActive: false,
            backupRate: 12,
            compliance: 70,
            resistance: 18,
            flowLimitation: 0.7,
            expRatio: 1.5,
            rrSpont: 18,
            pmus: 3.0,
            tiNeural: 0.9,
            pmusExp: 1.0,
            variability: 5,
            cardiac: 0.0,
            height: 175,
            whatYouSee: 'PEEPi faller markant, 100 % av pasientinnsatsene utløser støtte (▲), tidalvolumet øker vesentlig, og pasient-respirator samspillet gjenopprettes.',
            whyItHappens: 'Økt EPAP (8 cmH₂O) holder små luftveier åpne i ekspirasjonen og overvinner auto-PEEP. Høyere IPAP (20 cmH₂O, ΔP 12) leverer adekvat minuttvolum for å lufte ut opphopet CO₂.',
            whatToDo: 'Målet er nådd! Sammenlign med forrige scenario for å se hvordan riktig innstilt EPAP og trykkstøtte løser asynkroni ved KOLS.',
            annotations: [
                { track: 'paw', relX: 0.45, relY: 0.30, title: 'Optimalisert støtte', desc: 'IPAP 20 / EPAP 8 gir godt tidalvolum' },
                { track: 'flow', relX: 0.48, relY: 0.45, title: 'Gjenopprettet trigging', desc: 'Ingen missed efforts (100% ▲)' }
            ]
        },
        lowDrive: {
            name: 'Redusert respirasjonsdrive',
            badge: '💤 ST Backup',
            mode: 'PS',
            ipap: 14,
            epap: 5,
            rr: 14,
            fio2: 30,
            riseTime: 150,
            cycling: 25,
            tiSet: 1.0,
            tiMax: 2.0,
            leak: 5,
            triggerMode: 'flow',
            triggerVal: 1.5,
            stActive: false,
            backupRate: 14,
            compliance: 50,
            resistance: 5,
            flowLimitation: 0.0,
            expRatio: 1.5,
            rrSpont: 4,
            pmus: 1.0,
            tiNeural: 0.9,
            pmusExp: 0.0,
            variability: 5,
            cardiac: 0.0,
            height: 175,
            whatYouSee: 'Maskinen overtar ventilasjonen med faste backup-pust (kvadrat ■). % Spontane pust faller mot 0 %. Ingen apné-alarm utløses.',
            whyItHappens: 'Pasienten har kraftig nedsatt respirasjonsdrive (rrSpont 4, Pmus 1). NIV-ST backup-frekvensen (14 /min) trer inn og sikrer kontinuerlig ventilasjon.',
            whatToDo: 'NIV-ST hindrer hypoksi/asfyksi. Vurder årsaken til redusert drive (opioider/sedasjon/CO₂-narkose) og vurder behov for intubasjon dersom pasienten forblir bevisstløs.',
            annotations: [
                { track: 'paw', relX: 0.42, relY: 0.35, title: 'Backup-pust (■)', desc: 'Maskinutløst pust ved fravær av pasientdrive' }
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
                modeBadge.innerHTML = '<span>Modus: Spontan / Trykkstøtte (PSV)</span>';
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
        const patientPeakFlow = parseFloat(((effectiveDrivingForce / R) * 60).toFixed(1));
        const cardiac = simulator.patientDrive.cardiacArtifact;
        const isStActive = simulator.settings.stActive && simulator.settings.backupRate > 0;

        if (isFlowMode) {
            if (syncTriggerReq) syncTriggerReq.textContent = `${trigFlow.toFixed(1)} L/min`;
            if (syncPatientEffort) syncPatientEffort.textContent = `${patientPeakFlow.toFixed(1)} L/min`;

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
            if (syncTriggerReq) syncTriggerReq.textContent = `-${trigPress.toFixed(1)} cmH₂O`;
            if (syncPatientEffort) syncPatientEffort.textContent = `Pmus ${pmus.toFixed(1)}`;
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
    if (btnGenderMale && btnGenderFemale) {
        btnGenderMale.addEventListener('click', () => {
            currentGender = 'male';
            btnGenderMale.classList.add('active');
            btnGenderFemale.classList.remove('active');
            updateSimulatorFromUI();
        });
        btnGenderFemale.addEventListener('click', () => {
            currentGender = 'female';
            btnGenderFemale.classList.add('active');
            btnGenderMale.classList.remove('active');
            updateSimulatorFromUI();
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
        const stActive = false;
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
        const alarmHighPpeak = sliders.alarmHighPpeak ? parseFloat(sliders.alarmHighPpeak.value) : 5;

        // Oppdater simulatoren
        simulator.settings.mode = selectMode ? selectMode.value : 'PS';
        simulator.settings.ipap = ipap;
        simulator.settings.epap = epap;
        simulator.settings.tiSet = tiSet;
        simulator.settings.backupRate = backupRate;
        simulator.settings.stActive = false;
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
        simulator.settings.alarmHighPpeakDelta = alarmHighPpeak;

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

        if (badges.alarmHighPpeak) badges.alarmHighPpeak.textContent = `+${alarmHighPpeak} cmH₂O`;

        if (badges.trigger) {
            if (simulator.settings.triggerMode === 'flow') {
                badges.trigger.textContent = `${triggerVal.toFixed(1)} L/min`;
            } else {
                badges.trigger.textContent = `${triggerVal.toFixed(1)} cmH₂O`;
            }
        }

        // Oppdater innstilte visninger i målepanelet (D5)
        if (dispIpap) dispIpap.textContent = ipap;
        if (dispEpap) dispEpap.textContent = epap;
        if (dispFio2) dispFio2.textContent = `${fio2}%`;

        updateTriggerSyncUI();

        // C4: Oppdater modusetiketten dynamisk når ST-innstillinger endres
        if (simulator.settings.mode === 'PS' && modeBadge) {
            modeBadge.innerHTML = '<span>Modus: Spontan / Trykkstøtte (PSV)</span>';
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
            updateSimulatorFromUI();
            updateInsights();
        });
    });

    if (checkStActive) {
        checkStActive.addEventListener('change', () => {
            isScenarioActive = false;
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
        if (checkStActive) checkStActive.checked = false;
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

        // Sett triggermodus og triggerverdi
        setTriggerMode(scen.triggerMode || 'flow');
        if (sliders.trigger) sliders.trigger.value = scen.triggerVal;

        // Sett ventilasjonsmodus (PS/PC)
        setVentilationMode(scen.mode);

        // D6: Klargjør fasit-annotasjoner for dette scenarioet
        renderer.setAnnotations(scen.annotations || []);

        // Oppdater innsiktsboksen med tre punkter (D4 krav) + eventuell Tolkning
        if (insightText) {
            insightText.innerHTML = `
                <div style="margin-bottom: 8px; font-size: 14px; font-weight: 700; color: #f0abfc;">
                    🎯 Scenario: ${scen.name} (${scen.badge})
                </div>
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
            btnToggleAnnotations.classList.toggle('active', isShown);
            if (textToggleAnnotations) {
                textToggleAnnotations.textContent = isShown ? 'Skjul fasit' : 'Vis fasit';
            }
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
        if (sliders.alarmHighPpeak) sliders.alarmHighPpeak.value = 5;

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
        if (insightTheoVt) insightTheoVt.textContent = `${insights.theoreticalVt} ml`;
        
        if (insightCycleReason) {
            if (insights.lastCycleReason === 'tiMax') {
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
            if (dispPipPplat) dispPipPplat.textContent = `${m.ppeak.toFixed(1)} / ${m.pplat.toFixed(1)}`;
            if (dispDeltaPres) dispDeltaPres.innerHTML = `ΔP<sub>res</sub>: ${(Math.max(0, m.ppeak - m.pplat)).toFixed(1)} cmH₂O`;

            const peepTot = (simulator.settings.epap + m.peepi).toFixed(1);
            if (dispPeepPeepi) dispPeepPeepi.textContent = `${simulator.settings.epap.toFixed(1)} / ${m.peepi.toFixed(1)}`;
            if (dispPeepTot) dispPeepTot.innerHTML = `PEEP<sub>tot</sub>: ${peepTot} cmH₂O`;

            if (dispVtiVte) dispVtiVte.textContent = `${m.vti} / ${m.vte}`;
            const leakPerBreath = Math.max(0, m.vti - m.vte);
            if (dispLeakPerBreath) dispLeakPerBreath.textContent = `ΔV (Lekk): ${leakPerBreath} ml`;

            if (dispVtPerKg) dispVtPerKg.textContent = m.vtPerKg.toFixed(1);
            if (dispIbwFoot) dispIbwFoot.textContent = `IBW: ${m.ibw} kg (${simulator.patient.height} cm)`;

            // D1: Måleverdiene Ti, Te og I:E vises i begge moduser
            if (dispTiTe) dispTiTe.textContent = `${m.ti.toFixed(1)} / ${m.te.toFixed(1)}`;
            if (dispIeRatio) dispIeRatio.textContent = `I:E ${m.ieRatio} (${m.tiTtot}%)`;

            // D2: % Spontane pust
            if (dispRrSpont) dispRrSpont.innerHTML = `${m.rrSpont} <span class="sub-val-secondary">(${m.spontPercent}%)</span>`;
            if (dispSpontFoot) dispSpontFoot.textContent = `av ${m.rrTotal} pust/min`;

            if (dispLeakSec) dispLeakSec.innerHTML = `${m.leak.toFixed(1)} <span class="sub-val-secondary">(${m.leakPercent.toFixed(0)}%)</span>`;
            if (dispLeakStatus) {
                dispLeakStatus.textContent = (m.leak > 40 || m.leakPercent > 40) ? '⚠️ Høy lekkasje' : ((m.leak > 15 || m.leakPercent > 20) ? 'Moderat lekkasje' : 'Tett krets');
            }

            if (dispAsynchronyIndex) dispAsynchronyIndex.textContent = `${m.asynchronyIndex} %`;
            let cycleText = `Flow (${Math.round(simulator.settings.cyclingPercent * 100)}%)`;
            if (simulator.settings.mode === 'PC') {
                cycleText = `Tid (Ti = ${simulator.settings.tiSet.toFixed(2)}s)`;
            } else if (simulator.state.lastCycleReason === 'tiMax') {
                cycleText = '⚠️ Ti-max';
            }
            if (dispCycleReasonFoot) dispCycleReasonFoot.textContent = `Cycling: ${cycleText}`;

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
