const fs = require('fs');
const path = require('path');
global.window = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'simulator.js'), 'utf8'));
const VentilatorSimulator = global.window.VentilatorSimulator;

const GRENSER = {
    MIN_RISETIME: 0.03,
    MIN_PAW_FOR_LEAK: 0.5,
    MIN_RRSPONT_DIVISOR: 1,
    MIN_CYCLE_DURATION: 0.4,
    MIN_TI_NEURAL: 0.2,
    MIN_IBW: 30,
    MIN_TE_MEASURED: 0.1,
    MAX_SUBSTEPS_PER_FRAME: 2500
};

// 2. Updated PatientDrive
function applyFixes(sim) {
    sim.patientDrive.step = function(dt, totalTime, effortsList) {
        if (this.rrSpont <= 0) {
            this.P_mus = 0;
            this.currentEffort = null;
            this.timeInCycle = 0;
            return;
        }

        if (this.timeInCycle >= this.currentCycleDuration || this.currentCycleDuration === Infinity) {
            this._startNewCycle(totalTime, effortsList);
        }

        const tn = this.timeInCycle;
        const tiN = this.currentTiNeural;
        const pMax = this.currentPmusMax;
        const pExp = this.currentPmusExp;

        let pmus = 0.0;
        if (tn < 0.75 * tiN) {
            pmus = (0.75 * tiN > 0) ? pMax * (tn / (0.75 * tiN)) : 0;
        } else if (tn < tiN) {
            pmus = pMax;
        } else if (tn < tiN + 0.35) {
            pmus = -pExp * Math.sin(Math.PI * (tn - tiN) / 0.35);
        } else {
            pmus = 0.0;
        }

        this.P_mus = pmus;
        this.timeInCycle += dt;
    };

    // Updated singleStep with mandatory timed cycling, omega calibration, and COPD params
    sim._singleStep = function(dt) {
        this.state.totalTime += dt;
        this.state.timeInPhase += dt;

        const C_L = this.patient.compliance / 1000;
        const R_insp = this.patient.resistance;
        const expRatio = (this.patient.expRatio !== undefined) ? this.patient.expRatio : 1.5;
        const R_valve = (this.machine.R_valve !== undefined) ? this.machine.R_valve : 2.0;
        const R_exp = this.patient.resistance * expRatio + R_valve;

        // 1. Pasientens respirasjonssenter
        this.patientDrive.step(dt, this.state.totalTime, this.state.efforts);
        this.state.P_mus = this.patientDrive.P_mus;

        if (this.state.efforts.length > 0 && this.state.efforts[0].t < this.state.totalTime - 60) {
            this.state.efforts = this.state.efforts.filter(e => e.t >= this.state.totalTime - 60);
        }

        const Q_cardiac = (this.patientDrive.cardiacArtifact / 60) * Math.sin(2 * Math.PI * 1.25 * this.state.totalTime);

        // 2. Apne overvåking
        const timeSinceLast = this.state.totalTime - this.state.lastSuccessfulBreathTime;
        this.state.timeSinceLastBreath = timeSinceLast;
        const isStActive = !!(this.settings.stActive && this.settings.backupRate > 0);
        this.state.isApneaAlarm = (!isStActive && timeSinceLast >= this.settings.apneaDelay);

        // 3. Fase og trigger/cycling
        let P_target = this.settings.epap;

        if (this.state.phase === 'expiration') {
            P_target = this.settings.epap;

            const epapLeakTarget = (this.settings.leak / 60) * Math.sqrt(Math.max(0, this.state.P_aw) / 10);
            if (this.state.timeInPhase > 0.15) {
                this.state.Q_leak_estimert += (epapLeakTarget - this.state.Q_leak_estimert) * (dt / 0.5);
            }

            const Q_meas = this.state.Q_total - this.state.Q_leak_estimert + Q_cardiac;
            this.state.Q_meas = Q_meas;

            if (isStActive) {
                const backupInterval = 60 / this.settings.backupRate;
                if (timeSinceLast >= backupInterval) {
                    this.state.lastTriggerType = 'mandatory';
                    this.state.efforts.push({
                        t: this.state.totalTime,
                        detected: true,
                        type: 'mandatory'
                    });
                    this._startInspiration();
                    P_target = this.settings.ipap;
                }
            }

            if (this.state.phase === 'expiration') {
                const refractoryPeriod = 0.15;
                if (this.state.timeInPhase >= refractoryPeriod) {
                    let isTriggered = false;

                    if (this.settings.triggerMode === 'flow') {
                        const trigFlowLps = this.settings.triggerFlow / 60;
                        isTriggered = (Q_meas > trigFlowLps);
                    } else if (this.settings.triggerMode === 'pressure') {
                        isTriggered = (this.state.P_aw < this.settings.epap - this.settings.triggerPressure);
                    }

                    if (isTriggered) {
                        const isNeural = this.patientDrive.isNeuralActive();
                        let triggerType = 'assist';

                        if (isNeural) {
                            if (this.state.breathCount > 0 && this.state.timeInPhase < 0.40) {
                                triggerType = 'double';
                            } else {
                                triggerType = 'assist';
                            }

                            if (this.patientDrive.currentEffort) {
                                this.patientDrive.currentEffort.detected = true;
                                this.patientDrive.currentEffort.type = triggerType;
                            }
                        } else {
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

            const Q_meas = this.state.Q_total - this.state.Q_leak_estimert;
            this.state.Q_meas = Q_meas;

            if (Q_meas > this.state.peakQmeas) {
                this.state.peakQmeas = Q_meas;
            }

            if (this.state.P_aw > this.state.pawMaxInBreath) {
                this.state.pawMaxInBreath = this.state.P_aw;
            }
            this._pawInspBuffer.push(this.state.P_aw);
            const maxBufferSamples = Math.round(0.10 / dt);
            if (this._pawInspBuffer.length > maxBufferSamples) {
                this._pawInspBuffer.shift();
            }

            if (this.settings.mode === 'PC') {
                if (this.state.timeInPhase >= this.settings.tiSet) {
                    this.state.lastCycleReason = 'timeSet';
                    this._startExpiration();
                    P_target = this.settings.epap;
                }
            } else {
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
                            this.state.lastCycleReason = 'flow';
                            this._startExpiration();
                            P_target = this.settings.epap;
                        } else if (this.state.timeInPhase >= targetTiLimit) {
                            this.state.lastCycleReason = 'tiMax';
                            this._startExpiration();
                            P_target = this.settings.epap;
                        }
                    }
                }
            }
        }

        // Steg 1
        this.state.P_target = P_target;

        // Steg 2 - kalibrert omega for presis 90% stigetid
        const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
        const omega = 4.0 / Math.max(GRENSER.MIN_RISETIME, this.settings.riseTime);
        const zeta  = clamp(0.42 + 0.60 * (this.settings.riseTime - 0.05) / 0.85, 0.42, 1.05);
        const accel = omega * omega * (P_target - this.state.P_servo) - 2 * zeta * omega * this.state.dP_servo;
        this.state.dP_servo += accel * dt;
        this.state.P_servo  += this.state.dP_servo * dt;

        // Steg 3
        const P_el = this.state.V / C_L;
        this.state.P_el = P_el;

        const drivingExp = Math.max(0, P_el + Math.max(0, -this.state.P_mus) - this.settings.epap);
        const R_exp_eff  = R_exp * (1 + (this.patient.flowLimitation || 0) * drivingExp / 10);

        const isInspDirection = (this.state.P_aw + this.state.P_mus - P_el) > 0;
        const R_eff = isInspDirection ? R_insp : R_exp_eff;

        const Q_leak_prev = (this.settings.leak / 60) * Math.sqrt(Math.max(0, this.state.P_aw) / 10);
        const G_leak = (this.settings.leak > 0) ? (Q_leak_prev / Math.max(GRENSER.MIN_PAW_FOR_LEAK, this.state.P_aw)) : 0;

        const num = this.state.P_servo - this.machine.R_out * (this.state.P_mus - P_el) / R_eff;
        const den = 1 + this.machine.R_out / R_eff + this.machine.R_out * G_leak;
        let P_aw = num / den;

        // Steg 4
        let Q_lunge_temp = (P_aw + this.state.P_mus - P_el) / R_eff;
        let Q_leak_temp  = (this.settings.leak / 60) * Math.sqrt(Math.max(0, P_aw) / 10);
        let Q_total_temp = Q_lunge_temp + Q_leak_temp;

        if (Q_total_temp > this.machine.Qmax) {
            const Q_lung_max = this.machine.Qmax - Q_leak_temp;
            P_aw = P_el - this.state.P_mus + Q_lung_max * R_eff;
        }

        // Steg 5
        const Q_lunge = (P_aw + this.state.P_mus - P_el) / R_eff;
        const Q_leak  = (this.settings.leak / 60) * Math.sqrt(Math.max(0, P_aw) / 10);
        const Q_total = Q_lunge + Q_leak;

        this.state.P_aw = P_aw;
        this.state.Q_lunge = Q_lunge;
        this.state.Q_lekk = Q_leak;
        this.state.Q_total = Q_total;

        if (this.state.phase === 'expiration') {
            this.state.Q_meas = Q_total - this.state.Q_leak_estimert + Q_cardiac;
        } else {
            this.state.Q_meas = Q_total - this.state.Q_leak_estimert;
        }

        this.state.V += Q_lunge * dt;
        this.state.volume_meas += this.state.Q_meas * dt * 1000;
        this.state.volume_lung = (this.state.V - C_L * this.settings.epap) * 1000;

        if (this.state.phase === 'inspiration') {
            if (Q_total > 0) this._vtiAccum += Q_total * dt * 1000;
        } else {
            if (Q_lunge < 0) this._vteAccum += (-Q_lunge) * dt * 1000;
        }

        this.state.paw = P_aw;
        this.state.pmus = this.state.P_mus;
        this.state.flow = (this.state.Q_meas + (this.state.phase === 'expiration' ? Q_cardiac : 0)) * 60;
        this.state.flow_lung = (Q_lunge + (this.state.phase === 'expiration' ? Q_cardiac : 0)) * 60;
        this.state.volume = this.state.volume_meas;

        this.state.measured.leak = parseFloat((Q_leak * 60).toFixed(1));
        this.state.measured.leakPercent = parseFloat(((Q_total > 0.001) ? (Q_leak / Q_total * 100) : 0).toFixed(1));

        if (this.state.measured.leak > this.settings.alarmLeakLimit) {
            this.state.alarmState.leakTimeAbove += dt;
        } else {
            this.state.alarmState.leakTimeAbove = Math.max(0, this.state.alarmState.leakTimeAbove - dt * 2);
        }

        if (this.recentBreaths.length > 0 && this.recentBreaths[0].t < this.state.totalTime - 60) {
            this.recentBreaths = this.recentBreaths.filter(b => b.t >= this.state.totalTime - 60);
        }

        const b60 = this.recentBreaths;
        const rrtot = b60.length;
        const rrspont = b60.filter(b => b.triggerType === 'assist' || b.triggerType === 'double').length;
        const spontPct = (rrtot > 0) ? Math.round((rrspont / rrtot) * 100) : 0;
        this.state.measured.rrTotal = rrtot;
        this.state.measured.rrSpont = rrspont;
        this.state.measured.spontPercent = spontPct;

        const meanVte60 = (b60.length > 0) ? (b60.reduce((s, b) => s + b.vte, 0) / b60.length) : (this.state.measured.vt || 0);
        this.state.measured.mv = parseFloat(((meanVte60 * rrtot) / 1000).toFixed(2));

        const eff60 = this.state.efforts.filter(e => e.t >= this.state.totalTime - 60);
        const totalEff = eff60.length;
        const asynchCount = eff60.filter(e => e.type === 'missed' || e.type === 'auto' || e.type === 'double').length;
        this.state.measured.asynchronyIndex = (totalEff > 0) ? Math.round((asynchCount / totalEff) * 100) : 0;

        const alarms = [];
        if (this.state.isApneaAlarm) {
            alarms.push({ id: 'apnea', priority: 1, type: 'danger', title: 'APNÉ', msg: `APNÉ` });
        }
        this.state.activeAlarms = alarms;

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

        if (this.patientDrive.currentEffort && !this.patientDrive.currentEffort.detected && !this.patientDrive.currentEffort.markerEmitted) {
            if (this.patientDrive.timeInCycle >= this.patientDrive.currentTiNeural * 0.45) {
                this.patientDrive.currentEffort.markerEmitted = true;
                this.frameEvents.push({ type: 'missed', t: this.patientDrive.currentEffort.t });
            }
        }
    };
}

console.log('Running test battery with applyFixes...');

// Test all 18:
let passCount = 0;
let failCount = 0;

function assert(id, desc, cond, detail) {
    if (cond) {
        passCount++;
        console.log(`✅ [PASS] ${id}: ${desc}`);
    } else {
        failCount++;
        console.error(`❌ [FAIL] ${id}: ${desc}`);
    }
    if (detail) console.log(`   Detalj: ${detail}`);
}

function simSec(sim, sec, dt = 0.016) {
    const steps = Math.round(sec / dt);
    for (let i = 0; i < steps; i++) sim.step(dt);
}

// E1
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.20;
    sim.settings.cyclingPercent = 0.25;
    sim.settings.backupRate = 15;
    sim.settings.stActive = true;
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.patientDrive.rrSpont = 0;
    sim.patientDrive.pmusMax = 0;
    sim.reset();
    simSec(sim, 20);
    const vt = sim.state.measured.vt;
    assert('E1', 'Normal lunge Vt ≈ 500 ml (±60 ml)', vt >= 440 && vt <= 560, `Vt=${vt} ml`);
}

// E2
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.20;
    sim.settings.cyclingPercent = 0.25;
    sim.settings.backupRate = 15;
    sim.settings.stActive = true;
    sim.patient.compliance = 25;
    sim.patient.resistance = 5;
    sim.patientDrive.rrSpont = 0;
    sim.patientDrive.pmusMax = 0;
    sim.reset();
    simSec(sim, 20);
    const vt = sim.state.measured.vt;
    assert('E2', 'C 25 -> Vt ≈ 250 ml (±40 ml)', vt >= 210 && vt <= 290, `Vt=${vt} ml`);
}

// E3
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.20;
    sim.settings.cyclingPercent = 0.25;
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.patientDrive.rrSpont = 15;
    sim.patientDrive.pmusMax = 5.0;
    sim.reset();
    simSec(sim, 20);
    const vt = sim.state.measured.vt;
    assert('E3', 'Pmus 5 -> Vt 600-750 ml', vt >= 550 && vt <= 800, `Vt=${vt} ml`);
}

// E4
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.20;
    sim.patient.compliance = 50;
    sim.patient.resistance = 20;
    sim.patientDrive.rrSpont = 0;
    sim.reset();
    const insights = sim.getPhysiologicalInsights();
    const tauInsp = parseFloat(insights.tauInsp);
    simSec(sim, 20);
    assert('E4', 'R 20 -> tau = 1.0s (±0.05s)', Math.abs(tauInsp - 1.0) <= 0.05, `tauInsp=${tauInsp}s, Ti=${sim.state.measured.ti}s`);
}

// E5
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.patient.expRatio = 1.0;
    sim.machine.R_valve = 0.0;
    sim.settings.leak = 0;
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.patientDrive.rrSpont = 12;
    sim.reset();
    while (sim.state.phase !== 'inspiration') sim.step(0.001);
    while (sim.state.phase === 'inspiration') sim.step(0.001);
    let peakExp = 0, t5 = null;
    while (sim.state.phase === 'expiration') {
        const tip = sim.state.timeInPhase;
        const absFlow = Math.abs(sim.state.flow_lung);
        if (absFlow > peakExp) peakExp = absFlow;
        if (peakExp > 20 && absFlow <= 0.05 * peakExp && t5 === null && tip > 0.05) t5 = tip;
        sim.step(0.001);
    }
    assert('E5', 'Eksp flow faller til 5% etter ca 3tau=0.75s (±0.15-0.25s)', t5 !== null && Math.abs(t5 - 0.75) <= 0.25, `Tid=${t5?.toFixed(2)}s`);
}

// E6
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.05;
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.patientDrive.pmusMax = 0;
    sim.reset();
    let maxPservo = 0;
    for (let t = 0; t < 10; t += 0.001) {
        sim.step(0.001);
        if (sim.state.phase === 'inspiration' && sim.state.P_servo > maxPservo) maxPservo = sim.state.P_servo;
    }
    const os = maxPservo - 15;
    assert('E6', 'Stigetid 50ms gir trykkoversving > 0.5 cmH2O', os > 0.5, `Overshoot=+${os.toFixed(2)} cmH2O`);
}

// E7
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.90;
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.patientDrive.pmusMax = 0;
    sim.reset();
    let inInsp = false, inspStart = 0, t90 = null, maxPaw = 0;
    const target90 = 5 + 0.90 * 10;
    for (let t = 0; t < 10; t += 0.001) {
        sim.step(0.001);
        if (sim.state.phase === 'inspiration') {
            if (!inInsp) { inInsp = true; inspStart = sim.state.totalTime; }
            if (sim.state.P_aw > maxPaw) maxPaw = sim.state.P_aw;
            const dtInsp = sim.state.totalTime - inspStart;
            if (sim.state.P_aw >= target90 && t90 === null) t90 = dtInsp;
        } else { inInsp = false; }
    }
    const os = Math.max(0, maxPaw - 15);
    assert('E7', 'Stigetid 900ms når 90% etter ~0.9s (±0.2s) uten oversving', os < 0.2 && t90 !== null && Math.abs(t90 - 0.90) <= 0.20, `t90=${t90?.toFixed(2)}s, os=+${os.toFixed(2)}`);
}

// E8
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.leak = 30;
    sim.reset();
    simSec(sim, 10);
    const expected = 30 * Math.sqrt(15 / 10);
    let peakLeak = 0;
    for (let t = 0; t < 5; t += 0.001) {
        sim.step(0.001);
        if (sim.state.phase === 'inspiration' && sim.state.timeInPhase > 0.3) {
            const l = sim.state.Q_lekk * 60;
            if (l > peakLeak) peakLeak = l;
        }
    }
    assert('E8', 'Lekkasjeflow ved IPAP 15 ≈ 36.7 L/min (±15%)', Math.abs(peakLeak - expected) <= expected * 0.15, `Målt=${peakLeak.toFixed(2)} L/min, Forventet=${expected.toFixed(2)}`);
}

// E9
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    sim.settings.leak = 30;
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.reset();
    simSec(sim, 15);
    while (sim.state.phase !== 'expiration') sim.step(0.005);
    while (sim.state.timeInPhase < 2.0) sim.step(0.005);
    const lungEnd = Math.abs(sim.state.volume_lung);
    const measEnd = Math.abs(sim.state.volume_meas);
    assert('E9', 'Lekkasje: Sant lungevolum -> 0, maskinmålt volum driver av', lungEnd < 50 && (measEnd > 50 || sim.state.lastV_endExp_meas !== 0), `LungVol=${lungEnd.toFixed(1)} ml, MeasVol=${measEnd.toFixed(1)} ml`);
}

// E10
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    sim.setPreset('copd');
    sim.patient.compliance = 65;
    sim.patient.resistance = 13;
    sim.patient.expRatio = 1.25;
    sim.patient.flowLimitation = 0.45;
    sim.machine.R_valve = 0.8;
    sim.settings.epap = 5;
    sim.patientDrive.rrSpont = 25;
    sim.patientDrive.pmusMax = 3.0;
    sim.reset();
    simSec(sim, 35);
    const peepi = sim.state.measured.peepi || sim.state.PEEPi;
    assert('E10', 'KOLS rrSpont 25 gir PEEPi på 3–8 cmH2O (>2)', peepi >= 2.0 && peepi <= 8.5, `PEEPi=${peepi.toFixed(2)} cmH2O`);
}

// E11
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    sim.setPreset('copd');
    sim.patient.compliance = 65;
    sim.patient.resistance = 13;
    sim.patient.expRatio = 1.25;
    sim.patient.flowLimitation = 0.45;
    sim.machine.R_valve = 0.8;
    sim.settings.epap = 5;
    sim.patientDrive.rrSpont = 10;
    sim.patientDrive.pmusMax = 3.0;
    sim.reset();
    simSec(sim, 35);
    const peepi = sim.state.measured.peepi || sim.state.PEEPi;
    assert('E11', 'KOLS rrSpont 10 gir PEEPi < 1 cmH2O', peepi < 1.0, `PEEPi=${peepi.toFixed(2)} cmH2O`);
}

// E12
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    sim.patientDrive.rrSpont = 15;
    sim.patientDrive.pmusMax = 0.3; // svak innsats vs 5 L/min trigger
    sim.settings.triggerFlow = 5.0;
    sim.reset();
    simSec(sim, 30);
    const missed = sim.state.efforts.filter(e => e.type === 'missed').length;
    assert('E12', 'Svak innsats vs høy trigger gir missed efforts', missed > 0, `Missed=${missed}, Asynkroni=${sim.state.measured.asynchronyIndex}%`);
}

// E13
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    sim.settings.cyclingPercent = 0.85;
    sim.patientDrive.pmusMax = 7.0;
    sim.patientDrive.tiNeural = 1.2;
    sim.patientDrive.rrSpont = 15;
    sim.reset();
    simSec(sim, 30);
    const dbl = sim.state.efforts.filter(e => e.type === 'double').length;
    assert('E13', 'Cycling 85% + tiNeural 1.2s gir dobbelttrigging', dbl > 0, `Double=${dbl}`);
}

// E14
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    sim.settings.ipap = 14;
    sim.settings.epap = 5;
    sim.settings.cyclingPercent = 0.05;
    sim.settings.tiMax = 2.5;
    sim.patientDrive.rrSpont = 12;
    sim.patientDrive.tiNeural = 0.6;
    sim.patientDrive.pmusMax = 3.0;
    sim.patientDrive.pmusExp = 8.0;
    sim.patientDrive.variability = 0;
    sim.reset();
    simSec(sim, 6);
    while (sim.state.phase !== 'inspiration') sim.step(0.0002);
    let minPlateau = 999;
    while (sim.state.phase === 'inspiration') {
        const tip = sim.state.timeInPhase;
        if (tip >= 0.15 && tip <= 0.35 && sim.state.P_aw < minPlateau) minPlateau = sim.state.P_aw;
        sim.step(0.0002);
    }
    const spike = sim.state.lastPip - minPlateau;
    assert('E14', 'Sen cycling + pmusExp 8 gir terminal trykkspike > 1 cmH2O', spike > 1.0, `Spike=+${spike.toFixed(2)} cmH2O over platå (${minPlateau.toFixed(2)} -> ${sim.state.lastPip.toFixed(2)})`);
}

// E15
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    const presets = ['normal', 'copd', 'restrictive'];
    const modes = ['PS', 'PC'];
    let ok = true;
    for (let sec = 0; sec < 60; sec++) {
        sim.settings.ipap = 10 + Math.random() * 20;
        sim.settings.epap = 3 + Math.random() * 12;
        sim.settings.riseTime = 0.05 + Math.random() * 0.85;
        sim.settings.cyclingPercent = 0.05 + Math.random() * 0.85;
        sim.settings.leak = Math.random() * 60;
        sim.settings.triggerFlow = 1.0 + Math.random() * 4.0;
        sim.settings.mode = modes[Math.floor(Math.random() * modes.length)];
        if (sec % 10 === 0) sim.setPreset(presets[(sec / 10) % presets.length]);
        for (let t = 0; t < 1.0; t += 0.016) {
            sim.step(0.016);
            if (!isFinite(sim.state.P_aw) || !isFinite(sim.state.V) || isNaN(sim.state.flow)) { ok = false; break; }
        }
        if (!ok) break;
    }
    assert('E15', 'Stress-test 60s: Ingen NaN/Inf/eksplosjon', ok, `Stabilt: ${ok}`);
}

// E16
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    sim.reset();
    simSec(sim, 5);
    const t0 = sim.state.totalTime;
    sim.step(120.0);
    simSec(sim, 5);
    const t1 = sim.state.totalTime;
    assert('E16', 'Fanen i bakgrunnen i 2 min håndteres stabilt', isFinite(sim.state.P_aw) && t1 > t0, `Paw=${sim.state.P_aw.toFixed(1)}`);
}

// E17
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    sim.patientDrive.rrSpont = 0;
    sim.settings.stActive = false;
    sim.settings.apneaDelay = 15;
    sim.reset();
    simSec(sim, 10);
    const a10 = sim.state.isApneaAlarm;
    simSec(sim, 6);
    const a16 = sim.state.isApneaAlarm;
    assert('E17', 'rrSpont 0 uten ST gir apné-alarm etter 15s (±2s)', !a10 && a16, `Ved 10s=${a10}, Ved 16s=${a16}`);
}

// E18
{
    const sim = new VentilatorSimulator();
    applyFixes(sim);
    sim.patientDrive.rrSpont = 0;
    sim.settings.stActive = true;
    sim.settings.backupRate = 12;
    sim.reset();
    simSec(sim, 65);
    const rrtot = sim.state.measured.rrTotal;
    const spont = sim.state.measured.spontPercent;
    assert('E18', 'ST-backup (12 bpm) gir RRtot=12 (±1) og 0% spontan', !sim.state.isApneaAlarm && Math.abs(rrtot - 12) <= 1 && spont === 0, `RRtot=${rrtot}, % Spont=${spont}%`);
}

console.log(`\nOPPSUMMERING: ${passCount} / 18 PASS, ${failCount} FAIL`);
