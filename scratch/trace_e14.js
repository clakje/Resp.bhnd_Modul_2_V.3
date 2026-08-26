const fs = require('fs');
const path = require('path');
global.window = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'simulator.js'), 'utf8'));

const sim = new global.window.VentilatorSimulator();
sim.settings.ipap = 14;
sim.settings.epap = 5;
sim.settings.cyclingPercent = 0.05;
sim.settings.tiMax = 2.5;
sim.patientDrive.rrSpont = 12;
sim.patientDrive.tiNeural = 0.6;
sim.patientDrive.pmusExp = 8.0;
sim.patientDrive.variability = 0;
sim.reset();

for (let t = 0; t < 6; t += 0.001) sim.step(0.001);
while (sim.state.phase !== 'inspiration') sim.step(0.0005);

console.log('--- INSPIRATION TRACE ---');
let minPawPlateau = 999;
let maxPawTerminal = -999;

while (sim.state.phase === 'inspiration') {
    const tip = sim.state.timeInPhase;
    if (Math.round(tip * 1000) % 50 === 0) {
        console.log(`tip=${tip.toFixed(3)}s Paw=${sim.state.P_aw.toFixed(2)} Pmus=${sim.state.P_mus.toFixed(2)} Q_lunge=${(sim.state.Q_lunge*60).toFixed(1)} L/m`);
    }
    if (tip >= 0.15 && tip <= 0.35) {
        if (sim.state.P_aw < minPawPlateau) minPawPlateau = sim.state.P_aw;
    }
    if (tip > 0.35) {
        if (sim.state.P_aw > maxPawTerminal) maxPawTerminal = sim.state.P_aw;
    }
    sim.step(0.0005);
}

console.log(`minPawPlateau=${minPawPlateau.toFixed(2)}, maxPawTerminal=${maxPawTerminal.toFixed(2)}, spike=${(maxPawTerminal - minPawPlateau).toFixed(2)}`);
