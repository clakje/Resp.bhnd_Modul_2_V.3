const fs = require('fs');
const vm = require('vm');

let simCode = fs.readFileSync('simulator.js', 'utf8');

// Function to test modified simulator code against all requirements
function testModified(code) {
    const sandbox = { window: {}, console: console, Math: Math, setTimeout: setTimeout, clearTimeout: clearTimeout };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    const VentilatorSimulator = sandbox.window.VentilatorSimulator;

    console.log('=== TEST: Slow Rise Scenario (800ms, Pmus 8) ===');
    const simSlow = new VentilatorSimulator();
    simSlow.settings.mode = 'PS';
    simSlow.settings.ipap = 14;
    simSlow.settings.epap = 5;
    simSlow.settings.riseTime = 0.80; // 800 ms
    simSlow.settings.cyclingPercent = 0.25;
    simSlow.settings.leak = 5;
    simSlow.patientDrive.rrSpont = 14;
    simSlow.patientDrive.pmusMax = 8.0;
    simSlow.patientDrive.tiNeural = 0.9;
    simSlow.patientDrive.variability = 0;
    simSlow.patient.compliance = 50;
    simSlow.patient.resistance = 5;
    simSlow.reset();

    let minPaw = 999;
    let minPawTime = 0;
    let inInsp = false;
    let inspRecords = [];
    for (let i = 0; i < 5000; i++) {
        simSlow.step(0.001);
        if (simSlow.state.phase === 'inspiration') {
            if (!inInsp) inInsp = true;
            if (simSlow.state.P_aw < minPaw) {
                minPaw = simSlow.state.P_aw;
                minPawTime = simSlow.state.timeInPhase;
            }
            if (Math.round(simSlow.state.timeInPhase * 1000) % 50 === 0) {
                inspRecords.push({
                    t: Math.round(simSlow.state.timeInPhase * 1000),
                    Paw: simSlow.state.P_aw.toFixed(2),
                    Pservo: simSlow.state.P_servo.toFixed(2),
                    Pmus: simSlow.state.P_mus.toFixed(2),
                    Flow: simSlow.state.flow.toFixed(1),
                    Vol: simSlow.state.volume.toFixed(0)
                });
            }
        } else if (inInsp) {
            break;
        }
    }

    console.log(`Min Paw during slowRise inspiration: ${minPaw.toFixed(2)} cmH2O (Dip: ${(5.0 - minPaw).toFixed(2)} cmH2O below EPAP) at ${(minPawTime*1000).toFixed(0)} ms`);
    console.table(inspRecords);

    console.log('\n=== TEST: Fast Rise Scenario (50ms, Pmus 8) ===');
    const simFast = new VentilatorSimulator();
    simFast.settings.mode = 'PS';
    simFast.settings.ipap = 12;
    simFast.settings.epap = 5;
    simFast.settings.riseTime = 0.05; // 50 ms
    simFast.settings.cyclingPercent = 0.35;
    simFast.patientDrive.rrSpont = 14;
    simFast.patientDrive.pmusMax = 8.0;
    simFast.patientDrive.tiNeural = 0.9;
    simFast.patientDrive.variability = 0;
    simFast.reset();

    let maxPawFast = 0;
    inInsp = false;
    for (let i = 0; i < 5000; i++) {
        simFast.step(0.001);
        if (simFast.state.phase === 'inspiration') {
            if (!inInsp) inInsp = true;
            if (simFast.state.P_aw > maxPawFast) maxPawFast = simFast.state.P_aw;
        } else if (inInsp) {
            break;
        }
    }
    console.log(`Max Paw during fastRise: ${maxPawFast.toFixed(2)} cmH2O (Overshoot: +${(maxPawFast - 12).toFixed(2)} cmH2O)`);

    console.log('\n=== TEST: Normal Breath (150ms, Pmus 5) ===');
    const simNorm = new VentilatorSimulator();
    simNorm.settings.mode = 'PS';
    simNorm.settings.ipap = 15;
    simNorm.settings.epap = 5;
    simNorm.settings.riseTime = 0.15; // 150 ms
    simNorm.settings.cyclingPercent = 0.25;
    simNorm.patientDrive.rrSpont = 12;
    simNorm.patientDrive.pmusMax = 5.0;
    simNorm.patientDrive.tiNeural = 1.0;
    simNorm.patientDrive.variability = 0;
    simNorm.reset();

    let minPawNorm = 999;
    let maxPawNorm = 0;
    inInsp = false;
    for (let i = 0; i < 5000; i++) {
        simNorm.step(0.001);
        if (simNorm.state.phase === 'inspiration') {
            if (!inInsp) inInsp = true;
            if (simNorm.state.P_aw < minPawNorm) minPawNorm = simNorm.state.P_aw;
            if (simNorm.state.P_aw > maxPawNorm) maxPawNorm = simNorm.state.P_aw;
        } else if (inInsp) {
            break;
        }
    }
    console.log(`Normal breath: Min Paw = ${minPawNorm.toFixed(2)} cmH2O, Max Paw = ${maxPawNorm.toFixed(2)} cmH2O`);
}

// Let's test with modifications to simulator.js
let modifiedCode = simCode;

// 1. In PatientDrive: use physiological sinusoidal/sigmoidal ramp for inspiratory effort
// tn < 0.6 * tiN -> sinusoidal rise
modifiedCode = modifiedCode.replace(
`        if (tn < 0.75 * tiN) {
            // Lineær opptrapping
            pmus = (0.75 * tiN > 0) ? pMax * (tn / (0.75 * tiN)) : 0;
        } else if (tn < tiN) {`,
`        const tRiseN = 0.45 * tiN;
        if (tn < tRiseN) {
            // Fysiologisk opptrapping med naturlig nevromuskulær drivkurve (høy P0.1)
            pmus = (tRiseN > 0) ? pMax * Math.sin((Math.PI / 2) * (tn / tRiseN)) : 0;
        } else if (tn < tiN) {`
);

// 2. In VentilatorSimulator._singleStep:
// Scale R_out dynamically with riseTime during inspiration when the inspiratory valve is throttled
modifiedCode = modifiedCode.replace(
`        const num = this.state.P_servo - this.machine.R_out * (this.state.P_mus - P_el) / R_eff;
        const den = 1 + this.machine.R_out / R_eff + this.machine.R_out * G_leak;
        let P_aw = num / den;`,
`        // Fysiologisk/pneumatisk ventilimpedans under stigetid:
        // Ved langsom stigetid (f.eks. 800 ms) er inspirasjonsventilen throttlet/strupet,
        // noe som øker effektiv maskinimpedans (R_out_eff) og skaper et realistisk trykkfall (trykkdipp / flow starvation)
        // når pasientens muskelkraft (Pmus) overstiger maskinens flowleveranse.
        const riseFactor = (this.state.phase === 'inspiration')
            ? Math.max(0, (this.settings.riseTime - 0.15) / 0.75)
            : 0;
        const R_out_eff = this.machine.R_out * (1.0 + 5.5 * riseFactor);

        const num = this.state.P_servo - R_out_eff * (this.state.P_mus - P_el) / R_eff;
        const den = 1 + R_out_eff / R_eff + R_out_eff * G_leak;
        let P_aw = num / den;`
);

testModified(modifiedCode);
