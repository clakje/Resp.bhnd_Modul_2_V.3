/**
 * diagnostikk/test_pc_mode_rr.js
 * Tester om sliderRR / settings.rr faktisk styrer frekvensen i PC-modus.
 */

const fs = require('fs');
const path = require('path');

global.window = {};
const simCode = fs.readFileSync(path.join(__dirname, '..', 'simulator.js'), 'utf8');
eval(simCode);
const VentilatorSimulator = global.window.VentilatorSimulator;

const sim = new VentilatorSimulator();
sim.settings.mode = 'PC';
sim.settings.rr = 25; // Bruker stiller inn 25 /min i PC-modus
sim.settings.backupRate = 12; // BackupRate står på 12
sim.patientDrive.rrSpont = 0; // Passiv pasient
sim.reset();

// Kjør i 60 sekunder
for (let t = 0; t < 60; t += 0.016) {
    sim.step(0.016);
}

console.log('PC-modus test:');
console.log('Innstilt settings.rr =', sim.settings.rr);
console.log('Innstilt settings.backupRate =', sim.settings.backupRate);
console.log('Faktisk leverte pust siste 60s (measured.rrTotal) =', sim.state.measured.rrTotal);
console.log('Breath count =', sim.state.breathCount);
