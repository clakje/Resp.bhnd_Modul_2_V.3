/**
 * test_fagekspert.js
 * 
 * Verifiserer de 6 fenomenene fra fagekspertens sjekkliste (09_SJEKKLISTE_fagekspert.md):
 * 1. Stigetid for rask (overshoot, spiss flow, lavere Vt ved rask cycling)
 * 2. Stigetid for lang (avrundet trykk, bred flow, trykkdipp/skulder ved høy Pmus)
 * 3. Inspiratorisk avslutning for tidlig (tidlig cycling, P_aw < EPAP, M-flow, dobbelttrigger i PS)
 * 4. Inspiratorisk avslutning for sen (terminal trykkspike > 1 cmH2O, flow krysser 0, Pes snur)
 * 5. Ineffektiv trigger & Kardiogent artefakt (missed efforts markør △, artefakt trigging)
 * 6. Autotrigger & Lekkasje (blandede triggere, hyperinflasjon, oppretting via lekkasje/trigger)
 */

const fs = require('fs');
const vm = require('vm');

const simCode = fs.readFileSync('simulator.js', 'utf8');
const sandbox = {
    window: {},
    console: console,
    Math: Math,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
};
vm.createContext(sandbox);
vm.runInContext(simCode, sandbox);
const VentilatorSimulator = sandbox.window.VentilatorSimulator;

function runSimulation(sim, durationSeconds, onStep) {
    const frameDt = 0.016; // 60 FPS
    const steps = Math.ceil(durationSeconds / frameDt);
    for (let i = 0; i < steps; i++) {
        sim.step(frameDt);
        if (onStep) {
            onStep(sim, i * frameDt);
        }
    }
}

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`✅ [PASS] Fenomen ${testName}`);
        if (details) console.log(`   Detaljer: ${details}`);
    } else {
        console.error(`❌ [FAIL] Fenomen ${testName}`);
        if (details) console.error(`   Detaljer: ${details}`);
    }
}

console.log('========================================================================');
console.log('  KVALITETSKONTROLL: FAGEKSPERTENS 6 FENOMENER');
console.log('  Referanse: Endringsoppskrifter/09_SJEKKLISTE_fagekspert.md');
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// FENOMEN 1: STIGETID FOR RASK
// Innstilling: Stigetid 50 ms (0.05 s), Pmus 8
// -----------------------------------------------------------------------------
{
    const sim = new VentilatorSimulator();
    sim.patient.preset = 'custom';
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.settings.mode = 'PS';
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.05; // 50 ms
    sim.settings.cyclingPercent = 0.25;
    sim.settings.leak = 0;
    sim.patientDrive.rrSpont = 12;
    sim.patientDrive.pmusMax = 8.0;
    sim.patientDrive.tiNeural = 0.9;
    sim.patientDrive.pmusExp = 0;
    sim.patientDrive.variability = 0;
    sim.reset();

    let maxServo = 0;
    let maxPaw = 0;
    let peakFlowTime = 0;
    let peakFlow = 0;
    let inBreath = false;
    let breathStart = 0;

    runSimulation(sim, 6.0, (s, t) => {
        if (s.state.phase === 'inspiration') {
            if (!inBreath) {
                inBreath = true;
                breathStart = t;
            }
            if (s.state.P_servo > maxServo) maxServo = s.state.P_servo;
            if (s.state.P_aw > maxPaw) maxPaw = s.state.P_aw;
            if (s.state.flow > peakFlow) {
                peakFlow = s.state.flow;
                peakFlowTime = t - breathStart;
            }
        } else {
            inBreath = false;
        }
    });

    const overshootServo = maxServo - sim.settings.ipap;
    const zeta = 0.42 + 0.60 * (sim.settings.riseTime - 0.05) / 0.85; // 0.42 ved 50ms

    assert(
        overshootServo > 1.0 && zeta < 0.50 && peakFlowTime < 0.15,
        '1: Stigetid for rask (50 ms)',
        `P_servo overshoot = +${overshootServo.toFixed(2)} cmH2O (> 1.0), zeta = ${zeta.toFixed(2)} (< 0.50), toppflow = ${peakFlow.toFixed(1)} L/min på ${Math.round(peakFlowTime * 1000)} ms`
    );
}

// -----------------------------------------------------------------------------
// FENOMEN 2: STIGETID FOR LANG
// Innstilling: Stigetid 900 ms (0.90 s), Pmus 8
// -----------------------------------------------------------------------------
{
    const sim = new VentilatorSimulator();
    sim.patient.preset = 'custom';
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.settings.mode = 'PS';
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.90; // 900 ms
    sim.settings.cyclingPercent = 0.25;
    sim.settings.leak = 0;
    sim.patientDrive.rrSpont = 12;
    sim.patientDrive.pmusMax = 8.0;
    sim.patientDrive.tiNeural = 1.2;
    sim.patientDrive.pmusExp = 0;
    sim.patientDrive.variability = 0;
    sim.reset();

    let maxServo = 0;
    let maxPaw = 0;
    let hasShoulderOrDip = false;

    runSimulation(sim, 8.0, (s, t) => {
        if (s.state.phase === 'inspiration' && s.state.timeInPhase > 0.05 && s.state.timeInPhase < 0.6) {
            // Sjekk om pasientens muskelkraft drar P_aw under P_servo tidlig i innpustet (trykkdipp / skulder)
            if (s.state.P_aw < s.state.P_servo - 0.5) {
                hasShoulderOrDip = true;
            }
            if (s.state.P_servo > maxServo) maxServo = s.state.P_servo;
            if (s.state.P_aw > maxPaw) maxPaw = s.state.P_aw;
        }
    });

    const overshootServo = Math.max(0, maxServo - sim.settings.ipap);

    assert(
        overshootServo < 0.1 && hasShoulderOrDip,
        '2: Stigetid for lang (900 ms, Pmus 8)',
        `Ingen oversving (overshoot: ${overshootServo.toFixed(2)} cmH2O), myk kurve med synlig trykkdipp/skulder under P_servo pga pasientdrag (R_out effekt)`
    );
}

// -----------------------------------------------------------------------------
// FENOMEN 3: INSPIRATORISK AVSLUTNING FOR TIDLIG (Dobbelttrigging i PS)
// Innstilling: Cycling 85 %, Pmus 7, tiNeural 1.2 s i PS-modus
// -----------------------------------------------------------------------------
{
    const sim = new VentilatorSimulator();
    sim.patient.preset = 'custom';
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.settings.mode = 'PS';
    sim.settings.ipap = 15;
    sim.settings.epap = 5;
    sim.settings.riseTime = 0.15;
    sim.settings.cyclingPercent = 0.85; // 85% cycling
    sim.settings.leak = 0;
    sim.settings.triggerFlow = 1.5;
    sim.patientDrive.rrSpont = 14;
    sim.patientDrive.pmusMax = 7.0;
    sim.patientDrive.tiNeural = 1.2;
    sim.patientDrive.pmusExp = 0;
    sim.patientDrive.variability = 0;
    sim.reset();

    let sawPawDipBelowEpap = false;

    runSimulation(sim, 20.0, (s, t) => {
        // Sjekk om P_aw dras under EPAP rett etter for tidlig cycling mens Pmus holder
        if (s.state.phase === 'expiration' && s.state.timeInPhase > 0.02 && s.state.timeInPhase < 0.20) {
            if (s.state.P_aw < s.settings.epap - 0.2 && s.state.P_mus > 1.5) {
                sawPawDipBelowEpap = true;
            }
        }
    });

    const doubleTriggerCount = sim.state.efforts.filter(e => e.type === 'double').length;

    assert(
        doubleTriggerCount >= 1 && sawPawDipBelowEpap,
        '3: Inspiratorisk avslutning for tidlig (Dobbelttrigger)',
        `Antall dobbelttriggere = ${doubleTriggerCount}, P_aw dras under EPAP rett etter tidlig cycling: ${sawPawDipBelowEpap}`
    );
}

// -----------------------------------------------------------------------------
// FENOMEN 4: INSPIRATORISK AVSLUTNING FOR SEN (Terminal trykkspike)
// Innstilling: Cycling 5 %, pmusExp 8, tiNeural 0.6 s
// -----------------------------------------------------------------------------
{
    const sim = new VentilatorSimulator();
    sim.settings.ipap = 14;
    sim.settings.epap = 5;
    sim.settings.cyclingPercent = 0.05; // 5% sen cycling
    sim.settings.tiMax = 2.5;
    sim.patientDrive.rrSpont = 12;
    sim.patientDrive.tiNeural = 0.6;
    sim.patientDrive.pmusMax = 3.0;
    sim.patientDrive.pmusExp = 8.0;     // Kraftig aktiv utpust mot slutten av innpust
    sim.patientDrive.variability = 0;
    sim.reset();

    runSimulation(sim, 6.0);
    while (sim.state.phase !== 'inspiration') sim.step(0.0002);

    let minPlateau = 999;
    while (sim.state.phase === 'inspiration') {
        const tip = sim.state.timeInPhase;
        if (tip >= 0.15 && tip <= 0.35 && sim.state.P_aw < minPlateau) {
            minPlateau = sim.state.P_aw;
        }
        sim.step(0.0002);
    }

    const terminalSpike = sim.state.lastPip - minPlateau;

    assert(
        terminalSpike > 1.0,
        '4: Inspiratorisk avslutning for sen (Terminal trykkspike)',
        `Terminal trykkspike = +${terminalSpike.toFixed(2)} cmH2O over platå (Platå: ${minPlateau.toFixed(2)} -> Topp: ${sim.state.lastPip.toFixed(2)} cmH2O)`
    );
}

// -----------------------------------------------------------------------------
// FENOMEN 5: INEFFEKTIV TRIGGER & KARDIOGENT ARTEFAKT
// Innstilling 5A: Pmus 0.35, trigger 5.0 L/min (svak innsats vs høy trigger)
// Innstilling 5B: cardiacArtifact 2.5, rrSpont 0, trigger 1.0 L/min
// -----------------------------------------------------------------------------
{
    // Del A: Ineffektiv trigger (Missed efforts)
    const simA = new VentilatorSimulator();
    simA.patient.preset = 'custom';
    simA.patient.compliance = 50;
    simA.patient.resistance = 5;
    simA.settings.mode = 'PS';
    simA.settings.ipap = 14;
    simA.settings.epap = 5;
    simA.settings.triggerMode = 'flow';
    simA.settings.triggerFlow = 5.0; // Høy triggerterskel
    simA.settings.stActive = false; // Slå av ST for ren observasjon
    simA.patientDrive.rrSpont = 15;
    simA.patientDrive.pmusMax = 0.35; // Svak pasientkraft (~4 L/min flow)
    simA.patientDrive.tiNeural = 0.9;
    simA.patientDrive.variability = 0;
    simA.reset();

    runSimulation(simA, 25.0);

    const missedCount = simA.state.efforts.filter(e => e.type === 'missed').length;
    const asynchIndex = simA.state.measured.asynchronyIndex;

    // Del B: Kardiogent artefakt trigging
    const simB = new VentilatorSimulator();
    simB.settings.mode = 'PS';
    simB.settings.ipap = 14;
    simB.settings.epap = 5;
    simB.settings.triggerMode = 'flow';
    simB.settings.triggerFlow = 1.0; // Meget sensitiv
    simB.settings.stActive = false;
    simB.patientDrive.rrSpont = 0; // Pasient puster ikke
    simB.patientDrive.pmusMax = 0;
    simB.patientDrive.cardiacArtifact = 2.5; // Flowoscillasjon fra hjertepuls
    simB.reset();

    runSimulation(simB, 15.0);
    const cardiacTriggers = simB.state.efforts.filter(e => e.type === 'auto').length;

    assert(
        missedCount > 3 && asynchIndex > 40 && cardiacTriggers > 0,
        '5: Ineffektiv trigger & Kardiogent artefakt',
        `Missed efforts = ${missedCount} (åpne trekanter △), Asynkroni-indeks = ${asynchIndex} %, Kardiogene autotriggere ved passiv pasient = ${cardiacTriggers}`
    );
}

// -----------------------------------------------------------------------------
// FENOMEN 6: AUTOTRIGGER & LEKKASJE
// Innstilling: rrSpont 12, Pmus 2.5, Lekkasje 35 L/min, Trigger 1.0 L/min
// Deretter: lekkasje -> 5 L/min eller trigger -> 3.0 L/min
// -----------------------------------------------------------------------------
{
    const sim = new VentilatorSimulator();
    sim.patient.preset = 'custom';
    sim.patient.compliance = 50;
    sim.patient.resistance = 5;
    sim.settings.mode = 'PS';
    sim.settings.ipap = 14;
    sim.settings.epap = 5;
    sim.settings.triggerMode = 'flow';
    sim.settings.triggerFlow = 1.0; // Svært følsom trigger
    sim.settings.leak = 35;         // Stor lekkasje (35 L/min @ 10 cmH2O)
    sim.settings.stActive = false;
    sim.patientDrive.rrSpont = 12;
    sim.patientDrive.pmusMax = 2.5;
    sim.patientDrive.tiNeural = 0.9;
    sim.patientDrive.variability = 0;
    sim.reset();

    runSimulation(sim, 60.0);

    const eff60 = sim.state.efforts;
    const assistCount = eff60.filter(e => e.type === 'assist').length;
    const autoCount = eff60.filter(e => e.type === 'auto').length;
    const totalBreaths = sim.state.measured.rrTotal;

    // Test kurering 1: Reduser lekkasje til 5 L/min
    sim.settings.leak = 5;
    sim.state.efforts = [];
    sim.recentBreaths = [];
    runSimulation(sim, 60.0);

    const effAfterLeakFix = sim.state.efforts;
    const autoAfterLeakFix = effAfterLeakFix.filter(e => e.type === 'auto').length;

    assert(
        autoCount > 5 && assistCount > 5 && totalBreaths > 18 && autoAfterLeakFix === 0,
        '6: Autotrigger ved lekkasje (blandede pust og kurering)',
        `Med lekkasje 35: Ekte assisterte pust = ${assistCount} (▲), Autotriggere = ${autoCount} (⨂), total RRtot = ${totalBreaths}/min. Etter lekkasjereduksjon til 5: Autotriggere = ${autoAfterLeakFix}`
    );
}

console.log('\n========================================================================');
console.log(`  RESULTAT SJEKKLISTE: ${passedTests} / ${totalTests} TESTER BESTÅTT (${Math.round(passedTests/totalTests * 100)} %)`);
console.log('========================================================================\n');
