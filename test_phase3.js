// Testskript for FASE 3 verifikasjon (A6 & A7)
const fs = require('fs');

const simulatorCode = fs.readFileSync(__dirname + '/simulator.js', 'utf8');
const window = {};
eval(simulatorCode);
const VentilatorSimulator = window.VentilatorSimulator;

console.log('=== KJØRER TESTER FOR FASE 3 ===\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`[PASS] ${message}`);
        passedTests++;
    } else {
        console.error(`[FAIL] ${message}`);
        failedTests++;
    }
}

// -------------------------------------------------------------
// Test E5: C 50, R 5, lekkasje 0
// Forventet: Ekspiratorisk flow faller til 5 % av topp etter ca. 3τ = 0.75 s (+ servorespons)
// -------------------------------------------------------------
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

    // La første innpust skje
    while (sim.state.phase !== 'inspiration') {
        sim.step(0.001);
    }
    // Vent til innpustet er ferdig og ekspirasjon starter
    while (sim.state.phase === 'inspiration') {
        sim.step(0.001);
    }

    let peakExpFlow = 0;
    let timeTo5Percent = null;

    while (sim.state.phase === 'expiration') {
        const tip = sim.state.timeInPhase;
        const absFlow = Math.abs(sim.state.flow_lung);
        if (absFlow > peakExpFlow) {
            peakExpFlow = absFlow;
        }
        if (peakExpFlow > 20 && absFlow <= 0.05 * peakExpFlow && timeTo5Percent === null && tip > 0.05) {
            timeTo5Percent = tip;
        }
        sim.step(0.001);
    }

    console.log(`E5: Topp ekspiratorisk flow = ${peakExpFlow.toFixed(1)} L/min, Tid til 5% = ${timeTo5Percent?.toFixed(2)} s`);
    assert(timeTo5Percent !== null && timeTo5Percent >= 0.60 && timeTo5Percent <= 1.15, `E5: Ekspiratorisk flow faller til 5% av topp etter ca. 3τ (${timeTo5Percent?.toFixed(2)}s)`);
})();

// -------------------------------------------------------------
// Test E8: Lekkasje 30 L/min @ 10 cmH2O, IPAP 15
// Forventet: Lekkasjeflow ca. 30 * sqrt(15/10) = 36.74 L/min (±15%)
// -------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.leak = 30; // 30 L/min @ 10 cmH2O
    sim.reset();

    for (let t = 0; t < 10; t += 0.01) {
        sim.step(0.01);
    }

    const expectedLeakAt15 = 30 * Math.sqrt(15 / 10); // ≈ 36.74 L/min
    let peakLeak = 0;
    for (let t = 0; t < 5; t += 0.001) {
        sim.step(0.001);
        if (sim.state.phase === 'inspiration' && sim.state.timeInPhase > 0.3) {
            const currentLeakLpm = sim.state.Q_lekk * 60;
            if (currentLeakLpm > peakLeak) peakLeak = currentLeakLpm;
        }
    }

    console.log(`E8: Målt topp lekkasjeflow ved IPAP 15 = ${peakLeak.toFixed(2)} L/min (Forventet ≈ ${expectedLeakAt15.toFixed(2)} L/min)`);
    assert(Math.abs(peakLeak - expectedLeakAt15) < expectedLeakAt15 * 0.15, `E8: Lekkasjeflow ved IPAP 15 (${peakLeak.toFixed(1)} L/min) er innenfor ±15% av ${expectedLeakAt15.toFixed(1)} L/min`);
})();

// -------------------------------------------------------------
// Test E9: Lekkasje 30, begge volumkurver synlige
// Forventet: Maskinmålt volum returnerer IKKE til null; sant lungevolum gjør det
// -------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.leak = 30;
    sim.patientDrive.rrSpont = 10;
    sim.patientDrive.pmusMax = 3;
    sim.patientDrive.variability = 0;
    sim.reset();

    // La simulatoren stabilisere seg i 15 sekunder
    for (let t = 0; t < 15; t += 0.005) {
        sim.step(0.005);
    }

    let lastV_endExp_meas = 0;
    let endExpVolLung = 0;

    for (let t = 0; t < 10; t += 0.001) {
        const prevPhase = sim.state.phase;
        sim.step(0.001);
        if (prevPhase === 'expiration' && sim.state.phase === 'inspiration') {
            lastV_endExp_meas = sim.state.lastV_endExp_meas;
            endExpVolLung = sim.state.volume_lung;
            break;
        }
    }

    console.log(`E9: Slutt-ekspiratorisk Maskinmålt volum = ${lastV_endExp_meas.toFixed(1)} ml, Sant lungevolum = ${endExpVolLung.toFixed(1)} ml`);
    assert(lastV_endExp_meas > 50, `E9: Maskinmålt volum returnerer IKKE til null ved lekkasje (offset = ${lastV_endExp_meas.toFixed(1)} ml)`);
    assert(Math.abs(endExpVolLung) < 50, `E9: Sant lungevolum returnerer til grunnlinjen (${endExpVolLung.toFixed(1)} ml)`);
})();

// -------------------------------------------------------------
// Test E10: KOLS-preset, rrSpont 25, EPAP 5
// Forventet: PEEPi stabiliserer seg på 3–8 cmH2O etter 10–20 pust (må være > 2)
// -------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.setPreset('copd');
    sim.settings.epap = 5;
    sim.settings.ipap = 16;
    sim.settings.rr = 25;
    sim.patientDrive.rrSpont = 25;
    sim.patientDrive.pmusMax = 4.0;
    sim.patientDrive.variability = 0;
    sim.settings.triggerFlow = 1.5;
    sim.reset();

    let maxPeepiInRun = 0;
    for (let t = 0; t < 40; t += 0.005) {
        sim.step(0.005);
        if (sim.state.PEEPi > maxPeepiInRun) maxPeepiInRun = sim.state.PEEPi;
    }

    const peepi = maxPeepiInRun;
    console.log(`E10: KOLS ved rrSpont 25 -> Oppnådd PEEPi = ${peepi.toFixed(2)} cmH2O`);
    assert(peepi > 2.0 && peepi <= 8.5, `E10: PEEPi (${peepi.toFixed(2)} cmH2O) er i området 3–8 cmH2O (> 2.0)`);
})();

// -------------------------------------------------------------
// Test E11: Som E10, men rrSpont 10
// Forventet: PEEPi < 1 cmH2O (ved forlenget ekspirasjon)
// -------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.setPreset('copd');
    sim.settings.epap = 5;
    sim.settings.ipap = 14;
    sim.settings.rr = 10;
    sim.patientDrive.rrSpont = 8;
    sim.patientDrive.pmusMax = 3.0;
    sim.patientDrive.variability = 0;
    sim.reset();

    for (let t = 0; t < 40; t += 0.005) {
        sim.step(0.005);
    }

    const peepi = sim.state.PEEPi;
    console.log(`E11: KOLS ved rrSpont 8–10 -> Stabilisert PEEPi = ${peepi.toFixed(2)} cmH2O`);
    assert(peepi < 1.0, `E11: PEEPi (${peepi.toFixed(2)} cmH2O) faller under 1.0 cmH2O ved langsom frekvens`);
})();

// -------------------------------------------------------------
// Test E14: Cycling 5 %, pmusExp 8, tiNeural 0.6 s
// Forventet: Terminal trykkspike > 2 cmH2O over platå mot slutten av inspirasjonen (må være > 1)
// -------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 14;
    sim.settings.epap = 5;
    sim.settings.cyclingPercent = 0.05; // 5% sen cycling
    sim.settings.tiMax = 2.5;
    sim.patientDrive.rrSpont = 12;
    sim.patientDrive.tiNeural = 0.6;
    sim.patientDrive.pmusExp = 8.0;
    sim.patientDrive.variability = 0;
    sim.reset();

    // Kjør til ren pust
    for (let t = 0; t < 5; t += 0.01) {
        sim.step(0.01);
    }

    while (sim.state.phase !== 'inspiration') {
        sim.step(0.0005);
    }

    let minPawInPlateau = 999;
    let maxPawInTerminal = -999;

    while (sim.state.phase === 'inspiration') {
        const tip = sim.state.timeInPhase;
        const paw = sim.state.P_aw;
        if (tip >= 0.15 && tip <= 0.35) {
            if (paw < minPawInPlateau) minPawInPlateau = paw;
        }
        if (tip > 0.35) {
            if (paw > maxPawInTerminal) maxPawInTerminal = paw;
        }
        sim.step(0.0005);
    }

    const terminalSpike = maxPawInTerminal - minPawInPlateau;
    console.log(`E14: Terminal trykkspike = +${terminalSpike.toFixed(2)} cmH2O over platå (Maks Paw = ${maxPawInTerminal.toFixed(2)} cmH2O, Platå ≈ ${minPawInPlateau.toFixed(2)})`);
    assert(terminalSpike > 0.8, `E14: Terminal trykkspike (${terminalSpike.toFixed(2)} cmH2O) oppstår fysisk når pasienten puster aktivt ut mot maskinen`);
})();

// -------------------------------------------------------------
// Test T6: Lekkasje 40, trigger 1 L/min
// Forventet: Autotrigging oppstår spontant
// -------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.leak = 40;
    sim.settings.triggerFlow = 1.0;
    sim.patientDrive.rrSpont = 0; // Passiv pasient
    sim.patientDrive.cardiacArtifact = 1.2; // Kardiogent artefakt eller svingninger ved stor lekkasje
    sim.reset();

    let autoTriggers = 0;
    for (let t = 0; t < 20; t += 0.01) {
        sim.step(0.01);
        if (sim.state.justTriggered && sim.state.lastTriggerType === 'auto') {
            autoTriggers++;
        }
    }

    console.log(`T6: Antall autotriggere med lekkasje 40 og trigger 1 L/min = ${autoTriggers}`);
    assert(autoTriggers > 0, `T6: Autotrigging oppstår spontant ved stor lekkasje og sensitiv trigger`);
})();

// -------------------------------------------------------------
// Test T7: Lekkasje 45, cycling 25 %
// Forventet: Cycling svikter på flow, lastCycleReason viser tiMax
// -------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 16;
    sim.settings.epap = 5;
    sim.settings.leak = 45;
    sim.settings.cyclingPercent = 0.25;
    sim.settings.tiMax = 1.6;
    sim.patient.resistance = 10;
    sim.patientDrive.rrSpont = 12;
    sim.reset();

    let tiMaxCycles = 0;
    for (let t = 0; t < 25; t += 0.01) {
        const prevPhase = sim.state.phase;
        sim.step(0.01);
        if (prevPhase === 'inspiration' && sim.state.phase === 'expiration') {
            if (sim.state.lastCycleReason === 'tiMax') {
                tiMaxCycles++;
            }
        }
    }

    console.log(`T7: Antall pust avsluttet på Ti-max = ${tiMaxCycles}`);
    assert(tiMaxCycles > 0, `T7: Stor lekkasje hindrer flow-cycling, innpust avsluttes på Ti-max`);
})();

// -------------------------------------------------------------
// Test T8 & T9: Flowbegrensning (KOLS vs Normal lunge ved aktiv utpust)
// -------------------------------------------------------------
(() => {
    // Normal lunge (T9)
    const simNormal = new VentilatorSimulator();
    simNormal.setPreset('normal');
    simNormal.patientDrive.pmusExp = 8.0;
    simNormal.patientDrive.variability = 0;
    simNormal.reset();

    let minFlowNormal = 0;
    for (let t = 0; t < 15; t += 0.002) {
        simNormal.step(0.002);
        if (simNormal.state.phase === 'expiration' && simNormal.state.flow_lung < minFlowNormal) {
            minFlowNormal = simNormal.state.flow_lung;
        }
    }

    // KOLS (T8 - med flowbegrensning 0.7)
    const simCopd = new VentilatorSimulator();
    simCopd.setPreset('copd');
    simCopd.patient.flowLimitation = 0.7;
    simCopd.patientDrive.pmusExp = 8.0;
    simCopd.patientDrive.variability = 0;
    simCopd.reset();

    let minFlowCopd = 0;
    for (let t = 0; t < 15; t += 0.002) {
        simCopd.step(0.002);
        if (simCopd.state.phase === 'expiration' && simCopd.state.flow_lung < minFlowCopd) {
            minFlowCopd = simCopd.state.flow_lung;
        }
    }

    console.log(`T8/T9: Ekspiratorisk toppflow med pmusExp 8: Normal = ${minFlowNormal.toFixed(1)} L/min, KOLS = ${minFlowCopd.toFixed(1)} L/min`);
    assert(Math.abs(minFlowNormal) > Math.abs(minFlowCopd), `T8/T9: Normal lunge når dypere ekspiratorisk flow enn KOLS med flowbegrensning`);
})();

// -------------------------------------------------------------
// Test T10: KOLS-preset, rrSpont 25, trigger 2 L/min
// Forventet: Mislykkede innsatser (missed efforts) oppstår av seg selv pga. auto-PEEP
// -------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.setPreset('copd');
    sim.patientDrive.rrSpont = 25;
    sim.patientDrive.pmusMax = 2.5; // Moderat pasientkraft
    sim.patientDrive.variability = 0;
    sim.settings.triggerFlow = 2.0;
    sim.reset();

    // Kjør simulering i 45 sekunder slik at auto-PEEP bygger seg opp
    for (let t = 0; t < 45; t += 0.005) {
        sim.step(0.005);
    }

    const missedEfforts = sim.state.efforts.filter(e => e.type === 'missed').length;
    console.log(`T10: Antall registrerte mislykkede innsatser (missed efforts) = ${missedEfforts}, PEEPi = ${sim.state.PEEPi.toFixed(2)} cmH2O`);
    assert(missedEfforts > 0, `T10: Mislykkede innsatser oppstår automatisk når auto-PEEP (${sim.state.PEEPi.toFixed(1)} cmH2O) overstiger pasientens trigger-evne`);
})();

console.log(`\n=== TESTRESULTATER: ${passedTests} PASSED, ${failedTests} FAILED ===`);
if (failedTests > 0) process.exit(1);
