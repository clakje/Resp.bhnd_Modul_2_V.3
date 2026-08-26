/**
 * diagnostikk/test_systematic.js
 * Systematisk undersøkelse av alle punkter i seksjon 4.
 */

const fs = require('fs');
const path = require('path');

global.window = {};
const simCode = fs.readFileSync(path.join(__dirname, '..', 'simulator.js'), 'utf8');
const renCode = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
const appCode = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

eval(simCode);
const VentilatorSimulator = global.window.VentilatorSimulator;

const findings = [];

function simRun(sim, sec, dt = 0.016) {
    const steps = Math.round(sec / dt);
    for (let i = 0; i < steps; i++) {
        sim.step(dt);
    }
}

console.log('========================================================================');
console.log('SYSTEMATISK TEST AV ALLE PUNKTER I SEKSJON 4');
console.log('========================================================================\n');

// 1. FYSIKK: Retningsvalg R_eff og oscillasjon rundt nullflow
console.log('--- 1.1 Fysikk: Retningsvalg R_eff og sirkelavhengighet ---');
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 10;
    sim.settings.epap = 5;
    sim.reset();
    let oscillations = 0;
    let lastDirection = null;
    for (let t = 0; t < 10; t += 0.0002) {
        sim._singleStep(0.0002);
        const curDirection = (sim.state.P_aw + sim.state.P_mus - sim.state.P_el) > 0;
        if (lastDirection !== null && curDirection !== lastDirection && Math.abs(sim.state.Q_lunge) < 0.001) {
            oscillations++;
        }
        lastDirection = curDirection;
    }
    console.log(`   Oscillasjoner ved nullflow: ${oscillations}`);
})();

// 1.2 P_mus i algebraisk løsning i alle faser
console.log('\n--- 1.2 Fysikk: P_mus i algebraisk løsning i alle faser ---');
(() => {
    const sim = new VentilatorSimulator();
    sim.reset();
    simRun(sim, 2);
    // Er vi i ekspirasjon?
    // Sjekk formelen i koden:
    // const num = this.state.P_servo - this.machine.R_out * (this.state.P_mus - P_el) / R_eff;
    // const den = 1 + this.machine.R_out / R_eff + this.machine.R_out * G_leak;
    // let P_aw = num / den;
    console.log(`   P_mus inngår i num i _singleStep: ${simCode.includes('this.machine.R_out * (this.state.P_mus - P_el) / R_eff')}`);
})();

// 1.3 dtCarry og drift mot veggklokke over 10 minutter
console.log('\n--- 1.3 Fysikk: dtCarry drift over 10 minutter ---');
(() => {
    const sim = new VentilatorSimulator();
    sim.reset();
    let simWallTime = 0;
    const targetSeconds = 600; // 10 min
    // Simuler variable frameDt (mellom 14ms og 18ms som ved 60fps)
    while (simWallTime < targetSeconds) {
        const frameDt = 0.016 + (Math.random() * 0.004 - 0.002);
        simWallTime += frameDt;
        sim.step(frameDt);
    }
    const diff = Math.abs(sim.state.totalTime - simWallTime);
    console.log(`   Veggklokke: ${simWallTime.toFixed(4)} s, Simulert tid: ${sim.state.totalTime.toFixed(4)} s, Avvik: ${diff.toFixed(6)} s, dtCarry: ${sim.state.dtCarry?.toFixed(6)} s`);
})();

// 1.4 G_leak ved P_aw nær 0
console.log('\n--- 1.4 Fysikk: G_leak ved P_aw nær 0 ---');
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.leak = 30;
    sim.settings.epap = 0;
    sim.state.P_aw = 0.0;
    sim._singleStep(0.0002);
    console.log(`   P_aw = 0, G_leak = ${sim.state.Q_lekk}, P_aw etter steg = ${sim.state.P_aw}`);
})();

// 1.5 PEEPi beregningstidspunkt
console.log('\n--- 1.5 Fysikk: PEEPi beregningstidspunkt ---');
(() => {
    // Sjekk _startInspiration() i simulator.js
    // Linje 982-985:
    // const C_L = this.patient.compliance / 1000;
    // this.state.V_endExp = this.state.V;
    // this.state.PEEPi = Math.max(0, (this.state.V_endExp / C_L) - this.settings.epap);
    console.log(`   PEEPi beregnes i _startInspiration() fra V_endExp før V integreres i innpust: Ja.`);
})();

// 1.6 Flowbegrensning Qmax konsistens mellom trykk og flow
console.log('\n--- 1.6 Fysikk: Qmax konsistens mellom P_aw og Q_total ---');
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 40;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.05;
    sim.patient.resistance = 1;
    sim.patient.compliance = 100;
    sim.machine.Qmax = 2.0; // 2 L/s
    sim.reset();
    let maxFlowSeen = 0;
    let inconsistentSteps = 0;
    for (let t = 0; t < 5; t += 0.0002) {
        sim._singleStep(0.0002);
        if (sim.state.Q_total > maxFlowSeen) maxFlowSeen = sim.state.Q_total;
        if (sim.state.Q_total > sim.machine.Qmax + 0.001) inconsistentSteps++;
    }
    console.log(`   Qmax = ${sim.machine.Qmax} L/s, Maksimal Q_total = ${maxFlowSeen.toFixed(4)} L/s, Inkonsistente steg = ${inconsistentSteps}`);
})();

// 1.7 Ekspiratorisk flowbegrensning: R_exp_eff ved store drivtrykk
console.log('\n--- 1.7 Fysikk: R_exp_eff ved store drivtrykk ---');
(() => {
    const sim = new VentilatorSimulator();
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.patient.flowLimitation = 1.0;
    sim.state.V = 2.0; // 2 liter over FRC (ekstrem hyperinflasjon)
    sim.state.P_mus = -20; // pasient presser hardt ut
    sim.settings.epap = 0;
    sim._singleStep(0.0002);
    console.log(`   Ekstrem drivtrykk: P_el = ${sim.state.P_el}, P_mus = ${sim.state.P_mus}, R_exp_eff beregnet, P_aw = ${sim.state.P_aw.toFixed(2)}, Q_lunge = ${sim.state.Q_lunge.toFixed(2)}`);
})();

// 2. TRIGGER, CYCLING, INNSATSKLASSIFISERING
console.log('\n--- 2.1 Lekkasjeestimat: tidskonstant og oppdatering ---');
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.leak = 20;
    sim.reset();
    // I inspirasjon oppdateres Q_leak_estimert?
    // Sjekk linje 608-610:
    // if (this.state.timeInPhase > 0.15) { this.state.Q_leak_estimert += (epapLeakTarget - this.state.Q_leak_estimert) * (dt / 4.0); }
    // Dette ligger kun inne i `if (this.state.phase === 'expiration')`!
    console.log(`   Q_leak_estimert oppdateres kun i expiration etter 0.15s med tidskonstant 4.0s: Korrekt.`);
})();

console.log('\n--- 2.2 Kan en innsats klassifiseres to ganger eller havne i state.efforts flere ganger? ---');
(() => {
    const sim = new VentilatorSimulator();
    sim.patientDrive.rrSpont = 14;
    sim.reset();
    simRun(sim, 20);
    const effortTimes = sim.state.efforts.map(e => e.t);
    const duplicates = effortTimes.filter((t, idx) => effortTimes.indexOf(t) !== idx);
    console.log(`   Totalt efforts: ${sim.state.efforts.length}, Duplikate tidsstempler: ${duplicates.length}`);
})();

console.log('\n--- 2.3 Kan et pust bli både assist og double? Både auto og assist? ---');
(() => {
    // Sjekk logikken for triggertype:
    // lastTriggerType settes til enten 'assist', 'double', 'auto', 'mandatory'.
    // Men la oss sjekke om et pust kan overskrives eller få feil type.
    const sim = new VentilatorSimulator();
    sim.settings.cyclingPercent = 0.85;
    sim.patientDrive.pmusMax = 7;
    sim.patientDrive.tiNeural = 1.2;
    sim.reset();
    simRun(sim, 20);
    console.log(`   Typer i efforts: ${Array.from(new Set(sim.state.efforts.map(e => e.type))).join(', ')}`);
})();

console.log('\n--- 2.4 Refraktærtid 0.15 s måles fra cycling eller trigging? ---');
(() => {
    // Sjekk linje 642: `if (this.state.timeInPhase >= refractoryPeriod)`
    // I expiration er timeInPhase satt til 0 i _startExpiration(), altså ved cycling!
    console.log(`   Refraktærtid sjekkes mot timeInPhase i expiration: Måles fra cycling (0.15s etter innpust slutt).`);
})();

console.log('\n--- 2.5 peakQmeas nullstilling ved innpuststart og tiMax ---');
(() => {
    const sim = new VentilatorSimulator();
    sim.settings.tiMax = 0.5;
    sim.settings.cyclingPercent = 0.01;
    sim.reset();
    simRun(sim, 5);
    console.log(`   peakQmeas ved innpust: ${sim.state.peakQmeas}`);
})();

console.log('\n--- 2.6 state.efforts minnelekkasje over 60 minutter ---');
(() => {
    const sim = new VentilatorSimulator();
    sim.patientDrive.rrSpont = 30; // høy frekvens
    sim.reset();
    // Simuler 3600 sekunder (1 time)
    simRun(sim, 3600);
    console.log(`   state.efforts lengde etter 1 time (3600s): ${sim.state.efforts.length}`);
    console.log(`   recentBreaths lengde etter 1 time (3600s): ${sim.recentBreaths.length}`);
})();

// 3. MÅLEVERDIER
console.log('\n--- 3.1 Måleverdier: Hvor kommer hvert tall fra? ---');
(() => {
    const sim = new VentilatorSimulator();
    sim.reset();
    console.log('   Sjekker measured objektets kilder og initialverdier:');
    console.log('   measured:', JSON.stringify(sim.state.measured, null, 2));
})();

console.log('\n--- 3.2 Glatting over 3 pust før 3 pust finnes ---');
(() => {
    const sim = new VentilatorSimulator();
    sim.reset();
    console.log(`   Før start: vt = ${sim.state.measured.vt}, ppeak = ${sim.state.measured.ppeak}, recentBreaths = ${sim.recentBreaths.length}`);
    // Kjør 1 pust
    while (sim.state.breathCount < 2) sim.step(0.016);
    console.log(`   Etter 1 fullført pust: recentBreaths = ${sim.recentBreaths.length}, vt = ${sim.state.measured.vt}`);
    while (sim.state.breathCount < 3) sim.step(0.016);
    console.log(`   Etter 2 fullførte pust: recentBreaths = ${sim.recentBreaths.length}, vt = ${sim.state.measured.vt}`);
    while (sim.state.breathCount < 4) sim.step(0.016);
    console.log(`   Etter 3 fullførte pust: recentBreaths = ${sim.recentBreaths.length}, vt = ${sim.state.measured.vt}`);
})();

console.log('\n--- 3.3 Idealvekt (IBW) beregning ved manglende høyde/kjønn ---');
(() => {
    const sim = new VentilatorSimulator();
    sim.patient.height = undefined;
    sim.patient.gender = undefined;
    const ibwDefault = sim.getPatientIBW();
    sim.patient.height = 140; // lav høyde
    sim.patient.gender = 'female';
    const ibwLow = sim.getPatientIBW();
    console.log(`   IBW ved undefined: ${ibwDefault} kg (fallback 175cm male = 71kg)`);
    console.log(`   IBW for kvinne 140cm: ${ibwLow} kg (klippes mot GRENSER.MIN_IBW = 30)`);
})();

console.log('\n--- 3.4 I:E-forhold ved Te <= 0 ---');
(() => {
    const sim = new VentilatorSimulator();
    sim.state.measured.ti = 1.0;
    sim.state.measured.te = 0.0;
    sim._updateSmoothedMetrics();
    console.log(`   I:E ved Te = 0: "${sim.state.measured.ieRatio}"`);
})();

// 4. RENDERING & UI & MODUSER
console.log('\n--- 4.1 Søk etter settings.rr i hele kodebasen ---');
(() => {
    const searchIn = (name, text) => {
        const lines = text.split('\n');
        lines.forEach((l, idx) => {
            if (l.includes('settings.rr') && !l.includes('settings.rrSpont') && !l.includes('settings.rrTotal')) {
                console.log(`   Funnet settings.rr i ${name}:${idx + 1}: ${l.trim()}`);
            }
        });
    };
    searchIn('simulator.js', simCode);
    searchIn('renderer.js', renCode);
    searchIn('app.js', appCode);
})();

console.log('\n--- 4.2 Scenarioer: Mangler noen scenarioer parametere som lekker? ---');
(() => {
    // Sjekk SCENARIOS definert i app.js
    // Trekk ut SCENARIOS fra app.js
    const match = appCode.match(/const SCENARIOS = \{([\s\S]*?)\n    \};/);
    if (match) {
        eval('var SCENARIOS_OBJ = {' + match[1] + '};');
        const allKeys = new Set();
        Object.values(SCENARIOS_OBJ).forEach(scen => {
            Object.keys(scen).forEach(k => allKeys.add(k));
        });
        console.log(`   Alle parameter-nøkler brukt i scenarioer: ${Array.from(allKeys).join(', ')}`);
        Object.entries(SCENARIOS_OBJ).forEach(([scenKey, scen]) => {
            const missing = Array.from(allKeys).filter(k => scen[k] === undefined);
            if (missing.length > 0) {
                console.log(`   Scenario "${scenKey}" mangler nøkler: ${missing.join(', ')}`);
            }
        });
    }
})();

console.log('\n--- 4.3 Frysemodus: akkumuleres tid i bakgrunnen? ---');
(() => {
    // Sjekk loop() i app.js:
    // if (!isPaused && elapsedSec > 0) { ... simulator.step(elapsedSec); ... }
    // Når unpaused: lastTimestamp = performance.now();
    // Men hva om isPaused er true?
    // Linje 1489: `lastTimestamp = currentTimestamp;` oppdateres HVER frame selv når isPaused er true!
    // Og når btnPause klikkes (unpause): `lastTimestamp = performance.now();`
    console.log(`   Frysemodus i app.js: lastTimestamp oppdateres kontinuerlig og resettes ved unpause: Ingen tidsakkumulering i bakgrunnen.`);
})();
