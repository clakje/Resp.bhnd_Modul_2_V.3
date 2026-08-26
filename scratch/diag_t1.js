const fs = require('fs');
const simulatorCode = fs.readFileSync('c:\\Google Drive JOBBPC\\Kodeprogrammer\\prosjekter\\Resp.bhnd modul 2\\Simulator_V.2\\simulator.js', 'utf8');
global.window = {};
eval(simulatorCode);
const VentilatorSimulator = global.window.VentilatorSimulator;

const sim = new VentilatorSimulator();
sim.patientDrive.variability = 0;
sim.patientDrive.rrSpont = 20; // 3.0s
sim.settings.rr = 12;
sim.reset();

let breathTimes = [];
let lastPhase = sim.state.phase;

for (let t = 0; t < 12; t += 0.001) {
    sim.step(0.001);
    if (sim.state.phase === 'inspiration' && lastPhase === 'expiration') {
        console.log(`Breath triggered at t = ${t.toFixed(3)}s, type: ${sim.state.lastTriggerType}, timeInPhase: ${sim.state.timeInPhase.toFixed(3)}, P_mus: ${sim.state.P_mus.toFixed(2)}, tn: ${sim.patientDrive.timeInCycle.toFixed(2)}`);
        breathTimes.push(t);
    }
    lastPhase = sim.state.phase;
}
