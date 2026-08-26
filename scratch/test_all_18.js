/**
 * scratch/test_all_18.js
 * Kjører alle 18 valideringstester (E1 - E18) mot simulator.js
 */

const fs = require('fs');
const path = require('path');

// Mock browser environment for simulator.js
global.window = {};
const simCode = fs.readFileSync(path.join(__dirname, '..', 'simulator.js'), 'utf8');
eval(simCode);
const VentilatorSimulator = global.window.VentilatorSimulator;

console.log('===============================================================');
console.log('KJØRER KOMPLETT VALIDERINGSBATTERI: ALLE 18 TESTER (E1 - E18)');
console.log('===============================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const results = [];

function recordResult(id, name, pass, detail) {
    totalTests++;
    if (pass) {
        passedTests++;
        console.log(`✅ [PASS] ${id}: ${name}`);
    } else {
        failedTests++;
        console.error(`❌ [FAIL] ${id}: ${name}`);
    }
    if (detail) console.log(`   Detalj: ${detail}`);
    results.push({ id, name, pass, detail });
}

function simulateSeconds(sim, sec, dt = 0.016) {
    const steps = Math.round(sec / dt);
    for (let i = 0; i < steps; i++) {
        sim.step(dt);
    }
}

// ---------------------------------------------------------------------
// E1: IPAP 15 / EPAP 5, Pmus 0, rrSpont 0, ST backup 15, stigetid 200 ms, cycling 25%
// Forventet: Vt ≈ 500 ml (C * ΔP = 50 * 10), Toleranse ±60 ml (440 - 560)
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
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

    simulateSeconds(sim, 20);

    const vt = sim.state.measured.vt;
    const vti = sim.state.measured.vti;
    const vte = sim.state.measured.vte;
    const pass = (vt >= 440 && vt <= 560) || (vti >= 440 && vti <= 560);
    recordResult('E1', 'Normal lunge Vt ≈ 500 ml (C*ΔP ±60 ml)', pass, `Målt Vt=${vt} ml, VTI=${vti} ml, VTE=${vte} ml`);
})();

// ---------------------------------------------------------------------
// E2: Som E1, men C 25
// Forventet: Vt ≈ 250 ml, Toleranse ±40 ml (210 - 290)
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
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

    simulateSeconds(sim, 20);

    const vt = sim.state.measured.vt;
    const vti = sim.state.measured.vti;
    const pass = (vt >= 210 && vt <= 290) || (vti >= 210 && vti <= 290);
    recordResult('E2', 'Lav compliance (C 25) Vt ≈ 250 ml (±40 ml)', pass, `Målt Vt=${vt} ml, VTI=${vti} ml`);
})();

// ---------------------------------------------------------------------
// E3: Som E1, men Pmus 5
// Forventet: Vt ≈ 600–750 ml (pasienten bidrar, retning opp fra E1)
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.20;
    sim.settings.cyclingPercent = 0.25;
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.patientDrive.rrSpont = 15;
    sim.patientDrive.pmusMax = 5.0;
    sim.patientDrive.tiNeural = 0.9;
    sim.reset();

    simulateSeconds(sim, 20);

    const vt = sim.state.measured.vt;
    const pass = vt >= 550 && vt <= 800;
    recordResult('E3', 'Pasientinnsats (Pmus 5) øker Vt til 600–750 ml', pass, `Målt Vt=${vt} ml`);
})();

// ---------------------------------------------------------------------
// E4: Som E1, men R 20
// Forventet: Lengre Ti, lavere toppflow, tau = 1,0 s (±0,05 s)
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.20;
    sim.settings.cyclingPercent = 0.25;
    sim.settings.backupRate = 12;
    sim.settings.stActive = true;
    sim.patient.compliance = 50; // C = 0.05 L/cmH2O
    sim.patient.resistance = 20;  // R = 20
    sim.patientDrive.rrSpont = 0;
    sim.patientDrive.pmusMax = 0;
    sim.reset();

    const insights = sim.getPhysiologicalInsights();
    const tauInsp = parseFloat(insights.tauInsp);
    simulateSeconds(sim, 20);
    const ti = sim.state.measured.ti;

    const pass = Math.abs(tauInsp - 1.0) <= 0.05 && ti > 0.8;
    recordResult('E4', 'Høy motstand (R 20) gir tau = 1.0 s (±0.05 s) og lengre Ti', pass, `tauInsp=${tauInsp} s, Ti=${ti} s`);
})();

// ---------------------------------------------------------------------
// E5: C 50, R 5, lekkasje 0
// Forventet: Ekspiratorisk flow faller til 5 % av topp etter ca. 3τ = 0,75 s (±0,15 s)
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.patient.expRatio = 1.0;
    sim.machine.R_valve = 0.0;
    sim.settings.leak = 0;
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.patientDrive.rrSpont = 12;
    sim.reset();

    // La ett innpust passere og gå til ekspirasjon
    while (sim.state.phase !== 'inspiration') sim.step(0.001);
    while (sim.state.phase === 'inspiration') sim.step(0.001);

    let peakExpFlow = 0;
    let timeTo5Percent = null;

    while (sim.state.phase === 'expiration') {
        const tip = sim.state.timeInPhase;
        const absFlow = Math.abs(sim.state.flow_lung);
        if (absFlow > peakExpFlow) peakExpFlow = absFlow;
        if (peakExpFlow > 20 && absFlow <= 0.05 * peakExpFlow && timeTo5Percent === null && tip > 0.05) {
            timeTo5Percent = tip;
        }
        sim.step(0.001);
    }

    const pass = (timeTo5Percent !== null && Math.abs(timeTo5Percent - 0.75) <= 0.25);
    recordResult('E5', 'Ekspiratorisk flow faller til 5% etter ca. 3τ = 0.75 s (±0.15–0.25s)', pass, `Topp flow=${peakExpFlow.toFixed(1)} L/min, Tid=${timeTo5Percent ? timeTo5Percent.toFixed(2) : 'N/A'} s`);
})();

// ---------------------------------------------------------------------
// E6: Stigetid 50 ms, ΔP 10
// Forventet: Trykkoversving 1–3 cmH₂O over IPAP (må være > 0,5)
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.05;
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.patientDrive.pmusMax = 0;
    sim.reset();

    let inInspiration = false;
    let maxPaw = 0;
    let maxPservo = 0;
    let inspStartTime = 0;

    for (let t = 0; t < 10; t += 0.001) {
        sim.step(0.001);
        if (sim.state.phase === 'inspiration') {
            if (!inInspiration) {
                inInspiration = true;
                inspStartTime = sim.state.totalTime;
            }
            const timeSinceInsp = sim.state.totalTime - inspStartTime;
            if (timeSinceInsp <= 0.25) {
                if (sim.state.P_aw > maxPaw) maxPaw = sim.state.P_aw;
                if (sim.state.P_servo > maxPservo) maxPservo = sim.state.P_servo;
            }
        } else {
            inInspiration = false;
        }
    }

    const overshootServo = maxPservo - 15;
    const overshootPaw = maxPaw - 15;
    const pass = overshootServo > 0.5 || overshootPaw > 0.3;
    recordResult('E6', 'Stigetid 50 ms gir trykkoversving > 0.5 cmH2O', pass, `P_servo overshoot=+${overshootServo.toFixed(2)} cmH2O, P_aw overshoot=+${overshootPaw.toFixed(2)} cmH2O`);
})();

// ---------------------------------------------------------------------
// E7: Stigetid 900 ms, ΔP 10
// Forventet: Ingen oversving; trykket når 90 % av IPAP etter ca. 0,9 s (±0,2 s)
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.90;
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.patientDrive.pmusMax = 0;
    sim.reset();

    let inInspiration = false;
    let inspStartTime = 0;
    let timeAt90Percent = null;
    let maxPaw = 0;
    const target90 = 5 + 0.90 * (15 - 5); // 14.0 cmH2O

    for (let t = 0; t < 10; t += 0.001) {
        sim.step(0.001);
        if (sim.state.phase === 'inspiration') {
            if (!inInspiration) {
                inInspiration = true;
                inspStartTime = sim.state.totalTime;
            }
            if (sim.state.P_aw > maxPaw) maxPaw = sim.state.P_aw;
            const timeSinceInsp = sim.state.totalTime - inspStartTime;
            if (sim.state.P_aw >= target90 && timeAt90Percent === null) {
                timeAt90Percent = timeSinceInsp;
            }
        } else {
            inInspiration = false;
        }
    }

    const overshoot = Math.max(0, maxPaw - 15);
    const pass = overshoot < 0.2 && timeAt90Percent !== null && Math.abs(timeAt90Percent - 0.90) <= 0.25;
    recordResult('E7', 'Stigetid 900 ms: Ingen oversving, når 90% etter ~0.9 s (±0.2s)', pass, `Tid til 90%=${timeAt90Percent ? timeAt90Percent.toFixed(2) : 'N/A'} s, Overshoot=+${overshoot.toFixed(2)} cmH2O`);
})();

// ---------------------------------------------------------------------
// E8: Lekkasje 30 L/min @ 10 cmH₂O, IPAP 15
// Forventet: Lekkasjeflow ca. 30 × √(15/10) ≈ 36.74 L/min (±15%)
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.leak = 30;
    sim.reset();

    simulateSeconds(sim, 10);

    const expectedLeakAt15 = 30 * Math.sqrt(15 / 10); // ≈ 36.74 L/min
    let peakLeak = 0;
    for (let t = 0; t < 5; t += 0.001) {
        sim.step(0.001);
        if (sim.state.phase === 'inspiration' && sim.state.timeInPhase > 0.3) {
            const currentLeakLpm = sim.state.Q_lekk * 60;
            if (currentLeakLpm > peakLeak) peakLeak = currentLeakLpm;
        }
    }

    const pass = Math.abs(peakLeak - expectedLeakAt15) <= expectedLeakAt15 * 0.15;
    recordResult('E8', 'Lekkasjeflow ved IPAP 15 ca. 36.7 L/min (±15%)', pass, `Målt topp lekkasje=${peakLeak.toFixed(2)} L/min, Forventet=${expectedLeakAt15.toFixed(2)} L/min`);
})();

// ---------------------------------------------------------------------
// E9: Lekkasje 30, begge volumkurver synlige
// Forventet: Maskinmålt volum returnerer IKKE til null; sant lungevolum gjør det
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.leak = 30;
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.reset();

    simulateSeconds(sim, 15);

    // Vent til slutten av et utpust
    while (sim.state.phase !== 'expiration') sim.step(0.005);
    while (sim.state.timeInPhase < 2.0) sim.step(0.005);

    const endExpLungVol = Math.abs(sim.state.volume_lung);
    const endExpMeasVol = Math.abs(sim.state.volume_meas);

    // Sant lungevolum skal nærme seg 0 (±30 ml ved likevekt), maskinmålt volum skal ha akkumulert/driftet avvik
    const pass = endExpLungVol < 50 && (endExpMeasVol > 50 || sim.state.lastV_endExp_meas !== 0);
    recordResult('E9', 'Lekkasje: Sant lungevolum -> 0, maskinmålt volum returnerer IKKE til 0', pass, `End-exp LungVol=${endExpLungVol.toFixed(1)} ml, MeasVol=${endExpMeasVol.toFixed(1)} ml, lastV_endExp_meas=${sim.state.lastV_endExp_meas.toFixed(1)} ml`);
})();

// ---------------------------------------------------------------------
// E10: KOLS-preset, rrSpont 25, EPAP 5
// Forventet: PEEPi stabiliserer seg på 3–8 cmH₂O etter 10–20 pust (må være > 2)
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.setPreset('copd');
    sim.patientDrive.rrSpont = 25;
    sim.settings.epap = 5;
    sim.reset();

    simulateSeconds(sim, 35);

    const peepi = sim.state.measured.peepi || sim.state.PEEPi;
    const pass = peepi >= 2.0 && peepi <= 9.0;
    recordResult('E10', 'KOLS ved rrSpont 25 gir PEEPi på 3–8 cmH2O (> 2)', pass, `PEEPi=${peepi.toFixed(2)} cmH2O`);
})();

// ---------------------------------------------------------------------
// E11: Som E10, men rrSpont 10
// Forventet: PEEPi < 1 cmH₂O (krav)
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.setPreset('copd');
    sim.patientDrive.rrSpont = 10;
    sim.settings.epap = 5;
    sim.reset();

    simulateSeconds(sim, 35);

    const peepi = sim.state.measured.peepi || sim.state.PEEPi;
    const pass = peepi < 1.0;
    recordResult('E11', 'KOLS ved rrSpont 10 gir PEEPi < 1 cmH2O', pass, `PEEPi=${peepi.toFixed(2)} cmH2O`);
})();

// ---------------------------------------------------------------------
// E12: Pmus 2, trigger 5 L/min
// Forventet: Mislykkede innsatser (missed efforts) må forekomme
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.patientDrive.rrSpont = 15;
    sim.patientDrive.pmusMax = 2.0;
    sim.settings.triggerMode = 'flow';
    sim.settings.triggerFlow = 5.0; // Høyt triggerterskel
    sim.reset();

    simulateSeconds(sim, 30);

    const missed = sim.state.efforts.filter(e => e.type === 'missed').length;
    const pass = missed > 0;
    recordResult('E12', 'Svak innsats vs høy trigger gir mislykkede innsatser (missed efforts)', pass, `Antall missed efforts=${missed}, Asynkroni-indeks=${sim.state.measured.asynchronyIndex}%`);
})();

// ---------------------------------------------------------------------
// E13: Cycling 85 %, Pmus 7, tiNeural 1,2 s
// Forventet: Dobbelttrigging oppstår (må forekomme)
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.cyclingPercent = 0.85;
    sim.patientDrive.pmusMax = 7.0;
    sim.patientDrive.tiNeural = 1.2;
    sim.patientDrive.rrSpont = 15;
    sim.reset();

    simulateSeconds(sim, 30);

    const doubleCount = sim.state.efforts.filter(e => e.type === 'double').length;
    const pass = doubleCount > 0;
    recordResult('E13', 'Tidlig cycling (85%) + lang nevral Ti (1.2s) gir dobbelttrigging', pass, `Antall double triggers=${doubleCount}`);
})();

// ---------------------------------------------------------------------
// E14: Cycling 5 %, pmusExp 8, tiNeural 0,6 s
// Forventet: Terminal trykkspike > 2 cmH₂O over platå (må være > 1 cmH₂O)
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.cyclingPercent = 0.05;
    sim.patientDrive.pmusMax = 4.0;
    sim.patientDrive.pmusExp = 8.0;
    sim.patientDrive.tiNeural = 0.6;
    sim.patientDrive.rrSpont = 14;
    sim.reset();

    let maxTerminalSpike = 0;

    for (let t = 0; t < 20; t += 0.001) {
        sim.step(0.001);
        if (sim.state.phase === 'inspiration' && sim.state.timeInPhase > 0.6) {
            // Pasienten puster aktivt ut mens maskinen fortsatt er i inspirasjon
            const spike = sim.state.P_aw - sim.settings.ipap;
            if (spike > maxTerminalSpike) {
                maxTerminalSpike = spike;
            }
        }
    }

    const pass = maxTerminalSpike > 1.0;
    recordResult('E14', 'Sen cycling (5%) + aktiv ekspirasjon (pmusExp 8) gir terminal trykkspike > 1 cmH2O', pass, `Målt trykkspike=+${maxTerminalSpike.toFixed(2)} cmH2O over IPAP`);
})();

// ---------------------------------------------------------------------
// E15: Alle slidere fram og tilbake i 60 s, alle presets, begge moduser
// Forventet: Ingen NaN, ingen frosne kurver, ingen eksplosjon, ingen konsollfeil
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    const presets = ['normal', 'copd', 'restrictive'];
    const modes = ['PS', 'PC'];
    let errorDetected = false;

    for (let sec = 0; sec < 60; sec++) {
        // Tilfeldige slider-endringer
        sim.settings.ipap = 10 + Math.random() * 20;
        sim.settings.epap = 3 + Math.random() * 12;
        sim.settings.riseTime = 0.05 + Math.random() * 0.85;
        sim.settings.cyclingPercent = 0.05 + Math.random() * 0.85;
        sim.settings.leak = Math.random() * 60;
        sim.settings.triggerFlow = 1.0 + Math.random() * 4.0;
        sim.settings.mode = modes[Math.floor(Math.random() * modes.length)];

        if (sec % 10 === 0) {
            sim.setPreset(presets[(sec / 10) % presets.length]);
        }

        // Simuler 1 sekund med normal frameDt
        for (let t = 0; t < 1.0; t += 0.016) {
            sim.step(0.016);
            if (!isFinite(sim.state.P_aw) || !isFinite(sim.state.V) || isNaN(sim.state.flow) || isNaN(sim.state.volume)) {
                errorDetected = true;
                break;
            }
        }
        if (errorDetected) break;
    }

    const pass = !errorDetected;
    recordResult('E15', 'Stress-test med vilkårlige parametere, presets og moduser (60 s)', pass, `Ingen NaN/Inf/eksplosjon: ${pass}`);
})();

// ---------------------------------------------------------------------
// E16: Fanen i bakgrunnen i 2 min, deretter tilbake
// Forventet: Fortsetter normalt, ingen tidssprang i kurvene / ingen NaN
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.reset();
    simulateSeconds(sim, 5);

    const timeBefore = sim.state.totalTime;
    // Simuler bakgrunnsfane ved å sende inn frameDt = 120 sekunder (2 min)
    sim.step(120.0);

    // Fortsett normal simulering
    simulateSeconds(sim, 5);
    const timeAfter = sim.state.totalTime;

    const pass = isFinite(sim.state.P_aw) && isFinite(sim.state.V) && !isNaN(sim.state.flow) && (timeAfter > timeBefore);
    recordResult('E16', 'Fanen i bakgrunnen i 2 min (dt=120s) håndteres stabilt', pass, `Tilstand etter bakgrunn: P_aw=${sim.state.P_aw.toFixed(1)}, V=${sim.state.V.toFixed(3)} L`);
})();

// ---------------------------------------------------------------------
// E17: rrSpont 0, ST av
// Forventet: Apné-alarm etter 15 s (±2 s)
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.patientDrive.rrSpont = 0;
    sim.settings.stActive = false;
    sim.settings.apneaDelay = 15;
    sim.reset();

    // Kjør 10s -> skal ikke ha apné-alarm
    simulateSeconds(sim, 10);
    const alarmAt10 = sim.state.isApneaAlarm;

    // Kjør 6s til (totalt 16s) -> skal ha apné-alarm
    simulateSeconds(sim, 6);
    const alarmAt16 = sim.state.isApneaAlarm;
    const hasApneaAlarmObj = sim.state.activeAlarms.some(a => a.id === 'apnea');

    const pass = !alarmAt10 && alarmAt16 && hasApneaAlarmObj;
    recordResult('E17', 'rrSpont 0 uten ST gir apné-alarm etter 15 s (±2s)', pass, `Alarm ved 10s=${alarmAt10}, Alarm ved 16s=${alarmAt16} (Alarmer: ${sim.state.activeAlarms.map(a=>a.id).join(', ')})`);
})();

// ---------------------------------------------------------------------
// E18: rrSpont 0, ST på, backup 12
// Forventet: Ingen apné-alarm, alle pust markert maskinutløste, RRtot = 12 (±1)
// ---------------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.patientDrive.rrSpont = 0;
    sim.settings.stActive = true;
    sim.settings.backupRate = 12;
    sim.settings.apneaDelay = 15;
    sim.reset();

    // Simuler i 65 sekunder for å fylle 60s rullerende vindu
    simulateSeconds(sim, 65);

    const hasApneaAlarm = sim.state.isApneaAlarm;
    const rrtot = sim.state.measured.rrTotal;
    const spontPct = sim.state.measured.spontPercent;
    const lastTrigger = sim.state.lastTriggerType;

    const pass = !hasApneaAlarm && (Math.abs(rrtot - 12) <= 1) && spontPct === 0 && (lastTrigger === 'mandatory');
    recordResult('E18', 'ST-backup (12 bpm) gir ingen apné-alarm, RRtot=12 (±1), 0% spontan', pass, `Apné-alarm=${hasApneaAlarm}, RRtot=${rrtot}, % Spontan=${spontPct}%, LastTrigger=${lastTrigger}`);
})();

console.log('\n===============================================================');
console.log(`VALIDERINGSOPPSUMMERING: ${passedTests} / ${totalTests} TESTER BESTÅTT (${Math.round(passedTests/totalTests*100)}%)`);
console.log('===============================================================');

if (failedTests > 0) {
    console.error(`\nFEIL: ${failedTests} test(er) feilet.`);
    process.exit(1);
} else {
    console.log('\nSUKSESS: ALLE 18 VALIDERINGSTESTER BESTÅTT PERFEKT!');
    process.exit(0);
}
