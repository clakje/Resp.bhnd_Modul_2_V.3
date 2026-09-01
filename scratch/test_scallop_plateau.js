const fs = require('fs');
const vm = require('vm');
const path = require('path');

let simCode = fs.readFileSync('simulator.js', 'utf8');

const sandbox = {
    require: require,
    console: console,
    Math: Math,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    process: process,
    window: {}
};
vm.createContext(sandbox);
vm.runInContext(simCode, sandbox);
const VentilatorSimulator = sandbox.window.VentilatorSimulator;

function testPreset(riseTimeMs, cyclingPct, tiNeuralVal, pmusVal) {
    const sim = new VentilatorSimulator();
    sim.settings.mode = 'PS';
    sim.settings.ipap = 14;
    sim.settings.epap = 5;
    sim.settings.riseTime = riseTimeMs / 1000;
    sim.settings.cyclingPercent = cyclingPct / 100;
    sim.settings.leak = 5;
    sim.patientDrive.rrSpont = 14;
    sim.patientDrive.pmusMax = pmusVal;
    sim.patientDrive.tiNeural = tiNeuralVal;
    sim.patientDrive.variability = 0;
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.reset();

    let records = [];
    let inInsp = false;
    for (let i = 0; i < 4000; i++) {
        sim.step(0.001);
        if (sim.state.phase === 'inspiration') {
            if (!inInsp) inInsp = true;
            if (Math.round(sim.state.timeInPhase * 1000) % 25 === 0) {
                records.push({
                    t: Math.round(sim.state.timeInPhase * 1000),
                    Paw: sim.state.P_aw.toFixed(2),
                    Flow: sim.state.flow.toFixed(1),
                    Vol: sim.state.volume.toFixed(0)
                });
            }
        } else if (inInsp) {
            break;
        }
    }

    console.log(`\n=== Preset: RiseTime=${riseTimeMs}ms, Cycling=${cyclingPct}%, TiNeural=${tiNeuralVal}s, Pmus=${pmusVal} ===`);
    records.slice(0, 30).forEach(r => {
        const pawBar = '#'.repeat(Math.max(0, Math.round(r.Paw * 2)));
        console.log(`t: ${r.t.toString().padStart(4, ' ')}ms | Paw: ${r.Paw.padStart(5, ' ')} | Flow: ${r.Flow.padStart(5, ' ')} L/min | ${pawBar}`);
    });
}

testPreset(800, 25, 0.9, 8.0);
testPreset(600, 15, 1.1, 9.0);
testPreset(500, 15, 1.1, 9.0);
