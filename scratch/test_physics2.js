const fs = require('fs');
const vm = require('vm');
const path = require('path');

let simCode = fs.readFileSync('simulator.js', 'utf8');

// Apply ONLY the R_out_eff / starvation model in _singleStep:
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
        const starvationScale = 1.0 + 5.5 * riseFactor * (this.state.P_mus > 0 ? Math.min(1.0, this.state.P_mus / 2.5) : 0);
        const R_out_eff = this.machine.R_out * starvationScale;

        const num = this.state.P_servo - R_out_eff * (this.state.P_mus - P_el) / R_eff;
        const den = 1 + R_out_eff / R_eff + R_out_eff * G_leak;
        let P_aw = num / den;`
);

fs.writeFileSync('scratch/simulator_linear_pmus.js', simCode);

function runSuite(testFile) {
    console.log(`\n================== RUNNING ${testFile} ==================`);
    let testCode = fs.readFileSync(testFile, 'utf8');
    testCode = testCode.replace(/path\.join\(__dirname,\s*['"]simulator\.js['"]\)/g, "path.join(__dirname, 'scratch', 'simulator_linear_pmus.js')");
    testCode = testCode.replace(/__dirname\s*\+\s*['"]\/simulator\.js['"]/g, "path.join(__dirname, 'scratch', 'simulator_linear_pmus.js')");
    testCode = testCode.replace(/fs\.readFileSync\(['"]simulator\.js['"],\s*['"]utf8['"]\)/g, "fs.readFileSync(path.join(__dirname, 'scratch', 'simulator_linear_pmus.js'), 'utf8')");
    testCode = testCode.replace(/fs\.readFileSync\(['"]\.\/simulator\.js['"],\s*['"]utf8['"]\)/g, "fs.readFileSync(path.join(__dirname, 'scratch', 'simulator_linear_pmus.js'), 'utf8')");
    
    const sandbox = {
        require: require,
        console: console,
        Math: Math,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        process: process,
        __dirname: path.resolve('.'),
        path: path,
        global: {}
    };
    sandbox.global = sandbox;
    vm.createContext(sandbox);
    try {
        vm.runInContext(testCode, sandbox);
    } catch (e) {
        console.error(`Error running ${testFile}:`, e);
    }
}

runSuite('test_validering.js');
runSuite('test_fagekspert.js');
