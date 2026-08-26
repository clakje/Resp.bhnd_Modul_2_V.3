const fs = require('fs');
const path = require('path');
global.window = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'simulator.js'), 'utf8'));

for (let r of [15, 16, 17, 18]) {
    for (let fl of [0.5, 0.6, 0.7]) {
        for (let er of [1.3, 1.4, 1.5]) {
            const sim10 = new global.window.VentilatorSimulator();
            sim10.patient.compliance = 70;
            sim10.patient.resistance = r;
            sim10.patient.flowLimitation = fl;
            sim10.patient.expRatio = er;
            sim10.patientDrive.rrSpont = 10;
            sim10.patientDrive.pmusMax = 3.0;
            sim10.settings.epap = 5;
            sim10.reset();
            for (let t = 0; t < 35; t += 0.016) sim10.step(0.016);
            const p10 = sim10.state.measured.peepi || sim10.state.PEEPi;

            const sim25 = new global.window.VentilatorSimulator();
            sim25.patient.compliance = 70;
            sim25.patient.resistance = r;
            sim25.patient.flowLimitation = fl;
            sim25.patient.expRatio = er;
            sim25.patientDrive.rrSpont = 25;
            sim25.patientDrive.pmusMax = 3.0;
            sim25.settings.epap = 5;
            sim25.reset();
            for (let t = 0; t < 35; t += 0.016) sim25.step(0.016);
            const p25 = sim25.state.measured.peepi || sim25.state.PEEPi;

            console.log(`R=${r}, fl=${fl}, er=${er} => PEEPi(10)=${p10.toFixed(2)}, PEEPi(25)=${p25.toFixed(2)}`);
        }
    }
}
