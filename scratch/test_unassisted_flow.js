const fs = require('fs');
global.window = {};
eval(fs.readFileSync('simulator.js', 'utf8'));
const sim = new global.window.VentilatorSimulator();

sim.patient.compliance = 90;
sim.patient.resistance = 5;
sim.patient.expRatio = 1.0;
sim.patient.flowLimitation = 0;
sim.patientDrive.rrSpont = 12;
sim.patientDrive.tiNeural = 1.0;
sim.patientDrive.pmusExp = 0.0;
sim.patientDrive.variability = 0; // deterministic for test
sim.settings.ipap = 10;
sim.settings.epap = 5;
sim.settings.backupRate = 0;
sim.settings.leak = 0;
sim.settings.triggerFlow = 100; // no trigger

console.log("Unassisted Peak Flow (L/min) vs pmus (C=90, R=5):");
for (let p = 0.1; p <= 3.0; p += 0.1) {
    sim.patientDrive.pmusMax = p;
    sim.reset();
    let maxFlow = 0;
    for (let t = 0; t < 10; t += 0.005) {
        sim.step(0.005);
        if (sim.state.flow > maxFlow) maxFlow = sim.state.flow;
    }
    console.log(`pmus=${p.toFixed(2)} cmH2O -> Peak Unassisted Flow = ${maxFlow.toFixed(2)} L/min`);
}
