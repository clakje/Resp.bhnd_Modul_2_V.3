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
sim.patientDrive.variability = 5;
sim.settings.ipap = 10;
sim.settings.epap = 5;
sim.settings.backupRate = 0; // Turn off backup to isolate spontaneous triggering
sim.settings.leak = 0;

console.log("Testing trigger flow under different Pmus and triggerFlow (60s simulation):");
for (let pmus of [0.35, 0.5, 0.8, 1.0, 1.5, 2.0, 2.5, 3.0]) {
    sim.patientDrive.pmusMax = pmus;
    for (let trig of [3.0, 4.0, 5.0]) {
        sim.settings.triggerFlow = trig;
        sim.reset();
        let triggers = 0;
        let missed = 0;
        let maxExpFlow = 0;
        for (let t = 0; t < 60; t += 0.02) {
            sim.step(0.02);
            if (sim.state.justTriggered) {
                triggers++;
                sim.state.justTriggered = false;
            }
            if (sim.state.phase === 'expiration' && sim.state.flow > maxExpFlow) {
                maxExpFlow = sim.state.flow;
            }
        }
        console.log(`pmus=${pmus}, trig=${trig} -> triggers: ${triggers} (of ~12 breaths), maxExpFlow=${maxExpFlow.toFixed(2)} L/min, measured rrSpont=${sim.state.measured.rrSpont}, %Spont=${sim.state.measured.spontPercent}%`);
    }
}
