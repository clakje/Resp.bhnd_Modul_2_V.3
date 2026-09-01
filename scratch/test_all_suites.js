const fs = require('fs');
const vm = require('vm');
const path = require('path');

function runSuite(testFile) {
    console.log(`\n================== RUNNING ${testFile} ==================`);
    let testCode = fs.readFileSync(testFile, 'utf8');
    testCode = testCode.replace(/path\.join\(__dirname,\s*['"]simulator\.js['"]\)/g, "path.join(__dirname, 'scratch', 'simulator_dynamic.js')");
    testCode = testCode.replace(/__dirname\s*\+\s*['"]\/simulator\.js['"]/g, "path.join(__dirname, 'scratch', 'simulator_dynamic.js')");
    testCode = testCode.replace(/fs\.readFileSync\(['"]simulator\.js['"],\s*['"]utf8['"]\)/g, "fs.readFileSync(path.join(__dirname, 'scratch', 'simulator_dynamic.js'), 'utf8')");
    testCode = testCode.replace(/fs\.readFileSync\(['"]\.\/simulator\.js['"],\s*['"]utf8['"]\)/g, "fs.readFileSync(path.join(__dirname, 'scratch', 'simulator_dynamic.js'), 'utf8')");
    
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

runSuite('test_fagekspert.js');
runSuite('test_validering.js');
runSuite('test_phase4.js');
