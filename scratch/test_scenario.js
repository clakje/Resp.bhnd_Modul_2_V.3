const fs = require('fs');
global.window = {};
eval(fs.readFileSync('simulator.js', 'utf8'));
const sim = new global.window.VentilatorSimulator();

sim.patient.compliance = 90;
sim.patient.resistance = 5;
sim.patient.expRatio = 1.0;
sim.patient.flowLimitation = 0;
sim.patientDrive.rrSpont = 12;
sim.patientDrive.pmusMax = 0.75;
sim.patientDrive.tiNeural = 1.0;
sim.patientDrive.pmusExp = 0.0;
sim.patientDrive.variability = 10;
sim.settings.ipap = 10;
sim.settings.epap = 5;
sim.settings.backupRate = 10; // 10 /min gives 6.0s backup window, patient at 12/min breathes every 5.0s
sim.settings.leak = 0;

for (let trig of [5.0, 4.0, 3.0, 1.5]) {
    sim.settings.triggerFlow = trig;
    sim.reset();
    for (let t = 0; t < 60; t += 0.01) {
        sim.step(0.01);
    }
    console.log(`Trigger ${trig} L/min:`);
    console.log(`   RRtot: ${sim.state.measured.rrTotal} /min`);
    console.log(`   RRspont: ${sim.state.measured.rrSpont} /min`);
    console.log(`   % Spont: ${sim.state.measured.spontPercent} %`);
    console.log(`   Vt: ${sim.state.measured.vt} ml`);
    console.log(`   Asynchrony Index: ${sim.state.measured.asynchronyIndex} %`);
}
