const fs = require('fs');
const vm = require('vm');

let simCode = fs.readFileSync('simulator.js', 'utf8');

// Update PatientDrive to have natural neuromuscular inspiratory curve (high P0.1, plateau, and smooth end-inspiratory relaxation)
simCode = simCode.replace(
`        // Fysiologisk P_mus(t_n) kurveform (A3)
        let pmus = 0.0;
        if (tn < 0.75 * tiN) {
            // Lineær opptrapping
            pmus = (0.75 * tiN > 0) ? pMax * (tn / (0.75 * tiN)) : 0;
        } else if (tn < tiN) {
            // Hold kraften ut den nevrale inspirasjonstiden
            pmus = pMax;
        } else if (tn < tiN + 0.35) {
            // Eventuell aktiv ekspirasjon / kamp mot maskinen (A3, A6)
            pmus = -pExp * Math.sin(Math.PI * (tn - tiN) / 0.35);
        } else {
            pmus = 0.0;
        }`,
`        // Fysiologisk P_mus(t_n) kurveform (A3) med realistisk nevromuskulær aktivering (P0.1)
        let pmus = 0.0;
        const tSurge = 0.35 * tiN;
        const tHold  = 0.70 * tiN;
        if (tn < tSurge) {
            // Rask nevromuskulær opptrapping (høy P0.1)
            pmus = (tSurge > 0) ? pMax * Math.sin((Math.PI / 2) * (tn / tSurge)) : 0;
        } else if (tn < tHold) {
            // Platå under aktiv inspirasjon
            pmus = pMax;
        } else if (tn < tiN) {
            // Myk avtagende muskeltonus mot slutten av nevrale Ti
            const relTime = (tn - tHold) / (tiN - tHold);
            pmus = pMax * Math.cos((Math.PI / 2) * relTime);
        } else if (tn < tiN + 0.35) {
            // Eventuell aktiv ekspirasjon / kamp mot maskinen (A3, A6)
            pmus = -pExp * Math.sin(Math.PI * (tn - tiN) / 0.35);
        } else {
            pmus = 0.0;
        }`
);

fs.writeFileSync('scratch/simulator_complete.js', simCode);

const sandbox = {
    require: require,
    console: console,
    Math: Math,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    process: process,
    window: {}
};
vm.createContext(sandbox);
vm.runInContext(simCode, sandbox);
const VentilatorSimulator = sandbox.window.VentilatorSimulator;

console.log('=== TEST SLOW RISE WITH COMPLETE PHYSIOLOGICAL MODEL ===');
const sim = new VentilatorSimulator();
sim.settings.mode = 'PS';
sim.settings.ipap = 14;
sim.settings.epap = 5;
sim.settings.riseTime = 0.80; // 800 ms
sim.settings.cyclingPercent = 0.25;
sim.settings.leak = 5;
sim.patientDrive.rrSpont = 14;
sim.patientDrive.pmusMax = 8.0;
sim.patientDrive.tiNeural = 0.9;
sim.patientDrive.variability = 0;
sim.patient.compliance = 50;
sim.patient.resistance = 5;
sim.reset();

let records = [];
let inInsp = false;
for (let i = 0; i < 4000; i++) {
    sim.step(0.001);
    if (sim.state.phase === 'inspiration') {
        if (!inInsp) inInsp = true;
        if (Math.round(sim.state.timeInPhase * 1000) % 25 === 0) {
            records.push({
                t: Math.round(sim.state.timeInPhase * 1000),
                Paw: sim.state.P_aw.toFixed(2),
                Pmus: sim.state.P_mus.toFixed(2),
                Flow: sim.state.flow.toFixed(1),
                Vol: sim.state.volume.toFixed(0)
            });
        }
    } else if (inInsp) {
        break;
    }
}

records.slice(0, 35).forEach(r => {
    const pawBar = '#'.repeat(Math.max(0, Math.round(r.Paw * 2)));
    console.log(`t: ${r.t.toString().padStart(4, ' ')}ms | Paw: ${r.Paw.padStart(5, ' ')} | Pmus: ${r.Pmus.padStart(5, ' ')} | Flow: ${r.Flow.padStart(5, ' ')} L/min | ${pawBar}`);
});
