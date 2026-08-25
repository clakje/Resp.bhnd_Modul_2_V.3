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
 */

const DT = 0.0002; // Fast internt tidssteg: 0.2 ms (5000 Hz) for numerisk stabilitet

class VentilatorSimulator {
    constructor() {
        // Maskinkonstanter for blåser og ventilasjonskrets (A2)
        this.machine = {
            R_out: 1.0, // cmH2O/(L/s) - Blåserens og slangens utgangsimpedans
            Qmax: 3.0   // L/s (~180 L/min) - Maksimal flowkapasitet for NIV-blåser
        };

        // Respiratorinnstillinger (Klinisk NIV / Hamilton standard)
        this.settings = {
            ipap: 14,             // cmH2O (Inspiratory Positive Airway Pressure)
            epap: 5,              // cmH2O (Expiratory Positive Airway Pressure / PEEP)
            rr: 15,               // pust/minutt (Respirasjonsfrekvens)
            fio2: 30,             // % Oksygenfraksjon
            riseTime: 0.15,       // sekunder (Tid for å nå IPAP, 0.05 - 0.90 s)
            cyclingPercent: 0.25, // 25% av toppflow avslutter innpust (E-Sense)
            leak: 0,              // L/min (Maskelekkasje)
            triggerFlow: 3.0      // L/min (Innstilt flow-trigger: 1.0 - 5.0 L/min)
        };

        // Pasientfysiologi
        this.patient = {
            compliance: 50,       // ml / cmH2O (Lungenettverkets ettergivelighet)
            resistance: 5,        // cmH2O / (L/s) (Luftveismotstand)
            pmusMax: 2.5,         // cmH2O (Pasientens egen inspiratoriske muskelinnsats)
            preset: 'normal'      // 'normal', 'copd', 'restrictive', 'custom'
        };

        // Akkumulatorer for VTI og VTE
        this._vtiAccum = 0; // ml
        this._vteAccum = 0; // ml

        // Simulatortilstand
        const C_L = this.patient.compliance / 1000;
        this.state = {
            phase: 'expiration',   // 'inspiration', 'expiration', eller 'triggering'
            timeInPhase: 0,        // sekunder i gjeldende fase
            totalTime: 0,          // total simuleringstid

            // A2: Trykk- og flowtilstander
            P_target: this.settings.epap, // cmH2O - Måltrykk fra maskinen
            P_servo: this.settings.epap,  // cmH2O - Andreordens servoregulator
            dP_servo: 0.0,                // cmH2O/s - Derivert av P_servo
            P_aw: this.settings.epap,     // cmH2O - Masketrykk
            P_mus: 0.0,                   // cmH2O - Pasientens muskelinnsats
            P_el: this.settings.epap,     // cmH2O - Elastisk lunge-tilbakefjæring (V / C_L)
            Q_lunge: 0.0,                 // L/s - Lungeflow
            Q_lekk: 0.0,                  // L/s - Lekkasjeflow
            Q_total: 0.0,                 // L/s - Total flow levert av maskinen

            // A1: Kontinuerlig volum og målte volumstørrelser
            V: C_L * this.settings.epap,  // Liter over FRC (initialiseres til likevekt ved EPAP)
            VTI: 0,                       // ml - integralet av positiv lungeflow gjennom innpustet
            VTE: 0,                       // ml - integralet av negativ lungeflow gjennom utpustet
            V_endExp: C_L * this.settings.epap, // Liter over FRC ved starten av innpust
            PEEPi: 0.0,                   // cmH2O - Iboende PEEP (auto-PEEP)

            // A8: Numerisk restakkumulator
            dtCarry: 0.0,

            // Bakoverkompatibilitet og monitor-felter
            paw: this.settings.epap,      // cmH2O (= P_aw)
            volume: 0.0,                  // ml over innstilt EPAP: (V - C_L * epap) * 1000
            flow: 0.0,                    // L/min (= Q_total * 60)
            pmus: 0.0,                    // cmH2O (= P_mus)

            peakFlowInPhase: 0,           // L/min (brukes til flow-cycling)
            breathStartTime: 0,
            lastSuccessfulBreathTime: 0,
            timeSinceLastBreath: 0,
            breathCount: 0,               // Syklusteller for å styre f.eks. 50% trigging ved 4 L/min
            justTriggered: false,         // True i det øyeblikket et innpust trigges
            isApneaAlarm: false,          // True ved manglende trigger / apné
            
            // Kontinuerlige monitor-målinger
            measured: {
                vt: 450,                  // ml
                mv: 6.75,                 // L/min
                ppeak: 14.0,              // cmH2O
                rrTotal: 15,              // pust/min
                ti: 1.1,                  // sekunder (faktisk inspirasjonstid)
                te: 2.9,                  // sekunder (faktisk ekspirasjonstid)
                leak: 0                   // L/min
            }
        };

        // Historikk for beregning av minuttvolum og snitt
        this.recentBreaths = [];
        this.isRunning = true;
    }

    // Sett klinisk pasientprofil (Preset)
    setPreset(presetName) {
        if (presetName === 'copd') {
            // KOLS / Obstruktiv: Høy motstand, normal/høy compliance, lang utpust
            this.patient.compliance = 70;
            this.patient.resistance = 18;
            this.patient.pmusMax = 3.0;
            this.patient.preset = 'copd';
        } else if (presetName === 'restrictive') {
            // Pneumoni / Lungeødem / ARDS: Svært stiv lunge, lav compliance
            this.patient.compliance = 22;
            this.patient.resistance = 5;
            this.patient.pmusMax = 3.5;
            this.patient.preset = 'restrictive';
        } else {
            // Normal
            this.patient.compliance = 50;
            this.patient.resistance = 5;
            this.patient.pmusMax = 2.5;
            this.patient.preset = 'normal';
        }
    }

    // Nullstill simuleringstilstand (A1, A8)
    reset() {
        const C_L = this.patient.compliance / 1000;
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

        this.state.V = C_L * this.settings.epap;
        this.state.VTI = 0;
        this.state.VTE = 0;
        this.state.V_endExp = this.state.V;
        this.state.PEEPi = 0.0;

        this.state.paw = this.settings.epap;
        this.state.volume = 0.0;
        this.state.flow = 0.0;
        this.state.pmus = 0.0;

        this.state.peakFlowInPhase = 0;
        this.state.breathStartTime = 0;
        this.state.lastSuccessfulBreathTime = 0;
        this.state.timeSinceLastBreath = 0;
        this.state.breathCount = 0;
        this.state.justTriggered = false;
        this.state.isApneaAlarm = false;

        this._vtiAccum = 0;
        this._vteAccum = 0;
        this.recentBreaths = [];
    }

    // Oppdatering per frame med fast internt tidssteg DT (A8)
    step(frameDt) {
        if (!this.isRunning) return;

        // Er frameDt > 0.5 (fanen har vært i bakgrunnen), hopp over framen og fortsett
        if (frameDt > 0.5) {
            this.state.dtCarry = 0;
            return;
        }

        const totalDt = frameDt + (this.state.dtCarry || 0);
        let n = Math.round(totalDt / DT);
        if (n > 2500) {
            n = 2500; // Maks 0.5s simulert tid per frame
        }
        this.state.dtCarry = totalDt - n * DT;

        for (let i = 0; i < n; i++) {
            this._singleStep(DT);
        }

        // Sikkerhetsventil: hvis numerisk ustabilitet oppdages, nullstill og varsle
        if (Math.abs(this.state.P_aw) > 200 || !isFinite(this.state.V)) {
            console.warn('Sikkerhetsventil utløst i VentilatorSimulator: P_aw eller V er utenfor gyldig område. Tilbakestiller tilstand.', {
                P_aw: this.state.P_aw,
                V: this.state.V
            });
            this.reset();
        }
    }

    _singleStep(dt) {
        this.state.totalTime += dt;
        this.state.timeInPhase += dt;

        const cycleTime = 60 / Math.max(5, this.settings.rr);
        const C_L = this.patient.compliance / 1000; // L / cmH2O
        const R_eff = this.patient.resistance;      // cmH2O / (L/s)

        // Sjekk overgang fra ekspirasjon til triggering
        const timeSinceBreathStart = this.state.totalTime - this.state.breathStartTime;
        if (this.state.phase === 'expiration' && timeSinceBreathStart >= cycleTime) {
            this.state.phase = 'triggering';
            this.state.timeInPhase = 0;
            this.state.breathCount++;
        }

        // Apné-overvåking: spor tid siden forrige vellykkede pust
        const timeSinceLast = this.state.totalTime - this.state.lastSuccessfulBreathTime;
        this.state.timeSinceLastBreath = timeSinceLast;

        const trigFlow = this.settings.triggerFlow;
        const isIneffectiveTrigger = trigFlow >= 5.0;

        if (isIneffectiveTrigger || timeSinceLast >= Math.max(9.0, cycleTime * 2.0)) {
            this.state.isApneaAlarm = true;
            this.state.measured.rrTotal = 0;
            this.state.measured.vt = 0;
            this.state.measured.mv = 0;
        } else {
            this.state.isApneaAlarm = false;
        }

        // Bestem måltrykk P_target og pasientinnsats P_mus for denne fasen
        let P_target = this.settings.epap;

        if (this.state.phase === 'triggering') {
            // Pasientens inspiratoriske muskelinnsats (Pmus) over ca 300 ms
            const effortDuration = 0.30;
            const effortProgress = Math.min(1.0, this.state.timeInPhase / effortDuration);
            const currentPmus = this.patient.pmusMax * Math.sin(Math.PI * effortProgress);
            this.state.P_mus = currentPmus;

            // Fysiologisk trigging basert på innstilt flow-trigger
            let willTriggerThisBreath = false;
            if (trigFlow <= 3.0) {
                willTriggerThisBreath = true;
            } else if (trigFlow < 5.0) {
                willTriggerThisBreath = (this.state.breathCount % 2 === 1);
            } else {
                willTriggerThisBreath = false;
            }

            if (willTriggerThisBreath && this.state.timeInPhase >= 0.04) {
                this._startInspiration();
                P_target = this.settings.ipap;
            } else if (this.state.timeInPhase >= effortDuration) {
                // Uutløst triggerforsøk (missed effort)
                this.state.phase = 'expiration';
                this.state.timeInPhase = 0;
                this.state.breathStartTime = this.state.totalTime;
                this.state.P_mus = 0;
                P_target = this.settings.epap;
            } else {
                P_target = this.settings.epap;
            }

        } else if (this.state.phase === 'inspiration') {
            P_target = this.settings.ipap;

            // Pasientens muskelinnsats under resten av innpustet
            const pmusDuration = Math.min(0.6, cycleTime * 0.25);
            if (this.state.timeInPhase < pmusDuration) {
                const pmusProgress = this.state.timeInPhase / pmusDuration;
                this.state.P_mus = this.patient.pmusMax * Math.sin(Math.PI * pmusProgress);
            } else {
                this.state.P_mus = 0;
            }

        } else {
            // Ekspirasjonsfasen
            P_target = this.settings.epap;
            this.state.P_mus = 0;
        }

        // =========================================================================
        // DE 5 STEGENE I DEN FYSISKE VENTILATORMODELLEN (A2)
        // =========================================================================

        // Steg 1 — Måltrykket P_target (den eneste «ønskede» verdien)
        this.state.P_target = P_target;

        // Steg 2 — Regulatoren P_servo, en dempet andreordens sløyfe
        const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
        const omega = 3.0 / Math.max(0.03, this.settings.riseTime);        // rad/s
        const zeta  = clamp(0.42 + 0.60 * (this.settings.riseTime - 0.05) / 0.85, 0.42, 1.05);
        const accel = omega * omega * (P_target - this.state.P_servo) - 2 * zeta * omega * this.state.dP_servo;
        this.state.dP_servo += accel * dt;
        this.state.P_servo  += this.state.dP_servo * dt;

        // Steg 3 — Masketrykket P_aw, løst algebraisk
        const P_el = this.state.V / C_L;
        this.state.P_el = P_el;
        const G_leak = 0; // G_leak = 0 i denne fasen (se fase 3)

        const num = this.state.P_servo - this.machine.R_out * (this.state.P_mus - P_el) / R_eff;
        const den = 1 + this.machine.R_out / R_eff + this.machine.R_out * G_leak;
        let P_aw = num / den;

        // Steg 4 — Flowbegrensning (kapasitetsgrense på blåser)
        let Q_lunge_temp = (P_aw + this.state.P_mus - P_el) / R_eff;
        let Q_lekk_temp  = G_leak * P_aw;
        let Q_total_temp = Q_lunge_temp + Q_lekk_temp;

        if (Q_total_temp > this.machine.Qmax) {
            const Q_lung_max = this.machine.Qmax - Q_lekk_temp;
            P_aw = P_el - this.state.P_mus + Q_lung_max * R_eff;
        }

        // Steg 5 — Lungen (bevegelseslikningen løst med beregnet P_aw)
        const Q_lunge = (P_aw + this.state.P_mus - P_el) / R_eff;   // L/s
        const Q_lekk  = G_leak * P_aw;                              // L/s
        const Q_total = Q_lunge + Q_lekk;                           // L/s

        this.state.P_aw = P_aw;
        this.state.Q_lunge = Q_lunge;
        this.state.Q_lekk = Q_lekk;
        this.state.Q_total = Q_total;

        // Integrer lungevolum over FRC (A1: aldri tvangsnullstilt)
        this.state.V += Q_lunge * dt;

        // Integrer VTI og VTE
        if (this.state.phase === 'inspiration') {
            if (Q_lunge > 0) {
                this._vtiAccum += Q_lunge * dt * 1000;
            }
        } else {
            if (Q_lunge < 0) {
                this._vteAccum += (-Q_lunge) * dt * 1000;
            }
        }

        // Oppdater monitor- og kompatibilitetsfelter
        this.state.paw = P_aw;
        this.state.pmus = this.state.P_mus;
        this.state.flow = Q_total * 60; // L/min
        this.state.volume = (this.state.V - C_L * this.settings.epap) * 1000; // ml over innstilt EPAP (A1)

        // Inspiratorisk sporing og flow-cycling
        if (this.state.phase === 'inspiration') {
            if (this.state.flow > this.state.peakFlowInPhase) {
                this.state.peakFlowInPhase = this.state.flow;
            }

            const cyclingThreshold = this.state.peakFlowInPhase * this.settings.cyclingPercent;
            const minInspirationTime = 0.20; // sekunder
            const maxInspirationTime = Math.min(3.0, cycleTime * 0.65);

            if (this.state.timeInPhase > minInspirationTime) {
                if (this.state.flow <= cyclingThreshold || this.state.timeInPhase >= maxInspirationTime) {
                    this._startExpiration();
                }
            }
        }
    }

    _startInspiration() {
        this.state.phase = 'inspiration';
        this.state.timeInPhase = 0;
        this.state.breathStartTime = this.state.totalTime;
        this.state.lastSuccessfulBreathTime = this.state.totalTime;
        this.state.peakFlowInPhase = 0;
        this.state.justTriggered = true;
        this.state.isApneaAlarm = false;

        // A1: Volum nullstilles ALDRI! Registrer V_endExp og PEEPi ved pustestart
        const C_L = this.patient.compliance / 1000;
        this.state.V_endExp = this.state.V;
        this.state.PEEPi = Math.max(0, (this.state.V_endExp / C_L) - this.settings.epap);
        this.state.VTE = Math.round(this._vteAccum);
        this._vtiAccum = 0;
        this._vteAccum = 0;
    }

    _startExpiration() {
        this.state.phase = 'expiration';
        const ti = this.state.timeInPhase;
        this.state.timeInPhase = 0;

        // A1: Registrer VTI og målte verdier for avsluttet innpust
        this.state.VTI = Math.round(this._vtiAccum);
        const measuredVt = this.state.VTI;
        const measuredPpeak = parseFloat(this.state.P_aw.toFixed(1));
        
        this.state.measured.vt = measuredVt;
        this.state.measured.ppeak = measuredPpeak;
        this.state.measured.ti = parseFloat(ti.toFixed(2));
        
        // Beregn effektiv frekvens og minuttvolum basert på faktisk leverte pust
        let effectiveRR = this.settings.rr;
        if (this.settings.triggerFlow === 4.0 || (this.settings.triggerFlow > 3.0 && this.settings.triggerFlow < 5.0)) {
            effectiveRR = Math.round(this.settings.rr / 2); // 50% trigging
        } else if (this.settings.triggerFlow >= 5.0) {
            effectiveRR = 0;
        }

        this.state.measured.rrTotal = effectiveRR;
        this.state.measured.mv = parseFloat(((measuredVt * effectiveRR) / 1000).toFixed(2));
        this.state.measured.te = parseFloat(((60 / Math.max(1, this.settings.rr)) - ti).toFixed(2));

        // Lagre i historikk
        this.recentBreaths.push({
            time: this.state.totalTime,
            vt: measuredVt,
            ppeak: measuredPpeak,
            ti: ti
        });
        if (this.recentBreaths.length > 10) {
            this.recentBreaths.shift();
        }
    }

    // Hent pedagogisk analyse, tidskonstant og trigger-samkjøring
    getPhysiologicalInsights() {
        const C = this.patient.compliance;
        const R = this.patient.resistance;
        const tau = (C * R) / 1000; // Tidskonstant i sekunder: Tau = C * R
        const drivingPressure = this.settings.ipap - this.settings.epap;
        const theoreticalVt = Math.round(C * drivingPressure);
        const timeFor95Expiration = (3 * tau).toFixed(2); // 3 * Tau gir 95% tømming

        const triggerFlow = this.settings.triggerFlow;
        const patientGeneratedFlow = parseFloat(((this.patient.pmusMax / R) * 60).toFixed(1));
        let triggerStatus = 'optimal'; // 'optimal', 'variable', 'ineffective'
        let triggerNote = '';

        if (triggerFlow <= 3.0) {
            triggerStatus = 'optimal';
            triggerNote = `<div style="margin-top:6px; color:#22c55e;">✅ <strong>Optimal Flow-trigger (${triggerFlow.toFixed(1)} L/min):</strong> Pasienten trigger maskinen pålitelig ved hvert eneste innpust (100% synkroni). Hvert innpust markeres med lilla trekant (▲) og mottar full IPAP-støtte.</div>`;
        } else if (triggerFlow === 4.0 || (triggerFlow > 3.0 && triggerFlow < 5.0)) {
            triggerStatus = 'variable';
            triggerNote = `<div style="margin-top:6px; color:#f59e0b;">⚠️ <strong>Asynkroni / Ineffektiv trigger (${triggerFlow.toFixed(1)} L/min):</strong> Triggeren er tung for pasienten. Kun ca. 50% av pasientens innsatser når terskelen (missed efforts). Maskinen gir kun støtte (▲) på de pustene som utløses, og minuttvolumet halveres.</div>`;
        } else {
            triggerStatus = 'ineffective';
            triggerNote = `<div style="margin-top:6px; color:#ef4444;">🚨 <strong>Uutløst trigger / Apné (${triggerFlow.toFixed(1)} L/min):</strong> For tung flow-trigger! Pasientens spontanflow når aldri terskelen. Maskinen forblir på EPAP uten å levere trykkstøtte. <strong>Apné-alarm er utløst!</strong> Senk triggeren til 1–3 L/min for å gjenopprette ventilasjon.</div>`;
        }

        let clinicalNote = '';
        if (this.patient.preset === 'copd' || R >= 12) {
            clinicalNote = `⚠️ <strong>Obstruktiv mekanikk (KOLS):</strong> Høy motstand (R = ${R} cmH₂O/(L/s)) gir en lang tidskonstant (τ = ${tau.toFixed(2)}s). Det tar minst ${timeFor95Expiration}s å tømme 95% av luften. Legg merke til den forlengede flow-halen i ekspirasjonen.${triggerNote}`;
        } else if (this.patient.preset === 'restrictive' || C <= 30) {
            clinicalNote = `⚠️ <strong>Restriktiv mekanikk (Pneumoni / Lungeødem):</strong> Stive lunger med lav ettergivelighet (C = ${C} ml/cmH₂O) gir kort tidskonstant (τ = ${tau.toFixed(2)}s) og rask trykkutjevning, men gir lave tidalvolumer (forventet ca. ${theoreticalVt} ml). Øk IPAP for å kompensere.${triggerNote}`;
        } else {
            clinicalNote = `✅ <strong>Normal lungemekanikk:</strong> Normal ettergivelighet og motstand (τ = ${tau.toFixed(2)}s). Lungene tømmes uanstrengt på ca. ${timeFor95Expiration}s.${triggerNote}`;
        }

        return {
            tau: tau.toFixed(2),
            theoreticalVt,
            timeFor95Expiration,
            drivingPressure,
            triggerFlow,
            patientGeneratedFlow,
            triggerStatus,
            clinicalNote
        };
    }
}

// Gjør tilgjengelig globalt
window.VentilatorSimulator = VentilatorSimulator;
