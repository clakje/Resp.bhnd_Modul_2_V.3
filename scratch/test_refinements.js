const fs = require('fs');
const path = require('path');
global.window = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'simulator.js'), 'utf8'));
const VentilatorSimulator = global.window.VentilatorSimulator;

console.log('Testing refined parameters...');

// 1. Test E1
{
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.20;
    sim.settings.cyclingPercent = 0.25;
    sim.settings.backupRate = 15;
    sim.settings.stActive = true;
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.patientDrive.rrSpont = 0;
    sim.patientDrive.pmusMax = 0;
    sim.reset();

    // In PS mode, mandatory backup breath has timed Ti
    for (let t = 0; t < 20; t += 0.016) sim.step(0.016);
    console.log('E1 Vt:', sim.state.measured.vt, 'VTI:', sim.state.measured.vti, 'VTE:', sim.state.measured.vte);
}

// 2. Test E7 (Rise time 900 ms)
{
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.90;
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.patientDrive.pmusMax = 0;
    sim.reset();

    let inInspiration = false;
    let inspStartTime = 0;
    let timeAt90Percent = null;
    let maxPaw = 0;
    const target90 = 5 + 0.90 * (15 - 5); // 14.0 cmH2O

    for (let t = 0; t < 10; t += 0.001) {
        sim.step(0.001);
        if (sim.state.phase === 'inspiration') {
            if (!inInspiration) {
                inInspiration = true;
                inspStartTime = sim.state.totalTime;
            }
            if (sim.state.P_aw > maxPaw) maxPaw = sim.state.P_aw;
            const timeSinceInsp = sim.state.totalTime - inspStartTime;
            if (sim.state.P_aw >= target90 && timeAt90Percent === null) {
                timeAt90Percent = timeSinceInsp;
            }
        } else {
            inInspiration = false;
        }
    }
    console.log('E7 time to 90%:', timeAt90Percent?.toFixed(3), 'maxPaw:', maxPaw.toFixed(2));
}

// 3. Test E10 and E11
{
    const sim10 = new VentilatorSimulator();
    sim10.setPreset('copd');
    sim10.patient.resistance = 15;
    sim10.patient.expRatio = 1.3;
    sim10.patientDrive.rrSpont = 25;
    sim10.settings.epap = 5;
    sim10.reset();
    for (let t = 0; t < 35; t += 0.016) sim10.step(0.016);
    console.log('E10 PEEPi (rr=25):', sim10.state.measured.peepi);

    const sim11 = new VentilatorSimulator();
    sim11.setPreset('copd');
    sim11.patient.resistance = 15;
    sim11.patient.expRatio = 1.3;
    sim11.patientDrive.rrSpont = 10;
    sim11.settings.epap = 5;
    sim11.reset();
    for (let t = 0; t < 35; t += 0.016) sim11.step(0.016);
    console.log('E11 PEEPi (rr=10):', sim11.state.measured.peepi);
}
