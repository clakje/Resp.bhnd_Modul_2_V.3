// Testskript for FASE 1 verifikasjon
const fs = require('fs');

const simulatorCode = fs.readFileSync(__dirname + '/simulator.js', 'utf8');
const window = {};
eval(simulatorCode);
const VentilatorSimulator = window.VentilatorSimulator;

console.log('=== KJØRER TESTER FOR FASE 1 ===\n');

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
// Test E1: IPAP 15 / EPAP 5, Pmus 0, stigetid 200 ms, cycling 25 %
// Fysisk modell: Vt ≈ 400–500 ml (med 25% flow-cycling leveres ~390–450 ml før cycling)
// -------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.20;
    sim.settings.cyclingPercent = 0.25;
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.patient.pmusMax = 0;
    sim.reset();

    // Simuler i 10 sekunder
    for (let t = 0; t < 10; t += 0.016) {
        sim.step(0.016);
    }

    const vt = sim.state.measured.vt;
    console.log(`E1: Målt Vt = ${vt} ml`);
    assert(vt >= 350 && vt <= 560, `E1: Vt (${vt} ml) er i fysiologisk forventet område`);
})();

// -------------------------------------------------------------
// Test E2: Som E1, men C 25
// Forventet: Vt ≈ 200-290 ml
// -------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.20;
    sim.settings.cyclingPercent = 0.25;
    sim.patient.compliance = 25;
    sim.patient.resistance = 5;
    sim.patient.pmusMax = 0;
    sim.reset();

    for (let t = 0; t < 10; t += 0.016) {
        sim.step(0.016);
    }

    const vt = sim.state.measured.vt;
    console.log(`E2: Målt Vt = ${vt} ml`);
    assert(vt >= 190 && vt <= 290, `E2: Vt (${vt} ml) er innenfor forventet område`);
})();

// -------------------------------------------------------------
// Test E6: Stigetid 50 ms, ΔP 10
// Forventet: P_servo oversvinger med 2.3 cmH2O (>15-20%), P_aw med ~0.5 cmH2O
// -------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.05;
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.patient.pmusMax = 0;
    sim.reset();

    let inInspiration = false;
    let maxPservo = 0;
    let maxPaw = 0;
    let inspStartTime = 0;

    for (let t = 0; t < 10; t += 0.001) {
        sim.step(0.001);
        if (sim.state.phase === 'inspiration') {
            if (!inInspiration) {
                inInspiration = true;
                inspStartTime = sim.state.totalTime;
            }
            const timeSinceInsp = sim.state.totalTime - inspStartTime;
            if (timeSinceInsp <= 0.15) {
                if (sim.state.P_servo > maxPservo) maxPservo = sim.state.P_servo;
                if (sim.state.P_aw > maxPaw) maxPaw = sim.state.P_aw;
            }
        } else if (inInspiration) {
            break;
        }
    }

    const servoOvershoot = maxPservo - sim.settings.ipap;
    const pawOvershoot = maxPaw - sim.settings.ipap;
    console.log(`E6: P_servo oversving = +${servoOvershoot.toFixed(2)} cmH2O, P_aw oversving = +${pawOvershoot.toFixed(2)} cmH2O`);
    assert(servoOvershoot >= 1.5 && servoOvershoot <= 3.5, `E6: Servo-oversving (${servoOvershoot.toFixed(2)} cmH2O) er 15-30% av ΔP`);
    assert(pawOvershoot >= 0.40, `E6: P_aw trykkoversving (${pawOvershoot.toFixed(2)} cmH2O) er tydelig til stede`);
})();

// -------------------------------------------------------------
// Test E7: Stigetid 900 ms, ΔP 10
// Forventet: Ingen oversving; trykket når 90 % av IPAP etter ca. 0,9–1.3 s
// -------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.90;
    sim.settings.rr = 10;
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.patient.pmusMax = 0;
    sim.reset();

    let inInspiration = false;
    let inspStartTime = 0;
    let maxPaw = 0;
    let timeReached90 = null;
    const target90 = sim.settings.epap + 0.90 * (sim.settings.ipap - sim.settings.epap);

    for (let t = 0; t < 15; t += 0.001) {
        sim.step(0.001);
        if (sim.state.phase === 'inspiration') {
            if (!inInspiration) {
                inInspiration = true;
                inspStartTime = sim.state.totalTime;
            }
            const timeSinceInsp = sim.state.totalTime - inspStartTime;
            if (sim.state.P_aw > maxPaw) {
                maxPaw = sim.state.P_aw;
            }
            if (sim.state.P_aw >= target90 && timeReached90 === null) {
                timeReached90 = timeSinceInsp;
            }
        } else if (inInspiration) {
            break;
        }
    }

    const overshoot = Math.max(0, maxPaw - sim.settings.ipap);
    console.log(`E7: Maks Paw = ${maxPaw.toFixed(2)}, Oversving = ${overshoot.toFixed(2)}, Tid til 90% = ${timeReached90?.toFixed(2)} s`);
    assert(overshoot < 0.1, `E7: Ingen oversving ved lang stigetid (${overshoot.toFixed(2)} cmH2O)`);
    assert(timeReached90 !== null && timeReached90 >= 0.8 && timeReached90 <= 1.4, `E7: Myk stigning uten oversving (${timeReached90?.toFixed(2)} s)`);
})();

// -------------------------------------------------------------
// Test E15: Stress-test med alle presets og tilfeldige slidere
// -------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    let hasNaN = false;
    const presets = ['normal', 'copd', 'restrictive'];

    for (let i = 0; i < 60; i++) {
        sim.setPreset(presets[i % presets.length]);
        sim.settings.ipap = 10 + Math.random() * 20;
        sim.settings.epap = 3 + Math.random() * (sim.settings.ipap - 5);
        sim.settings.rr = 8 + Math.random() * 25;
        sim.settings.riseTime = 0.05 + Math.random() * 0.85;
        sim.settings.cyclingPercent = 0.10 + Math.random() * 0.40;
        sim.patient.pmusMax = Math.random() * 8;

        for (let frame = 0; frame < 60; frame++) {
            sim.step(0.016);
            if (isNaN(sim.state.P_aw) || isNaN(sim.state.V) || isNaN(sim.state.Q_total)) {
                hasNaN = true;
            }
        }
    }

    assert(!hasNaN, 'E15: Ingen NaN eller numerisk kollaps under stress-test');
})();

// -------------------------------------------------------------
// Test E16: Fanen i bakgrunnen i 2 min
// -------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.step(0.016);
    sim.step(120.0); // 2 minutter tidsgap
    sim.step(0.016);

    assert(isFinite(sim.state.P_aw) && isFinite(sim.state.V), 'E16: Fortsetter normalt etter 2 min i bakgrunnen');
})();

// -------------------------------------------------------------
// Kvalitativ 1: Skulderen (Pmus 8 cmH2O, riseTime 800 ms)
// -------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.80;
    sim.patient.pmusMax = 8;
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.reset();

    let foundDip = false;
    for (let t = 0; t < 10; t += 0.002) {
        sim.step(0.002);
        if (sim.state.phase === 'inspiration' && sim.state.P_mus > 2.0) {
            if (sim.state.P_aw < sim.state.P_servo - 0.2) {
                foundDip = true;
            }
        }
    }
    assert(foundDip, 'Kvalitativ 1 (Skulder): P_aw dipper under P_servo når pasienten drar kraftig (Pmus 8)');
})();

// -------------------------------------------------------------
// Kvalitativ 2: Luftfanging (KOLS-preset, RR 25 -> RR 10)
// -------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.setPreset('copd');
    sim.settings.epap = 5;
    sim.settings.ipap = 16;
    sim.settings.rr = 25;
    sim.reset();

    let initialMinVol = null;
    let endMinVol = null;

    for (let t = 0; t < 30; t += 0.01) {
        sim.step(0.01);
        if (t > 2 && t < 5) {
            if (initialMinVol === null || sim.state.volume < initialMinVol) {
                initialMinVol = sim.state.volume;
            }
        }
        if (t > 25) {
            if (endMinVol === null || sim.state.volume < endMinVol) {
                endMinVol = sim.state.volume;
            }
        }
    }

    console.log(`KOLS luftfanging: Initial min = ${initialMinVol?.toFixed(1)} ml, etter 25s = ${endMinVol?.toFixed(1)} ml, PEEPi = ${sim.state.PEEPi?.toFixed(2)} cmH2O`);
    assert(endMinVol > initialMinVol + 30, 'Kvalitativ 2 (Luftfanging): Volumkurvens bunnpunkt kryper oppover ved RR 25');
    assert(sim.state.PEEPi > 0.5, `Kvalitativ 2 (Auto-PEEP): PEEPi (${sim.state.PEEPi.toFixed(2)} cmH2O) oppstår`);

    // Sett RR ned til 10
    sim.settings.rr = 10;
    for (let t = 0; t < 30; t += 0.01) {
        sim.step(0.01);
    }
    console.log(`Etter reduksjon til RR 10: PEEPi = ${sim.state.PEEPi.toFixed(2)} cmH2O`);
    assert(sim.state.PEEPi < 0.35, 'Kvalitativ 2 (Tømming): PEEPi faller markant tilbake mot 0 når frekvensen senkes til RR 10');
})();

// -------------------------------------------------------------
// Kvalitativ 3: Kontinuitet ved slider-endring midt i innpust
// -------------------------------------------------------------
(() => {
    const sim = new VentilatorSimulator();
    sim.reset();
    let maxJump = 0;
    let prevPaw = sim.state.P_aw;

    for (let t = 0; t < 5; t += 0.001) {
        if (t > 1.5 && t < 1.505) {
            sim.settings.ipap = 24; // Endre IPAP midt i pust
        }
        sim.step(0.001);
        const jump = Math.abs(sim.state.P_aw - prevPaw);
        if (jump > maxJump) maxJump = jump;
        prevPaw = sim.state.P_aw;
    }

    console.log(`Maksimalt P_aw sprang per 1ms = ${maxJump.toFixed(4)} cmH2O`);
    assert(maxJump < 0.5, 'Kvalitativ 3 (Kontinuitet): Kurven forblir kontinuerlig uten diskontinuerlige sprang');
})();

console.log(`\n=== TESTRESULTATER: ${passedTests} PASSED, ${failedTests} FAILED ===`);
if (failedTests > 0) process.exit(1);
