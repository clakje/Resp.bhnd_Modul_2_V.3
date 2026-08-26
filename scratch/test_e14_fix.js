const fs = require('fs');
const path = require('path');
global.window = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'simulator.js'), 'utf8'));
const VentilatorSimulator = global.window.VentilatorSimulator;

const sim = new VentilatorSimulator();
sim.settings.ipap = 14;
sim.settings.epap = 5;
sim.settings.cyclingPercent = 0.05;
sim.settings.tiMax = 2.5;
sim.patientDrive.rrSpont = 12;
sim.patientDrive.tiNeural = 0.6;
sim.patientDrive.pmusMax = 3.0;
sim.patientDrive.pmusExp = 8.0;
sim.patientDrive.variability = 0;

// Override step on patientDrive to test
sim.patientDrive.step = function(dt, totalTime, effortsList) {
    if (this.rrSpont <= 0) { this.P_mus = 0; return; }
    if (this.timeInCycle >= this.currentCycleDuration || this.currentCycleDuration === Infinity) {
        this._startNewCycle(totalTime, effortsList);
    }
    const tn = this.timeInCycle;
    const tiN = this.currentTiNeural;
    const pMax = this.currentPmusMax;
    const pExp = this.currentPmusExp;
    let pmus = 0;
    if (tn < 0.7 * tiN) {
        pmus = (0.7 * tiN > 0) ? pMax * (tn / (0.7 * tiN)) : 0;
    } else if (tn < tiN) {
        pmus = pMax;
    } else if (tn < tiN + 0.35) {
        pmus = -pExp * Math.sin(Math.PI * (tn - tiN) / 0.35);
    } else {
        pmus = 0.0;
    }
    this.P_mus = pmus;
    this.timeInCycle += dt;
};

sim.reset();
for (let t = 0; t < 6; t += 0.001) sim.step(0.001);
while (sim.state.phase !== 'inspiration') sim.step(0.0002);

let maxPaw = 0;
let minPawPlateau = 999;
while (sim.state.phase === 'inspiration') {
    const tip = sim.state.timeInPhase;
    if (tip >= 0.15 && tip <= 0.35) {
        if (sim.state.P_aw < minPawPlateau) minPawPlateau = sim.state.P_aw;
    }
    if (sim.state.P_aw > maxPaw) maxPaw = sim.state.P_aw;
    sim.step(0.0002);
}

console.log('lastPip:', sim.state.lastPip, 'maxPaw:', maxPaw.toFixed(2), 'minPlateau:', minPawPlateau.toFixed(2), 'Spike over plateau:', (sim.state.lastPip - minPawPlateau).toFixed(2));
