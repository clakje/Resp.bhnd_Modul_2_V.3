const fs = require('fs');
const vm = require('vm');
const simCode = fs.readFileSync('simulator.js', 'utf8');
const sandbox = { window: {}, console: console, Math: Math, setTimeout: setTimeout, clearTimeout: clearTimeout };
vm.createContext(sandbox);
vm.runInContext(simCode, sandbox);
const VentilatorSimulator = sandbox.window.VentilatorSimulator;

const sim = new VentilatorSimulator();
sim.settings.mode = 'PS';
sim.settings.ipap = 14;
sim.settings.epap = 5;
sim.settings.riseTime = 0.8; // 800 ms
sim.settings.cyclingPercent = 0.25;
sim.settings.leak = 5;
sim.patientDrive.rrSpont = 14;
sim.patientDrive.pmusMax = 8.0;
sim.patientDrive.tiNeural = 0.9;
sim.patientDrive.variability = 0;
sim.patient.compliance = 50;
sim.patient.resistance = 5;
sim.reset();

// Run until first breath
let inspStarted = false;
for (let i = 0; i < 5000; i++) {
    sim.step(0.001);
    if (sim.state.phase === 'inspiration') {
        if (!inspStarted) {
            inspStarted = true;
            console.log('--- START INSPIRATION ---');
        }
        if (Math.round(sim.state.timeInPhase * 1000) % 25 === 0) {
            console.log(`t: ${(sim.state.timeInPhase*1000).toFixed(0)}ms | Paw: ${sim.state.P_aw.toFixed(2)} | Pservo: ${sim.state.P_servo.toFixed(2)} | Pmus: ${sim.state.P_mus.toFixed(2)} | Pel: ${sim.state.P_el.toFixed(2)} | Flow: ${sim.state.flow.toFixed(1)}`);
        }
    } else if (inspStarted) {
        console.log('--- END INSPIRATION ---');
        break;
    }
}
