/**
 * simulator.js - Fysikkmotor for NIV Ventilatorsimulator (Hamilton-stil)
 * 
 * Løser bevegelsesligningen for lungemekanikk i sanntid med en fysisk ventilatormodell:
 * Paw(t) + Pmus(t) = V(t) / C + Flow(t) * R
 * 
 * FASE 1:
 * - A8: Fast internt tidssteg DT = 0.2 ms for full numerisk stabilitet
 * - A1: Kontinuerlig lungevolum (V over FRC) som aldri tvangsnullstilles, med auto-PEEP og VTI/VTE
 * - A2: Andreordens dempet servoregulator (P_servo), blåserimpedans (R_out) og flowbegrensning (Qmax)
 * 
 * FASE 2:
 * - A3: Pasientens eget respirasjonssenter (patientDrive) med egen klokke, P_mus-kurve og variabilitet
 * - A4: Ekte triggeralgoritme (Flow / Trykk), Q_leak_estimert, refraktærtid, autotrigger og dobbeltrigger
 * - A5: Ekte cyclingalgoritme på lekkasjekorrigert flow (Q_meas), Ti-max og sporing av avslutningsårsak
 * 
 * FASE 3:
 * - A6: Separat ekspiratorisk motstand (R_exp = R_insp * expRatio + R_valve), ekspiratorisk flowbegrensning (Starling/KOLS), PEEPi
 * - A7: Fysisk kontinuerlig lekkasjemodell (rot-lov), linearisert konduktans G_leak, skille mellom Q_lunge, Q_total og Q_meas, dobbel volumvisning
 */

const DT = 0.0002; // Fast internt tidssteg: 0.2 ms (5000 Hz) for numerisk stabilitet

/**
 * C14: Navngitte grenseverdier og sikkerhetsklipp
 * Samlet her for å gjøre alle numeriske begrensninger synlige og sporbare.
 * Hver grense har en fysisk eller numerisk begrunnelse.
 */
const GRENSER = {
    MIN_RISETIME: 0.03,          // s — under dette blir andreordens servoregulator numerisk ustabil (omega → ∞)
    MIN_PAW_FOR_LEAK: 0.5,       // cmH₂O — unngår divisjon på ~0 i G_leak (linearisert lekkasjekonduktans)
    MIN_RRSPONT_DIVISOR: 1,      // /min — unngår divisjon på 0 i pustesyklusberegning (60 / rrSpont)
    MIN_CYCLE_DURATION: 0.4,     // s — korteste mulige pustesyklus for å unngå numerisk ustabilitet
    MIN_TI_NEURAL: 0.2,          // s — korteste mulige nevrale inspirasjonstid (fysiologisk minimumsgrense)
    MIN_IBW: 30,                 // kg — minste realistiske idealvekt (unngår urealistisk lave verdier)
    MIN_TE_MEASURED: 0.1,        // s — minimums Te for å unngå 0-divisjon i I:E-beregning
    MAX_SUBSTEPS_PER_FRAME: 2500 // — maks 0.5 s simulert tid per frame (forhindrer ekstrem belastning)
};

/**
 * Pasientens eget respirasjonssenter (A3)
 * Har uavhengig tidsakse og genererer kontinuerlig P_mus(t) og nevrale pustesykluser
 */
class PatientDrive {
    constructor() {
        this.rrSpont = 12;         // /min - Pasientens spontane frekvens (0 = passiv)
        this.pmusMax = 5.0;        // cmH2O - Inspiratorisk muskelkraft (0–20)
        this.tiNeural = 1.0;       // sekunder - Nevral inspirasjonstid (0.4–1.6)
        this.pmusExp = 0.0;        // cmH2O - Ekspiratorisk muskelkraft / aktiv utpust (0–10)
        this.variability = 15;     // % - Tilfeldig variasjon i frekvens og kraft (0–30)
        this.cardiacArtifact = 0.0;// L/min - Svak flowoscillasjon fra hjerteslag (0–3)

        this.timeInCycle = 0;      // sekunder i gjeldende nevrale syklus
        this.currentCycleDuration = 60 / 12;
        this.currentPmusMax = 5.0;
        this.currentTiNeural = 1.0;
        this.currentPmusExp = 0.0;
        this.currentEffort = null; // Peker til aktivt objekt i state.efforts
        this.P_mus = 0.0;          // cmH2O - Gjeldende muskelkraft
    }

    reset() {
        this.timeInCycle = 0;
        this.P_mus = 0.0;
        this.currentEffort = null;
        this._startNewCycle(0, null);
    }

    _startNewCycle(totalTime, effortsList) {
        if (this.rrSpont <= 0) {
            this.currentCycleDuration = Infinity;
            this.currentPmusMax = 0;
            this.currentTiNeural = this.tiNeural;
            this.currentPmusExp = 0;
            this.timeInCycle = 0;
            this.currentEffort = null;
            return;
        }

        const basePeriod = 60 / Math.max(GRENSER.MIN_RRSPONT_DIVISOR, this.rrSpont);
        const vFactor = (this.variability / 100);
        // Tilfeldig variasjon innenfor +/- variability %
        const randPeriod = 1.0 + (Math.random() * 2.0 - 1.0) * vFactor;
        const randForce  = 1.0 + (Math.random() * 2.0 - 1.0) * vFactor;

        this.currentCycleDuration = Math.max(GRENSER.MIN_CYCLE_DURATION, basePeriod * randPeriod);
        this.currentPmusMax = Math.max(0, this.pmusMax * randForce);
        this.currentTiNeural = Math.max(GRENSER.MIN_TI_NEURAL, Math.min(this.currentCycleDuration * 0.8, this.tiNeural * randPeriod));
        this.currentPmusExp = this.pmusExp;
        this.timeInCycle = 0;

        if (effortsList) {
            this.currentEffort = {
                t: totalTime,
                detected: false,
                type: 'missed',
                markerEmitted: false
            };
            effortsList.push(this.currentEffort);
        }
    }

    isNeuralActive() {
        if (this.rrSpont <= 0) return false;
        return (this.timeInCycle < this.currentTiNeural && this.currentPmusMax > 0.05);
    }

    step(dt, totalTime, effortsList) {
        if (this.rrSpont <= 0) {
            this.P_mus = 0;
            this.currentEffort = null;
            this.timeInCycle = 0;
            return;
        }

        // Start ny syklus ved utløpt syklustid
        if (this.timeInCycle >= this.currentCycleDuration || this.currentCycleDuration === Infinity) {
            this._startNewCycle(totalTime, effortsList);
        }

        const tn   = this.timeInCycle;
        const tiN  = this.currentTiNeural;
        const pMax = this.currentPmusMax;
        const pExp = this.currentPmusExp;

        // Fysiologisk P_mus(t_n) kurveform (A3)
        let pmus = 0.0;
        if (tn < 0.75 * tiN) {
            // Lineær opptrapping
            pmus = (0.75 * tiN > 0) ? pMax * (tn / (0.75 * tiN)) : 0;
        } else if (tn < tiN) {
            // Hold kraften ut den nevrale inspirasjonstiden
            pmus = pMax;
        } else if (tn < tiN + 0.35) {
            // Eventuell aktiv ekspirasjon / kamp mot maskinen (A3, A6)
            pmus = -pExp * Math.sin(Math.PI * (tn - tiN) / 0.35);
        } else {
            pmus = 0.0;
        }

        this.P_mus = pmus;
        this.timeInCycle += dt;
    }
}

class VentilatorSimulator {
    constructor() {
        // Maskinkonstanter for blåser og ventilasjonskrets (A2, A6)
        this.machine = {
            R_out: 1.0,   // cmH2O/(L/s) - Blåserens og slangens utgangsimpedans
            R_valve: 2.0, // cmH2O/(L/s) - Ekspirasjonsventilens motstand i NIV-kretsen (A6)
            Qmax: 3.0     // L/s (~180 L/min) - Maksimal flowkapasitet for NIV-blåser
        };

        // Respiratorinnstillinger (Klinisk NIV / Hamilton standard)
        this.settings = {
            mode: 'PS',             // 'PS' (trykkstøtte, standard) eller 'PC' (trykkontroll)
            ipap: 8,                // cmH2O (Inspiratory Positive Airway Pressure / PC over PEEP)
            epap: 5,                // cmH2O (Expiratory Positive Airway Pressure / PEEP)
            rr: 12,                 // /min (Innstilt frekvens / A/C)
            fio2: 30,               // % Oksygenfraksjon
            riseTime: 0.15,         // sekunder (Tid for å nå IPAP, 0.05 - 0.90 s)
            cyclingPercent: 0.25,   // 25% av toppflow avslutter innpust (E-Sense, 5–90%)
            tiSet: 1.0,             // sekunder - Innstilt inspirasjonstid i PC-modus (0.6–2.0 s)
            tiMax: 2.0,             // sekunder - Maksimal inspirasjonstid i PS-modus (0.8–3.0 s)
            tiMin: 0.25,            // sekunder - Minimal inspirasjonstid
            leak: 0,                // L/min @ 10 cmH2O (Maskelekkasje, A7)
            triggerMode: 'flow',    // 'flow' eller 'pressure'
            triggerFlow: 1.5,       // L/min (Flow-trigger terskel: 1.0 - 5.0 L/min)
            triggerPressure: 1.0,   // cmH2O (Trykk-trigger terskel: 0.2 - 5.0 cmH2O)
            
            // FASE 6 (D2): ST-backup innstillinger
            backupRate: 12,         // /min (Backup-frekvens ved fravær av pasientpust: 0–30 /min)
            stActive: false,        // boolean - ST-modus inaktiv (standard av)
            
            // FASE 4 (C3): Alarmgrenser med kliniske standardverdier
            apneaDelay: 15,         // sekunder - forsinkelse før apné-alarm utløses (5–30 s)
            alarmLeakLimit: 40,     // L/min - grense for høy maskelekkasje (10–60 L/min)
            alarmLowVtLimit: 300,   // ml - grense for lavt tidalvolum (100–600 ml)
            alarmHighRrLimit: 30,   // /min - grense for høy respirasjonsfrekvens (20–50 /min)
            alarmHighPpeakDelta: 5  // cmH2O - trykktillegg over IPAP for høyt-trykk-alarm (2–10 cmH2O)
        };

        // Pasientfysiologi (A6 & D5)
        this.patient = {
            compliance: 90,         // ml / cmH2O (Lungenettverkets ettergivelighet)
            resistance: 5,          // cmH2O / (L/s) (Inspiratorisk luftveismotstand, R_insp)
            expRatio: 1.0,          // Forhold ekspiratorisk / inspiratorisk motstand (1.0–3.0, standard 1.0: R_exp = 5)
            flowLimitation: 0.0,    // Ekspiratorisk flowbegrensning (0–1, standard 0, KOLS = 0.70)
            preset: 'normal',       // 'normal', 'copd', 'restrictive', 'custom'
            height: 175,            // cm - Pasienthøyde for beregning av idealvekt (IBW)
            gender: 'male'          // 'male' | 'female'
        };

        // Pasientens autonome respirasjonssenter (A3)
        this.patientDrive = new PatientDrive();

        // Akkumulatorer for VTI og VTE
        this._vtiAccum = 0; // ml
        this._vteAccum = 0; // ml
        this._pawInspBuffer = []; // Buffer for siste 100 ms under inspirasjon (Pplat-beregning)

        // Simulatortilstand
        const C_L = this.patient.compliance / 1000;
        const initLeak = (this.settings.leak / 60) * Math.sqrt(this.settings.epap / 10);
        const initIbw = this.getPatientIBW();
        const initDrivingP = this.settings.ipap - this.settings.epap;
        const initTheoVt = Math.round(this.patient.compliance * initDrivingP);
        const initRr = (this.settings.mode === 'PC') ? this.settings.rr : (this.patientDrive.rrSpont || this.settings.backupRate || 12);
        const initMv = parseFloat(((initTheoVt * initRr) / 1000).toFixed(2));
        const initTi = (this.settings.mode === 'PC') ? this.settings.tiSet : 0.9;
        const initTe = Math.max(0.5, (60 / Math.max(1, initRr)) - initTi);
        const initIe = (initTe >= initTi) ? `1:${(initTe / initTi).toFixed(1).replace('.', ',')}` : `${(initTi / initTe).toFixed(1).replace('.', ',')}:1`;

        this.state = {
            phase: 'expiration',    // 'inspiration' eller 'expiration'
            timeInPhase: 0,         // sekunder i gjeldende fase
            totalTime: 0,           // total simuleringstid

            // A2 & A7: Trykk- og flowtilstander
            P_target: this.settings.epap, // cmH2O - Måltrykk fra maskinen
            P_servo: this.settings.epap,  // cmH2O - Andreordens servoregulator
            dP_servo: 0.0,                // cmH2O/s - Derivert av P_servo
            P_aw: this.settings.epap,     // cmH2O - Masketrykk
            P_mus: 0.0,                   // cmH2O - Pasientens muskelinnsats
            P_el: this.settings.epap,     // cmH2O - Elastisk lunge-tilbakefjæring (V / C_L)
            Q_lunge: 0.0,                 // L/s - Lungeflow (sann flow inn/ut av lungen, A7)
            Q_lekk: 0.0,                  // L/s - Lekkasjeflow (A7)
            Q_total: 0.0,                 // L/s - Total flow levert av maskinen (Q_lunge + Q_lekk)
            Q_meas: 0.0,                  // L/s - Målt flow korrigert for lekkasjeestimat (A4, A5, A7)
            Q_leak_estimert: initLeak,    // L/s - Maskinens glidende lekkasje-estimat

            // A1 & A7: Kontinuerlig volum og målte volumstørrelser
            V: C_L * this.settings.epap,  // Liter over FRC (initialiseres til likevekt ved EPAP)
            volume_lung: 0.0,             // ml over EPAP (sant lungevolum: (V - C_L * epap) * 1000)
            volume_meas: 0.0,             // ml - maskinmålt volum integrert fra Q_meas (returnerer ikke til 0 ved lekkasje)
            lastV_endExp_meas: 0.0,       // ml - slutt-ekspiratorisk maskinvolum før ny pust
            VTI: initTheoVt,              // ml - integralet av positiv lungeflow gjennom innpustet
            VTE: initTheoVt,              // ml - integralet av negativ lungeflow gjennom utpustet
            V_endExp: C_L * this.settings.epap, // Liter over FRC ved starten av innpust
            PEEPi: 0.0,                   // cmH2O - Iboende PEEP (auto-PEEP, A1, A6)

            // A4, A5 & C5: Trigger, Cycling og Trykktopper
            peakQmeas: 0.0,               // L/s - Toppflow av Q_meas i pågående innpust
            pawMaxInBreath: this.settings.epap, // cmH2O - Maksimalt trykk i innpustet (C5 PIP)
            lastPip: this.settings.ipap,  // cmH2O - Siste fullførte innpusts PIP (C5)
            lastPplat: this.settings.ipap,// cmH2O - Siste fullførte innpusts Pplat (C5)
            lastTi: initTi,               // s - Siste målte inspirasjonstid
            lastTe: parseFloat(initTe.toFixed(1)), // s - Siste målte ekspirasjonstid (C6)
            lastCycleReason: 'flow',      // 'flow' eller 'tiMax'
            lastTriggerType: 'assist',    // 'assist', 'missed', 'double', 'auto', 'mandatory'
            lastCycleTime: 0.0,           // Tidspunkt for forrige cycling til ekspirasjon
            efforts: [],                  // Innsatslogg over de siste 60 sekundene

            // A8: Numerisk restakkumulator
            dtCarry: 0.0,

            // Bakoverkompatibilitet og monitor-felter
            paw: this.settings.epap,      // cmH2O (= P_aw)
            volume: 0.0,                  // ml (= volume_meas, maskinmålt volum)
            flow: 0.0,                    // L/min (= Q_meas * 60, maskinmålt flow)
            flow_lung: 0.0,               // L/min (= Q_lunge * 60, sann lungeflow)
            pmus: 0.0,                    // cmH2O (= P_mus)

            breathStartTime: 0,
            lastSuccessfulBreathTime: 0,
            timeSinceLastBreath: 0,
            breathCount: 0,
            justTriggered: false,         // True i tidssteget et innpust trigges
            isApneaAlarm: false,          // True ved manglende pust over apneaDelay
            
            // FASE 4 (C3): Aktive alarmer og alarmtilstander
            activeAlarms: [],
            alarmState: {
                leakTimeAbove: 0,         // sekunder kontinuerlig over lekkasjegrense
                lowVtStreak: 0            // antall påfølgende pust under Vt-grense
            },

            // Kontinuerlige monitor-målinger (Fase 4 - fullt ut målte verdier)
            measured: {
                vt: initTheoVt,           // ml - VTE (glattet over 3 pust) (C1)
                vti: initTheoVt,          // ml - VTI (glattet over 3 pust)
                vte: initTheoVt,          // ml - VTE (glattet over 3 pust)
                mv: initMv,               // L/min - middel(VTE siste 60s) * RRtot / 1000 (C1)
                ppeak: this.settings.ipap,// cmH2O - PIP (glattet over 3 pust) (C5)
                pplat: this.settings.ipap,// cmH2O - Pplat siste 100ms før cycling (glattet) (C5)
                rrTotal: initRr,          // pust/min - faktiske leverte pust i siste 60s (C1)
                rrSpont: this.patientDrive.rrSpont, // pust/min - pasientutløste pust i siste 60s (C1)
                spontPercent: (this.patientDrive.rrSpont > 0) ? 100 : 0, // % - andel spontane pust i siste 60s (C1)
                ti: initTi,               // sekunder - målt inspirasjonstid (glattet) (C6)
                te: parseFloat(initTe.toFixed(1)), // sekunder - målt ekspirasjonstid (glattet) (C6)
                ieRatio: initIe,          // I:E-forhold (format 1:X,X) (C6)
                tiTtot: Math.round((initTi / (initTi + initTe)) * 100), // % - Ti / Ttot
                vtPerKg: parseFloat((initTheoVt / initIbw).toFixed(1)), // ml/kg IBW (D5)
                ibw: initIbw,             // kg - idealvekt (D5)
                leak: 0,                  // L/min (A7, D5)
                leakPercent: 0,           // % (A7, D5)
                peepi: 0.0,               // cmH2O (A6, D5)
                asynchronyIndex: 0        // % - asynkroni-indeks siste 60s (D5)
            }
        };

        // Historikk for 60 sekunders vindu (C1)
        this.recentBreaths = [];
        this.isRunning = true;

        // C7 & D3: Min/maks-konvolutt per frame og innsatshendelser
        this.frameSample = {
            pawMin: this.settings.epap,
            pawMax: this.settings.epap,
            pawLast: this.settings.epap,
            flowMin: 0,
            flowMax: 0,
            flowLast: 0,
            volMin: 0,
            volMax: 0,
            volLast: 0,
            pesMin: 0,
            pesMax: 0,
            pesLast: 0,
            flowLungMin: 0,
            flowLungMax: 0,
            flowLungLast: 0,
            volLungMin: 0,
            volLungMax: 0,
            volLungLast: 0
        };
        this.frameEvents = [];
    }

    // Beregn Ideal Body Weight (IBW) etter Devine-formelen (D5)
    getPatientIBW() {
        const h = (this.patient && this.patient.height) ? this.patient.height : 175;
        const g = (this.patient && this.patient.gender) ? this.patient.gender : 'male';
        const ibw = (g === 'female')
            ? 45.5 + 0.91 * (h - 152.4)
            : 50.0 + 0.91 * (h - 152.4);
        return Math.max(GRENSER.MIN_IBW, Math.round(ibw));
    }

    // Sett klinisk pasientprofil (Preset)
    setPreset(presetName) {
        if (presetName === 'copd') {
            // KOLS / Obstruktiv: Høy motstand, flowbegrensning, høy compliance, forlenget ekspirasjon (A6)
            this.patient.compliance = 70;
            this.patient.resistance = 16;
            this.patient.expRatio = 1.4;
            this.patient.flowLimitation = 0.6; // A6: flowbegrensning for KOLS
            this.patient.preset = 'copd';
            this.patientDrive.rrSpont = 16;
            this.patientDrive.pmusMax = 3.0;
            this.patientDrive.tiNeural = 0.9;
            this.patientDrive.pmusExp = 0.0;
            this.patientDrive.variability = 10;
            this.patientDrive.cardiacArtifact = 0.0;
        } else if (presetName === 'restrictive') {
            // Pneumoni / Lungeødem / ARDS: Stiv lunge, lav compliance, rask grunn respirasjon
            this.patient.compliance = 22;
            this.patient.resistance = 5;
            this.patient.expRatio = 1.5;
            this.patient.flowLimitation = 0.0;
            this.patient.preset = 'restrictive';
            this.patientDrive.rrSpont = 20;
            this.patientDrive.pmusMax = 3.5;
            this.patientDrive.tiNeural = 0.7;
            this.patientDrive.pmusExp = 0.0;
            this.patientDrive.variability = 10;
            this.patientDrive.cardiacArtifact = 0.0;
        } else {
            // Normal (Frisk pasient)
            this.patient.compliance = 90;
            this.patient.resistance = 5;
            this.patient.expRatio = 1.0;
            this.patient.flowLimitation = 0.0;
            this.patient.preset = 'normal';
            this.patientDrive.rrSpont = 12;
            this.patientDrive.pmusMax = 5.0;
            this.patientDrive.tiNeural = 1.0;
            this.patientDrive.pmusExp = 0.0;
            this.patientDrive.variability = 15;
            this.patientDrive.cardiacArtifact = 0.0;
        }
    }

    // Nullstill simuleringstilstand (A1, A3, A6, A7, A8, C1, C3, C5, C6)
    reset() {
        const C_L = this.patient.compliance / 1000;
        const initLeak = (this.settings.leak / 60) * Math.sqrt(this.settings.epap / 10);
        const initIbw = this.getPatientIBW();
        const initDrivingP = this.settings.ipap - this.settings.epap;
        const initTheoVt = Math.round(this.patient.compliance * initDrivingP);
        const initRr = (this.settings.mode === 'PC') ? this.settings.rr : (this.patientDrive.rrSpont || this.settings.backupRate || 12);
        const initMv = parseFloat(((initTheoVt * initRr) / 1000).toFixed(2));
        const initTi = (this.settings.mode === 'PC') ? this.settings.tiSet : 0.9;
        const initTe = Math.max(0.5, (60 / Math.max(1, initRr)) - initTi);
        const initIe = (initTe >= initTi) ? `1:${(initTe / initTi).toFixed(1).replace('.', ',')}` : `${(initTi / initTe).toFixed(1).replace('.', ',')}:1`;

        this.state.phase = 'expiration';
        this.state.timeInPhase = 0;
        this.state.totalTime = 0;
        this.state.dtCarry = 0;

        this.state.P_target = this.settings.epap;
        this.state.P_servo = this.settings.epap;
        this.state.dP_servo = 0.0;
        this.state.P_aw = this.settings.epap;
        this.state.P_mus = 0.0;
        this.state.P_el = this.settings.epap;
        this.state.Q_lunge = 0.0;
        this.state.Q_lekk = 0.0;
        this.state.Q_total = 0.0;
        this.state.Q_meas = 0.0;
        this.state.Q_leak_estimert = initLeak;

        this.state.V = C_L * this.settings.epap;
        this.state.volume_lung = 0.0;
        this.state.volume_meas = 0.0;
        this.state.lastV_endExp_meas = 0.0;
        this.state.VTI = initTheoVt;
        this.state.VTE = initTheoVt;
        this.state.V_endExp = this.state.V;
        this.state.PEEPi = 0.0;

        this.state.peakQmeas = 0.0;
        this.state.pawMaxInBreath = this.settings.epap;
        this.state.lastPip = this.settings.ipap;
        this.state.lastPplat = this.settings.ipap;
        this.state.lastTi = initTi;
        this.state.lastTe = parseFloat(initTe.toFixed(1));
        this.state.lastCycleReason = 'flow';
        this.state.lastTriggerType = 'assist';
        this.state.lastCycleTime = 0.0;
        this.state.efforts = [];

        this.state.paw = this.settings.epap;
        this.state.volume = 0.0;
        this.state.flow = 0.0;
        this.state.flow_lung = 0.0;
        this.state.pmus = 0.0;

        this.state.breathStartTime = 0;
        this.state.lastSuccessfulBreathTime = 0;
        this.state.timeSinceLastBreath = 0;
        this.state.breathCount = 0;
        this.state.justTriggered = false;
        this.state.isApneaAlarm = false;

        this.state.activeAlarms = [];
        this.state.alarmState = {
            leakTimeAbove: 0,
            lowVtStreak: 0
        };

        this.state.measured.vt = initTheoVt;
        this.state.measured.vti = initTheoVt;
        this.state.measured.vte = initTheoVt;
        this.state.measured.mv = initMv;
        this.state.measured.ppeak = this.settings.ipap;
        this.state.measured.pplat = this.settings.ipap;
        this.state.measured.rrTotal = initRr;
        this.state.measured.rrSpont = this.patientDrive.rrSpont;
        this.state.measured.spontPercent = (this.patientDrive.rrSpont > 0) ? 100 : 0;
        this.state.measured.ti = initTi;
        this.state.measured.te = parseFloat(initTe.toFixed(1));
        this.state.measured.ieRatio = initIe;
        this.state.measured.tiTtot = Math.round((initTi / (initTi + initTe)) * 100);
        this.state.measured.vtPerKg = parseFloat((initTheoVt / initIbw).toFixed(1));
        this.state.measured.ibw = initIbw;
        this.state.measured.leak = 0.0;
        this.state.measured.leakPercent = 0.0;
        this.state.measured.peepi = 0.0;
        this.state.measured.asynchronyIndex = 0;

        this._vtiAccum = 0;
        this._vteAccum = 0;
        this._pawInspBuffer = [];
        this.recentBreaths = [];
        this.frameEvents = [];
        this.frameSample = {
            pawMin: this.settings.epap,
            pawMax: this.settings.epap,
            pawLast: this.settings.epap,
            flowMin: 0,
            flowMax: 0,
            flowLast: 0,
            volMin: 0,
            volMax: 0,
            volLast: 0,
            pesMin: 0,
            pesMax: 0,
            pesLast: 0,
            flowLungMin: 0,
            flowLungMax: 0,
            flowLungLast: 0,
            volLungMin: 0,
            volLungMax: 0,
            volLungLast: 0
        };
        this.patientDrive.reset();
    }

    // Oppdatering per frame med fast internt tidssteg DT (A8)
    step(frameDt) {
        if (!this.isRunning) return;

        // C7 & D3: Klargjør min/maks-akkumulering og hendelsesliste for denne framen
        this.frameEvents = [];
        this.frameSample = {
            pawMin: Infinity,
            pawMax: -Infinity,
            pawLast: this.state.paw,
            flowMin: Infinity,
            flowMax: -Infinity,
            flowLast: this.state.flow,
            volMin: Infinity,
            volMax: -Infinity,
            volLast: this.state.volume,
            pesMin: Infinity,
            pesMax: -Infinity,
            pesLast: -this.state.pmus,
            flowLungMin: Infinity,
            flowLungMax: -Infinity,
            flowLungLast: this.state.flow_lung,
            volLungMin: Infinity,
            volLungMax: -Infinity,
            volLungLast: this.state.volume_lung
        };

        // Er frameDt > 0.5 (fanen har vært i bakgrunnen), hopp over framen og fortsett
        if (frameDt > 0.5) {
            this.state.dtCarry = 0;
            this._finalizeFrameSample();
            return;
        }

        const totalDt = frameDt + (this.state.dtCarry || 0);
        let n = Math.round(totalDt / DT);
        if (n > GRENSER.MAX_SUBSTEPS_PER_FRAME) {
            n = GRENSER.MAX_SUBSTEPS_PER_FRAME; // Maks 0.5s simulert tid per frame
        }
        this.state.dtCarry = totalDt - n * DT;

        for (let i = 0; i < n; i++) {
            this._singleStep(DT);
        }

        this._finalizeFrameSample();

        // Sikkerhetsventil: hvis numerisk ustabilitet oppdages, nullstill og varsle
        if (Math.abs(this.state.P_aw) > 200 || !isFinite(this.state.V)) {
            console.warn('Sikkerhetsventil utløst i VentilatorSimulator: P_aw eller V er utenfor gyldig område. Tilbakestiller tilstand.', {
                P_aw: this.state.P_aw,
                V: this.state.V
            });
            this.reset();
        }
    }

    _finalizeFrameSample() {
        if (this.frameSample.pawMin === Infinity) {
            this.frameSample.pawMin = this.state.paw;
            this.frameSample.pawMax = this.state.paw;
            this.frameSample.pawLast = this.state.paw;
            this.frameSample.flowMin = this.state.flow;
            this.frameSample.flowMax = this.state.flow;
            this.frameSample.flowLast = this.state.flow;
            this.frameSample.volMin = this.state.volume;
            this.frameSample.volMax = this.state.volume;
            this.frameSample.volLast = this.state.volume;
            this.frameSample.pesMin = -this.state.pmus;
            this.frameSample.pesMax = -this.state.pmus;
            this.frameSample.pesLast = -this.state.pmus;
            this.frameSample.flowLungMin = this.state.flow_lung;
            this.frameSample.flowLungMax = this.state.flow_lung;
            this.frameSample.flowLungLast = this.state.flow_lung;
            this.frameSample.volLungMin = this.state.volume_lung;
            this.frameSample.volLungMax = this.state.volume_lung;
            this.frameSample.volLungLast = this.state.volume_lung;
        }
    }

    _singleStep(dt) {
        this.state.totalTime += dt;
        this.state.timeInPhase += dt;

        const C_L = this.patient.compliance / 1000; // L / cmH2O
        const R_insp = this.patient.resistance;      // cmH2O / (L/s)
        const expRatio = (this.patient.expRatio !== undefined) ? this.patient.expRatio : 1.5;
        const R_valve = (this.machine.R_valve !== undefined) ? this.machine.R_valve : 2.0;
        const R_exp = this.patient.resistance * expRatio + R_valve; // A6

        // 1. Pasientens autonome respirasjonssenter (A3)
        this.patientDrive.step(dt, this.state.totalTime, this.state.efforts);
        this.state.P_mus = this.patientDrive.P_mus;

        // Begrens innsatslogg til siste 60 sekunder
        if (this.state.efforts.length > 0 && this.state.efforts[0].t < this.state.totalTime - 60) {
            this.state.efforts = this.state.efforts.filter(e => e.t >= this.state.totalTime - 60);
        }

        // Kardiogent artefakt (flowoscillasjon fra hjerteslag ved ca 75 bpm / 1.25 Hz)
        const Q_cardiac = (this.patientDrive.cardiacArtifact / 60) * Math.sin(2 * Math.PI * 1.25 * this.state.totalTime);

        // 2. Apné-overvåking (C3, D2): spor tid siden forrige levert pust
        const timeSinceLast = this.state.totalTime - this.state.lastSuccessfulBreathTime;
        this.state.timeSinceLastBreath = timeSinceLast;
        
        // FASE 6 (D2): Apné-alarm skille
        // Ved ST-modus aktiv ventileres pasienten av maskinen (rrSpont=0 gir ingen apné-alarm)
        const isStActive = !!(this.settings.stActive && this.settings.backupRate > 0);
        this.state.isApneaAlarm = (!isStActive && timeSinceLast >= this.settings.apneaDelay);

        // 3. Faseavhengig logikk, A4 Trigger-sjekk og D2 ST-backup
        let P_target = this.settings.epap;

        if (this.state.phase === 'expiration') {
            P_target = this.settings.epap;

            // Oppdater maskinens glidende lekkasje-estimat i sen ekspirasjon (tau = 4.0 s, jf. Fase 2 A4)
            // Estimerer lekkasjen ved det rådende mottrykket i masken
            const epapLeakTarget = (this.settings.leak / 60) * Math.sqrt(Math.max(0, this.state.P_aw) / 10);
            if (this.state.timeInPhase > 0.15) {
                this.state.Q_leak_estimert += (epapLeakTarget - this.state.Q_leak_estimert) * (dt / 4.0);
            }

            // Pneumatisk flow-turbulens ved maskelekkasje (skaper realistisk autotrigging ved stor lekkasje + sensitiv trigger)
            const Q_leak_turb = (this.settings.leak > 0)
                ? (this.settings.leak / 60) * 0.035 * (Math.sin(17.3 * this.state.totalTime) + Math.cos(29.7 * this.state.totalTime))
                : 0.0;

            // Målt flow tilgjengelig for trigging (A4, A7)
            const Q_meas = this.state.Q_total - this.state.Q_leak_estimert + Q_cardiac + Q_leak_turb;
            this.state.Q_meas = Q_meas;

            // D1 & D2: Sjekk maskinutløst pust (PC-modus kontrollfrekvens eller ST-backup frekvens)
            let isMachineTrigger = false;
            if (this.settings.mode === 'PC') {
                const pcRate = Math.max(GRENSER.MIN_RRSPONT_DIVISOR, this.settings.rr || 15);
                const pcInterval = 60 / pcRate;
                if (timeSinceLast >= pcInterval) {
                    isMachineTrigger = true;
                }
            } else if (isStActive) {
                const backupRate = Math.max(GRENSER.MIN_RRSPONT_DIVISOR, this.settings.backupRate || 12);
                const backupInterval = 60 / backupRate;
                if (timeSinceLast >= backupInterval) {
                    isMachineTrigger = true;
                }
            }

            if (isMachineTrigger) {
                this.state.lastTriggerType = 'mandatory';
                this.state.efforts.push({
                    t: this.state.totalTime,
                    detected: true,
                    type: 'mandatory'
                });
                if (this.patientDrive.currentEffort && !this.patientDrive.currentEffort.detected) {
                    if (!this.patientDrive.isNeuralActive()) {
                        this.patientDrive.currentEffort.detected = true;
                        this.patientDrive.currentEffort.type = 'mandatory';
                    }
                }
                this._startInspiration();
                P_target = this.settings.ipap;
            }

            // Ekte triggeralgoritme (A4):
            // Refraktærtid på 0.15 s etter forrige cycling for å unngå kaskadetrigger
            // Bare hvis vi fremdeles er i ekspirasjon (ikke akkurat trigget av backup)
            if (this.state.phase === 'expiration') {
                const refractoryPeriod = 0.15;
                if (this.state.timeInPhase >= refractoryPeriod) {
                    let isTriggered = false;

                    if (this.settings.triggerMode === 'flow') {
                        const trigFlowLps = this.settings.triggerFlow / 60; // L/s
                        isTriggered = (Q_meas > trigFlowLps);
                    } else if (this.settings.triggerMode === 'pressure') {
                        isTriggered = (this.state.P_aw < this.settings.epap - this.settings.triggerPressure);
                    }

                    if (isTriggered) {
                        // Bestem triggertype
                        const isNeural = this.patientDrive.isNeuralActive();
                        let triggerType = 'assist';

                        if (isNeural) {
                            // Dobbeltrigger: ny trigging hvis pasientens pågående innsats allerede har utløst pust i denne syklusen eller innen 0.50s etter forrige cycling
                            const isSecondaryInEffort = !!(this.patientDrive.currentEffort && this.patientDrive.currentEffort.detected);
                            if (this.state.breathCount > 0 && (isSecondaryInEffort || this.state.timeInPhase < 0.50)) {
                                triggerType = 'double';
                                this.state.efforts.push({
                                    t: this.state.totalTime,
                                    detected: true,
                                    type: 'double'
                                });
                            } else {
                                triggerType = 'assist';
                            }

                            if (this.patientDrive.currentEffort) {
                                this.patientDrive.currentEffort.detected = true;
                                this.patientDrive.currentEffort.type = triggerType;
                            }
                        } else {
                            // Autotrigger: terskel krysset uten aktiv nevral pasientinnsats
                            triggerType = 'auto';
                            this.state.efforts.push({
                                t: this.state.totalTime,
                                detected: true,
                                type: 'auto'
                            });
                        }

                        this.state.lastTriggerType = triggerType;
                        this._startInspiration();
                        P_target = this.settings.ipap;
                    }
                }
            }

        } else if (this.state.phase === 'inspiration') {
            P_target = this.settings.ipap;

            // Målt flow i inspirasjon (lekkasjekorrigert) (A5, A7)
            const Q_meas = this.state.Q_total - this.state.Q_leak_estimert;
            this.state.Q_meas = Q_meas;

            // Spor toppflow Q_meas i innpustet
            if (Q_meas > this.state.peakQmeas) {
                this.state.peakQmeas = Q_meas;
            }

            // C5: Spor maksimalt luftveistrykk (PIP) og samle samples til Pplat (siste 100 ms)
            if (this.state.P_aw > this.state.pawMaxInBreath) {
                this.state.pawMaxInBreath = this.state.P_aw;
            }
            this._pawInspBuffer.push(this.state.P_aw);
            const maxBufferSamples = Math.round(0.10 / dt);
            if (this._pawInspBuffer.length > maxBufferSamples) {
                this._pawInspBuffer.shift();
            }

            // D1 & D2: Cyclinglogikk for PC-modus og PS-modus
            if (this.settings.mode === 'PC') {
                // PC-MODUS: Ingen flow-cycling — avsluttes utelukkende på tid (tiSet)
                if (this.state.timeInPhase >= this.settings.tiSet) {
                    this.state.lastCycleReason = 'timeSet';
                    this._startExpiration();
                    P_target = this.settings.epap;
                }
            } else {
                // PS-MODUS: Flow-cycling med tiMax tak (og tiMax * 0.7 for maskinutløste backup-pust)
                const isMandatory = (this.state.lastTriggerType === 'mandatory');
                const targetTiLimit = isMandatory ? (this.settings.tiMax * 0.7) : this.settings.tiMax;

                if (isMandatory) {
                    // ST-backup pust er tidsavbrutt ved Ti = tiMax * 0.7
                    if (this.state.timeInPhase >= targetTiLimit) {
                        this.state.lastCycleReason = 'timeSet';
                        this._startExpiration();
                        P_target = this.settings.epap;
                    }
                } else {
                    // Spontane pust i PS har flow-cycling
                    if (this.state.timeInPhase >= this.settings.tiMin) {
                        const cyclingThreshold = this.state.peakQmeas * this.settings.cyclingPercent;

                        if (Q_meas <= cyclingThreshold) {
                            // Normal flow-avslutning (Flow cycling)
                            this.state.lastCycleReason = 'flow';
                            this._startExpiration();
                            P_target = this.settings.epap;
                        } else if (this.state.timeInPhase >= targetTiLimit) {
                            // Tidsavbrutt innpust (Ti max)
                            this.state.lastCycleReason = 'tiMax';
                            this._startExpiration();
                            P_target = this.settings.epap;
                        }
                    }
                }
            }
        }

        // =========================================================================
        // DE 5 STEGENE I DEN FYSISKE VENTILATORMODELLEN (Fase 1, 2 & 3)
        // =========================================================================

        // Steg 1 — Måltrykket P_target
        this.state.P_target = P_target;

        // Steg 2 — Regulatoren P_servo, en dempet andreordens sløyfe
        const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
        const omega = 4.0 / Math.max(GRENSER.MIN_RISETIME, this.settings.riseTime);        // rad/s
        const zeta  = clamp(0.35 + 0.70 * (this.settings.riseTime - 0.05) / 0.85, 0.35, 1.05);
        const accel = omega * omega * (P_target - this.state.P_servo) - 2 * zeta * omega * this.state.dP_servo;
        this.state.dP_servo += accel * dt;
        this.state.P_servo  += this.state.dP_servo * dt;

        // Steg 3 — Masketrykket P_aw, løst algebraisk med A6 & A7
        const P_el = this.state.V / C_L;
        this.state.P_el = P_el;

        // A6: Ekspiratorisk flowbegrensning og beregning av R_eff
        const drivingExp = Math.max(0, P_el + Math.max(0, -this.state.P_mus) - this.settings.epap);
        const R_exp_eff  = R_exp * (1 + (this.patient.flowLimitation || 0) * drivingExp / 10);

        // Bestem retning ut fra forrige tidsstegs drivtrykk for å unngå sirkelavhengighet
        const isInspDirection = (this.state.P_aw + this.state.P_mus - P_el) > 0;
        const R_eff = isInspDirection ? R_insp : R_exp_eff;

        // A7: Kontinuerlig lekkasje og linearisert konduktans G_leak
        const Q_leak_prev = (this.settings.leak / 60) * Math.sqrt(Math.max(0, this.state.P_aw) / 10);
        const G_leak = (this.settings.leak > 0) ? (Q_leak_prev / Math.max(GRENSER.MIN_PAW_FOR_LEAK, this.state.P_aw)) : 0;

        const num = this.state.P_servo - this.machine.R_out * (this.state.P_mus - P_el) / R_eff;
        const den = 1 + this.machine.R_out / R_eff + this.machine.R_out * G_leak;
        let P_aw = num / den;

        // Steg 4 — Flowbegrensning (kapasitetsgrense på blåser)
        let Q_lunge_temp = (P_aw + this.state.P_mus - P_el) / R_eff;
        let Q_leak_temp  = (this.settings.leak / 60) * Math.sqrt(Math.max(0, P_aw) / 10);
        let Q_total_temp = Q_lunge_temp + Q_leak_temp;

        if (Q_total_temp > this.machine.Qmax) {
            const Q_lung_max = this.machine.Qmax - Q_leak_temp;
            P_aw = P_el - this.state.P_mus + Q_lung_max * R_eff;
        }

        // Steg 5 — Lungen (bevegelseslikningen løst med beregnet P_aw)
        const Q_lunge = (P_aw + this.state.P_mus - P_el) / R_eff;                        // L/s (sant pasientflow)
        const Q_leak  = (this.settings.leak / 60) * Math.sqrt(Math.max(0, P_aw) / 10);   // L/s (kontinuerlig lekkasjeflow)
        const Q_total = Q_lunge + Q_leak;                                                // L/s (total flow levert)

        this.state.P_aw = P_aw;
        this.state.Q_lunge = Q_lunge;
        this.state.Q_lekk = Q_leak;
        this.state.Q_total = Q_total;

        // Oppdater Q_meas også i pågående steg
        if (this.state.phase === 'expiration') {
            this.state.Q_meas = Q_total - this.state.Q_leak_estimert + Q_cardiac;
        } else {
            this.state.Q_meas = Q_total - this.state.Q_leak_estimert;
        }

        // Integrer sant lungevolum over FRC (A1: aldri tvangsnullstilt)
        this.state.V += Q_lunge * dt;

        // Integrer maskinmålt volum (A7: integrert Q_meas)
        this.state.volume_meas += this.state.Q_meas * dt * 1000;
        this.state.volume_lung = (this.state.V - C_L * this.settings.epap) * 1000;

        // Integrer VTI (maskinlevert inspirasjonsvolum inkludert lekkasje) og VTE (ekspirert pasientvolum)
        if (this.state.phase === 'inspiration') {
            if (Q_total > 0) {
                this._vtiAccum += Q_total * dt * 1000;
            }
        } else {
            if (Q_lunge < 0) {
                this._vteAccum += (-Q_lunge) * dt * 1000;
            }
        }

        // Oppdater monitor- og kompatibilitetsfelter
        this.state.paw = P_aw;
        this.state.pmus = this.state.P_mus;
        this.state.flow = (this.state.Q_meas + (this.state.phase === 'expiration' ? Q_cardiac : 0)) * 60; // L/min (maskinmålt kurve)
        this.state.flow_lung = (Q_lunge + (this.state.phase === 'expiration' ? Q_cardiac : 0)) * 60;      // L/min (sann lungekurve)
        this.state.volume = this.state.volume_meas; // ml (maskinmålt volumkurve i monitoren)

        // Oppdater kontinuerlige lekkasjemålinger (A7)
        this.state.measured.leak = parseFloat((Q_leak * 60).toFixed(1));

        // C3: Spor varighet over lekkasjegrense
        if (this.state.measured.leak > this.settings.alarmLeakLimit) {
            this.state.alarmState.leakTimeAbove += dt;
        } else {
            this.state.alarmState.leakTimeAbove = Math.max(0, this.state.alarmState.leakTimeAbove - dt * 2);
        }

        // C1: Kontinuerlig rullerende 60-sekunders vindu med tidsnormalisering (S2)
        if (this.recentBreaths.length > 0 && this.recentBreaths[0].t < this.state.totalTime - 60) {
            this.recentBreaths = this.recentBreaths.filter(b => b.t >= this.state.totalTime - 60);
        }
        
        const b60 = this.recentBreaths;
        const windowSec = Math.min(60, Math.max(1, this.state.totalTime));
        const rrtot = (this.state.totalTime >= 60) ? b60.length : (b60.length > 0 ? Math.round((b60.length / windowSec) * 60) : (this.state.measured.rrTotal || 0));
        const rrspont_cnt = b60.filter(b => b.triggerType === 'assist' || b.triggerType === 'double').length;
        const rrspont = (this.state.totalTime >= 60) ? rrspont_cnt : (b60.length > 0 ? Math.round((rrspont_cnt / windowSec) * 60) : (this.state.measured.rrSpont || 0));
        const spontPct = (b60.length > 0) ? Math.round((rrspont_cnt / b60.length) * 100) : ((this.patientDrive.rrSpont > 0) ? 100 : 0);
        this.state.measured.rrTotal = rrtot;
        this.state.measured.rrSpont = rrspont;
        this.state.measured.spontPercent = Math.min(100, Math.max(0, spontPct));

        const meanVte60 = (b60.length > 0) ? (b60.reduce((s, b) => s + b.vte, 0) / b60.length) : (this.state.measured.vt || 0);
        this.state.measured.mv = parseFloat(((meanVte60 * rrtot) / 1000).toFixed(2));

        // D5: Asynkroni-indeks over siste 60 sekunder fra state.efforts
        const eff60 = this.state.efforts.filter(e => e.t >= this.state.totalTime - 60);
        const totalEff = eff60.length;
        const asynchCount = eff60.filter(e => e.type === 'missed' || e.type === 'auto' || e.type === 'double').length;
        this.state.measured.asynchronyIndex = (totalEff > 0) ? Math.round((asynchCount / totalEff) * 100) : 0;

        // C3: Evaluer alle aktive alarmer (prioriter apné øverst)
        const alarms = [];
        if (this.state.isApneaAlarm) {
            alarms.push({
                id: 'apnea',
                priority: 1,
                type: 'danger',
                title: 'APNÉ',
                msg: `APNÉ: ingen levert pust i ${Math.round(timeSinceLast)} sekunder. Kontroller pasientinnsats, trigger og lekkasje.`
            });
        }
        if (this.state.measured.ppeak > (this.settings.ipap + this.settings.alarmHighPpeakDelta)) {
            alarms.push({
                id: 'high_pressure',
                priority: 2,
                type: 'warning',
                title: 'HØYT TRYKK',
                msg: `Topptrykk (${this.state.measured.ppeak.toFixed(1)} cmH₂O) overstiger alarmgrensen (${(this.settings.ipap + this.settings.alarmHighPpeakDelta).toFixed(1)} cmH₂O).`
            });
        }
        if (this.state.alarmState.lowVtStreak >= 3) {
            alarms.push({
                id: 'low_vt',
                priority: 3,
                type: 'warning',
                title: 'LAVT TIDALVOLUM',
                msg: `VTE under ${this.settings.alarmLowVtLimit} ml i 3 påfølgende pust (siste: ${this.state.measured.vt} ml).`
            });
        }
        if (this.state.measured.rrTotal > this.settings.alarmHighRrLimit) {
            alarms.push({
                id: 'high_rr',
                priority: 4,
                type: 'warning',
                title: 'HØY FREKVENS',
                msg: `Målt RRtot (${this.state.measured.rrTotal} /min) overstiger grensen (${this.settings.alarmHighRrLimit} /min).`
            });
        }
        if (this.state.alarmState.leakTimeAbove >= 10.0) {
            alarms.push({
                id: 'high_leak',
                priority: 5,
                type: 'warning',
                title: 'HØY LEKKASJE',
                msg: `Lekkasje (${this.state.measured.leak.toFixed(1)} L/min) har oversteget ${this.settings.alarmLeakLimit} L/min i mer enn 10 sekunder.`
            });
        }
        this.state.activeAlarms = alarms;

        // C7 & D3: Akkumuler min/maks-konvolutt for denne framen
        const curPaw = this.state.P_aw;
        const curFlow = this.state.flow;
        const curVol = this.state.volume;
        const curPes = -this.state.P_mus;
        const curFlowLung = this.state.flow_lung;
        const curVolLung = this.state.volume_lung;

        if (curPaw < this.frameSample.pawMin) this.frameSample.pawMin = curPaw;
        if (curPaw > this.frameSample.pawMax) this.frameSample.pawMax = curPaw;
        this.frameSample.pawLast = curPaw;

        if (curFlow < this.frameSample.flowMin) this.frameSample.flowMin = curFlow;
        if (curFlow > this.frameSample.flowMax) this.frameSample.flowMax = curFlow;
        this.frameSample.flowLast = curFlow;

        if (curVol < this.frameSample.volMin) this.frameSample.volMin = curVol;
        if (curVol > this.frameSample.volMax) this.frameSample.volMax = curVol;
        this.frameSample.volLast = curVol;

        if (curPes < this.frameSample.pesMin) this.frameSample.pesMin = curPes;
        if (curPes > this.frameSample.pesMax) this.frameSample.pesMax = curPes;
        this.frameSample.pesLast = curPes;

        if (curFlowLung < this.frameSample.flowLungMin) this.frameSample.flowLungMin = curFlowLung;
        if (curFlowLung > this.frameSample.flowLungMax) this.frameSample.flowLungMax = curFlowLung;
        this.frameSample.flowLungLast = curFlowLung;

        if (curVolLung < this.frameSample.volLungMin) this.frameSample.volLungMin = curVolLung;
        if (curVolLung > this.frameSample.volLungMax) this.frameSample.volLungMax = curVolLung;
        this.frameSample.volLungLast = curVolLung;

        // Sporing av pasientinnsats-markører (D3)
        if (this.patientDrive.currentEffort && !this.patientDrive.currentEffort.detected && !this.patientDrive.currentEffort.markerEmitted) {
            if (this.patientDrive.timeInCycle >= this.patientDrive.currentTiNeural * 0.45) {
                this.patientDrive.currentEffort.markerEmitted = true;
                this.frameEvents.push({ type: 'missed', t: this.patientDrive.currentEffort.t });
            }
        }
    }

    _startInspiration() {
        this.state.phase = 'inspiration';
        this.state.timeInPhase = 0;
        this.state.breathStartTime = this.state.totalTime;
        this.state.lastSuccessfulBreathTime = this.state.totalTime;
        this.state.peakQmeas = 0.0;
        this.state.justTriggered = true;
        this.state.isApneaAlarm = false;
        this.state.breathCount++;

        // D3: Registrer markørhendelse for utløst innpust
        if (this.patientDrive.currentEffort) {
            this.patientDrive.currentEffort.markerEmitted = true;
        }
        this.frameEvents.push({ type: this.state.lastTriggerType, t: this.state.totalTime });

        // C6: Mål faktisk ekspirasjonstid Te mellom forrige cycling og dette innpustet
        if (this.state.lastCycleTime > 0) {
            this.state.lastTe = Math.max(GRENSER.MIN_TE_MEASURED, this.state.totalTime - this.state.lastCycleTime);
        }

        // A1 & A6: Volum over FRC nullstilles ALDRI! Registrer V_endExp og PEEPi ved pustestart
        const C_L = this.patient.compliance / 1000;
        this.state.V_endExp = this.state.V;
        this.state.PEEPi = Math.max(0, (this.state.V_endExp / C_L) - this.settings.epap);
        this.state.measured.peepi = parseFloat(this.state.PEEPi.toFixed(1));

        // A7: Maskinmålt volum lagres for slutt-ekspirasjon og nullstilles for ny pust
        this.state.lastV_endExp_meas = this.state.volume_meas;
        this.state.volume_meas = 0.0;

        // VTE fra det fullførte utpustet
        this.state.VTE = Math.round(this._vteAccum);

        // C3: Spor påfølgende pust med lavt tidalvolum
        if (this.state.breathCount > 1) {
            if (this.state.VTE < this.settings.alarmLowVtLimit) {
                this.state.alarmState.lowVtStreak++;
            } else {
                this.state.alarmState.lowVtStreak = 0;
            }
        }

        // C1 & C5 & C6: Lagre det fullførte pustet i 60-sekunders historikken
        if (this.state.breathCount > 1) {
            const vtiVal = this.state.VTI;
            const vteVal = this.state.VTE;
            const breathLeakPct = (vtiVal > 0) ? Math.max(0, Math.min(100, Math.round(((vtiVal - vteVal) / vtiVal) * 100))) : 0;
            this.state.measured.leakPercent = breathLeakPct;

            this.recentBreaths.push({
                t: this.state.totalTime,
                vti: this.state.VTI,
                vte: this.state.VTE,
                pip: this.state.lastPip,
                pplat: this.state.lastPplat,
                ti: this.state.lastTi,
                te: this.state.lastTe,
                triggerType: this.state.lastTriggerType,
                cycleReason: this.state.lastCycleReason
            });

            // Begrens historikk til siste 60 sekunder
            this.recentBreaths = this.recentBreaths.filter(b => b.t >= this.state.totalTime - 60);

            // C1: Glatt enkeltpust-målinger over de siste 3 pustene
            this._updateSmoothedMetrics();
        }

        // Nullstill akkumulatorer for nytt innpust
        this._vtiAccum = 0;
        this._vteAccum = 0;
        this.state.pawMaxInBreath = this.state.P_aw;
        this._pawInspBuffer = [this.state.P_aw];
    }

    _startExpiration() {
        this.state.phase = 'expiration';
        const ti = this.state.timeInPhase;
        this.state.lastTi = ti;
        this.state.timeInPhase = 0;
        this.state.lastCycleTime = this.state.totalTime;

        // A1: Registrer VTI for avsluttet innpust
        this.state.VTI = Math.round(this._vtiAccum);

        // C5: PIP er maksimalt trykk gjennom hele innpustet
        this.state.lastPip = parseFloat(this.state.pawMaxInBreath.toFixed(1));

        // C5: Pplat er gjennomsnittet av P_aw de siste 100 ms før cycling
        const pplatCalc = (this._pawInspBuffer.length > 0)
            ? (this._pawInspBuffer.reduce((a, b) => a + b, 0) / this._pawInspBuffer.length)
            : this.state.P_aw;
        this.state.lastPplat = parseFloat(pplatCalc.toFixed(1));
    }

    // C1 & C6 & D5: Oppdater målinger glattet over de 3 siste pustene
    _updateSmoothedMetrics() {
        const last3 = this.recentBreaths.slice(-3);
        if (last3.length === 0) return;

        const avg = (key) => last3.reduce((sum, b) => sum + b[key], 0) / last3.length;

        this.state.measured.vti = Math.round(avg('vti'));
        this.state.measured.vte = Math.round(avg('vte'));
        this.state.measured.vt = this.state.measured.vte; // C1: Vt er VTE
        this.state.measured.ppeak = parseFloat(avg('pip').toFixed(1));
        this.state.measured.pplat = parseFloat(avg('pplat').toFixed(1));
        this.state.measured.ti = parseFloat(avg('ti').toFixed(2));
        this.state.measured.te = parseFloat(avg('te').toFixed(2));

        // C6: I:E-forhold og Ti/Ttot
        const tiVal = this.state.measured.ti;
        const teVal = this.state.measured.te;
        if (tiVal > 0 && teVal > 0) {
            if (teVal >= tiVal) {
                const ratio = (teVal / tiVal).toFixed(1).replace('.', ',');
                this.state.measured.ieRatio = `1:${ratio}`;
            } else {
                const ratio = (tiVal / teVal).toFixed(1).replace('.', ',');
                this.state.measured.ieRatio = `${ratio}:1`;
            }
            this.state.measured.tiTtot = Math.round((tiVal / (tiVal + teVal)) * 100);
        } else if (tiVal > 0) {
            this.state.measured.ieRatio = '1:0,0';
            this.state.measured.tiTtot = 100;
        } else {
            this.state.measured.ieRatio = '--:--';
            this.state.measured.tiTtot = 0;
        }

        // D5: Vt/kg IBW
        const ibw = this.getPatientIBW();
        this.state.measured.ibw = ibw;
        this.state.measured.vtPerKg = (ibw > 0 && this.state.measured.vt > 0)
            ? parseFloat((this.state.measured.vt / ibw).toFixed(1))
            : 0;
    }

    // FASE 6 (C12): Regelbasert fysiologisk analyse og klinisk innsikt
    getPhysiologicalInsights() {
        const C = this.patient.compliance;
        const R_insp = this.patient.resistance;
        const expRatio = (this.patient.expRatio !== undefined) ? this.patient.expRatio : 1.5;
        const R_valve = (this.machine.R_valve !== undefined) ? this.machine.R_valve : 2.0;
        const R_exp = R_insp * expRatio + R_valve;
        const tauInsp = (C * R_insp) / 1000; // Inspiratorisk tidskonstant: Tau = C * R
        const tauExp = (C * R_exp) / 1000;   // Ekspiratorisk tidskonstant
        const drivingPressure = this.settings.ipap - this.settings.epap;
        const theoreticalVt = Math.round(C * drivingPressure);
        const timeFor95Expiration = (3 * tauExp).toFixed(2); // 3 * Tau gir 95% tømming

        const triggerFlow = this.settings.triggerFlow;
        const pmus = this.patientDrive.pmusMax;
        const patientGeneratedFlow = parseFloat(((pmus / R_insp) * 60).toFixed(1));
        const lastCycleReason = this.state.lastCycleReason;
        const peepi = this.state.PEEPi || 0;

        const rules = [];

        // Regel 1: Obstruksjon (R >= 12)
        if (R_insp >= 12) {
            rules.push(`⚠️ <strong>Obstruksjon (R = ${R_insp} cmH₂O/(L/s)):</strong> Høy luftveismotstand gir forlenget ekspirasjonstidskonstant (τ<sub>exp</sub> = ${tauExp.toFixed(2)} s) og forsinket tømming (tar minst ${timeFor95Expiration} s å nå 95 % tømming). Karakteristisk langstrakt flow-hale.`);
        }

        // Regel 2: Restriksjon (C <= 30)
        if (C <= 30) {
            rules.push(`⚠️ <strong>Restriksjon (C = ${C} ml/cmH₂O):</strong> Stive lunger med lav ettergivelighet gir rask trykkutjevning, men krever vesentlig høyere drivtrykk (ΔP) for å oppnå fysiologisk tidalvolum (forventet kun ca. ${theoreticalVt} ml ved ΔP ${drivingPressure} cmH₂O).`);
        }

        // Regel 3: Auto-PEEP (PEEPi > 2)
        if (peepi > 2.0) {
            rules.push(`🚨 <strong>Dynamisk hyperinflasjon / Auto-PEEP (PEEPi = ${peepi.toFixed(1)} cmH₂O):</strong> Fanget ekspiratorisk luft skaper et positivt indre mottrykk. Pasienten må trekke ned ${peepi.toFixed(1)} cmH₂O ekstra før triggerterskelen nås. Økning av EPAP eller forlenget ekspirasjonstid (lavere frekvens/kortere Ti) kan gjenopprette trigging.`);
        } else if (peepi > 0.8) {
            rules.push(`⚠️ <strong>Mild auto-PEEP (PEEPi = ${peepi.toFixed(1)} cmH₂O):</strong> Begynnende luftfanging pga. ufullstendig ekspirasjon.`);
        }

        // Regel 4: Asynkroni (asynkroni-indeks > 10%)
        const asynchIdx = this.state.measured.asynchronyIndex || 0;
        if (asynchIdx > 10) {
            const eff60 = this.state.efforts.filter(e => e.t >= this.state.totalTime - 60);
            const missedCount = eff60.filter(e => e.type === 'missed').length;
            const autoCount = eff60.filter(e => e.type === 'auto').length;
            const doubleCount = eff60.filter(e => e.type === 'double').length;
            let domType = 'Asynkroni';
            let causeText = 'Manglende samspill mellom pasient og maskin.';
            if (missedCount >= autoCount && missedCount >= doubleCount && missedCount > 0) {
                domType = 'Mislykkede triggere (Missed efforts)';
                causeText = peepi > 1.5 ? 'Skyldes primært auto-PEEP som pasienten ikke overvinner.' : 'Skyldes for høy triggerterskel eller svak pasientkraft.';
            } else if (autoCount >= missedCount && autoCount >= doubleCount && autoCount > 0) {
                domType = 'Autotrigging';
                causeText = 'Skyldes for sensitiv trigger, maskelekkasje eller kardiogene oscillasjoner.';
            } else if (doubleCount > 0) {
                domType = 'Dobbelttrigging';
                causeText = 'Skyldes for tidlig avslutning (for høy cycling eller for kort Ti) mens pasienten fortsatt har nevral inspirasjon.';
            }
            rules.push(`⚡ <strong>Betydelig asynkroni (${asynchIdx} %):</strong> Dominerende form: <em>${domType}</em>. ${causeText}`);
        }

        // Regel 5: Lekkasje (lekkasje % > 25 eller lekkasje > 25 L/min)
        const leakPct = this.state.measured.leakPercent || 0;
        const leakVal = this.state.measured.leak || 0;
        if (leakPct > 25 || leakVal > 25) {
            rules.push(`💨 <strong>Høy maskelekkasje (${leakVal.toFixed(1)} L/min, ${leakPct.toFixed(0)} %):</strong> Kan forsinke flow-cycling (fare for Ti-max avbrudd), utløse autotrigging og skape feilaktig avlesning av ekspirert tidalvolum.`);
        }

        // Regel 6: Cyclingårsak (lastCycleReason === 'tiMax')
        if (lastCycleReason === 'tiMax') {
            rules.push(`⏱️ <strong>Tidsavbrutt inspirasjon (Ti-max = ${this.settings.tiMax.toFixed(1)} s):</strong> Maskinen avsluttet innpustet på maksimal sikkerhetstid fordi flow ikke sank under cycling-grensen (${Math.round(this.settings.cyclingPercent * 100)} %). Typisk ved stor lekkasje eller lang tidskonstant.`);
        }

        // Regel 7: Vt per kg IBW (alltid inkludert)
        const vtPerKg = this.state.measured.vtPerKg || 0;
        const ibw = this.state.measured.ibw || 70;
        let vtComment = '';
        if (vtPerKg >= 6 && vtPerKg <= 8) {
            vtComment = `Fysiologisk lungeprotektivt volum (6–8 ml/kg IBW).`;
        } else if (vtPerKg < 6 && vtPerKg > 0) {
            vtComment = `Lavt tidalvolum (< 6 ml/kg IBW) — fare for hypoventilasjon / atelektaser.`;
        } else if (vtPerKg > 8) {
            vtComment = `Høyt tidalvolum (> 8 ml/kg IBW) — fare for volutrauma / overstrekk.`;
        } else {
            vtComment = `Beregnet mot idealvekt (${ibw} kg).`;
        }
        rules.push(`👤 <strong>Tidalvolum:</strong> Målt ${this.state.measured.vt} ml (${vtPerKg.toFixed(1)} ml/kg IBW for ${ibw} kg). ${vtComment}`);

        // Hvis verken obstruksjon eller restriksjon er aktiv, vis normalmekanikk
        if (R_insp < 12 && C > 30) {
            rules.unshift(`✅ <strong>Normal lungemekanikk:</strong> Normal ettergivelighet (C = ${C} ml/cmH₂O) og motstand (R = ${R_insp} cmH₂O/(L/s), τ = ${tauExp.toFixed(2)} s). Lungene tømmes uanstrengt.`);
        }

        const clinicalNote = rules.map(r => `<div style="margin-bottom: 5px;">${r}</div>`).join('');

        return {
            tau: tauExp.toFixed(2),
            tauInsp: tauInsp.toFixed(2),
            tauExp: tauExp.toFixed(2),
            theoreticalVt,
            timeFor95Expiration,
            drivingPressure,
            triggerFlow,
            patientGeneratedFlow,
            lastCycleReason,
            peepi: peepi.toFixed(1),
            clinicalNote
        };
    }
}

// Gjør tilgjengelig globalt
window.VentilatorSimulator = VentilatorSimulator;
