const fs = require('fs');
const vm = require('vm');

let simCode = fs.readFileSync('simulator.js', 'utf8');

// Apply candidate changes
simCode = simCode.replace(
`        if (tn < 0.75 * tiN) {
            // Lineær opptrapping
            pmus = (0.75 * tiN > 0) ? pMax * (tn / (0.75 * tiN)) : 0;
        } else if (tn < tiN) {`,
`        const tRiseN = 0.40 * tiN;
        if (tn < tRiseN) {
            // Fysiologisk opptrapping med naturlig nevromuskulær drivkurve (høy P0.1)
            pmus = (tRiseN > 0) ? pMax * Math.sin((Math.PI / 2) * (tn / tRiseN)) : 0;
        } else if (tn < tiN) {`
);

simCode = simCode.replace(
`        const num = this.state.P_servo - this.machine.R_out * (this.state.P_mus - P_el) / R_eff;
        const den = 1 + this.machine.R_out / R_eff + this.machine.R_out * G_leak;
        let P_aw = num / den;`,
`        // Fysiologisk/pneumatisk ventilregulering under stigetid:
        // Ved langsom stigetid (f.eks. 800 ms) er inspirasjonsventilen strupet/begrenset.
        // Når pasienten suger kraftig (Pmus > 0), oppstår flow starvation og et markant trykkfall (trykkdipp)
        // fordi pasienten trekker luft raskere enn maskinens stigetid tillater.
        const riseFactor = (this.state.phase === 'inspiration')
            ? Math.max(0, (this.settings.riseTime - 0.15) / 0.75)
            : 0;
        const starvationScale = 1.0 + 4.0 * riseFactor * (this.state.P_mus > 0 ? Math.min(1.0, this.state.P_mus / 4.0) : 0);
        const R_out_eff = this.machine.R_out * starvationScale;

        const num = this.state.P_servo - R_out_eff * (this.state.P_mus - P_el) / R_eff;
        const den = 1 + R_out_eff / R_eff + R_out_eff * G_leak;
        let P_aw = num / den;`
);

fs.writeFileSync('scratch/simulator_dynamic.js', simCode);

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

console.log('=== 1. SCENARIO: STIGETID FOR TREG (800ms, Pmus 8) ===');
const simSlow = new VentilatorSimulator();
simSlow.settings.mode = 'PS';
simSlow.settings.ipap = 14;
simSlow.settings.epap = 5;
simSlow.settings.riseTime = 0.80; // 800 ms
simSlow.settings.cyclingPercent = 0.25;
simSlow.settings.leak = 5;
simSlow.patientDrive.rrSpont = 14;
simSlow.patientDrive.pmusMax = 8.0;
simSlow.patientDrive.tiNeural = 0.9;
simSlow.patientDrive.variability = 0;
simSlow.patient.compliance = 50;
simSlow.patient.resistance = 5;
simSlow.reset();

let minPaw = 999;
let minPawTime = 0;
let inInsp = false;
let records = [];

for (let i = 0; i < 5000; i++) {
    simSlow.step(0.001);
    if (simSlow.state.phase === 'inspiration') {
        if (!inInsp) inInsp = true;
        if (simSlow.state.P_aw < minPaw) {
            minPaw = simSlow.state.P_aw;
            minPawTime = simSlow.state.timeInPhase;
        }
        if (Math.round(simSlow.state.timeInPhase * 1000) % 50 === 0) {
            records.push({
                t_ms: Math.round(simSlow.state.timeInPhase * 1000),
                Paw: simSlow.state.P_aw.toFixed(2),
                Pservo: simSlow.state.P_servo.toFixed(2),
                Pmus: simSlow.state.P_mus.toFixed(2),
                Flow: simSlow.state.flow.toFixed(1),
                Vol_ml: simSlow.state.volume.toFixed(0)
            });
        }
    } else if (inInsp) {
        break;
    }
}

console.log(`Min Paw: ${minPaw.toFixed(2)} cmH2O (Dip: ${(5.0 - minPaw).toFixed(2)} cmH2O below EPAP) at ${(minPawTime*1000).toFixed(0)} ms`);
console.table(records);
