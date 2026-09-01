const fs = require('fs');
const vm = require('vm');
const simCode = fs.readFileSync('simulator.js', 'utf8');

// Let's test the current simulator with slowRise parameters
function testCurrent() {
    const sandbox = { window: {}, console: console, Math: Math, setTimeout: setTimeout, clearTimeout: clearTimeout };
    vm.createContext(sandbox);
    vm.runInContext(simCode, sandbox);
    const VentilatorSimulator = sandbox.window.VentilatorSimulator;

    const sim = new VentilatorSimulator();
    sim.settings.mode = 'PS';
    sim.settings.ipap = 14;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.80; // 800 ms
    sim.settings.cyclingPercent = 0.25;
    sim.settings.leak = 5;
    sim.patientDrive.rrSpont = 14;
    sim.patientDrive.pmusMax = 8.0;
    sim.patientDrive.tiNeural = 0.9;
    sim.patientDrive.variability = 0;
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.reset();

    // Run until inspiration
    let minPawInInspir = 999;
    let minPawTime = 0;
    let inInsp = false;
    for (let i = 0; i < 5000; i++) {
        sim.step(0.001);
        if (sim.state.phase === 'inspiration') {
            if (!inInsp) inInsp = true;
            if (sim.state.P_aw < minPawInInspir) {
                minPawInInspir = sim.state.P_aw;
                minPawTime = sim.state.timeInPhase;
            }
        } else if (inInsp) {
            break;
        }
    }
    console.log(`Current slowRise: Min Paw during inspiration = ${minPawInInspir.toFixed(2)} cmH2O (at t=${(minPawTime*1000).toFixed(0)} ms), baseline EPAP = 5.0`);
}

testCurrent();
