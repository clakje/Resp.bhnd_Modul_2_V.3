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
sim.patientDrive.variability = 12; // Realistic physiological variability
sim.settings.ipap = 10;
sim.settings.epap = 5;
sim.settings.backupRate = 0;
sim.settings.leak = 0;

console.log("Searching for optimal pmus where:");
console.log("Trigger 5 L/min -> 0% trigging");
console.log("Trigger 4 L/min -> sporadic trigging");
console.log("Trigger 3 L/min -> 100% trigging");

for (let p of [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80]) {
    console.log(`\n--- Testing pmus = ${p} ---`);
    for (let trig of [5.0, 4.0, 3.0]) {
        sim.patientDrive.pmusMax = p;
        sim.settings.triggerFlow = trig;
        sim.reset();
        let triggers = 0;
        let missed = 0;
        let maxExpFlow = 0;
        // run 120s for good stats
        for (let t = 0; t < 120; t += 0.01) {
            sim.step(0.01);
            if (sim.state.justTriggered) {
                triggers++;
                sim.state.justTriggered = false;
            }
        }
        const totalEfforts = sim.state.efforts.length;
        console.log(`Trig ${trig} L/min: ${triggers} triggered breaths in 120s (total efforts: ${totalEfforts})`);
    }
}
