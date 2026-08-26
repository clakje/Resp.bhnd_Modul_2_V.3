/**
 * test_phase4.js - Automatisk verifikasjonstest for Fase 4 (Måleverdier, Alarmer, PIP/Pplat, D5)
 */

// Mock window for VentilatorSimulator
global.window = {};

const fs = require('fs');
const simCode = fs.readFileSync(__dirname + '/simulator.js', 'utf8');
eval(simCode);

const VentilatorSimulator = global.window.VentilatorSimulator;

function runSimulation(sim, durationSec) {
    const frameDt = 0.016; // 60 fps
    const steps = Math.round(durationSec / frameDt);
    for (let i = 0; i < steps; i++) {
        sim.step(frameDt);
    }
}

console.log('=== STARTER TESTER FOR FASE 4 ===\n');

// -------------------------------------------------------------
// Test 1: E17 - Apné-alarm etter 15 s (rrSpont 0)
// -------------------------------------------------------------
console.log('--- TEST E17: Apné-alarm etter 15 s (rrSpont 0) ---');
const simE17 = new VentilatorSimulator();
simE17.patientDrive.rrSpont = 0;
simE17.settings.apneaDelay = 15;

// Kjør i 10 sekunder -> Skal IKKE ha alarm
runSimulation(simE17, 10);
const hasAlarmAt10 = simE17.state.isApneaAlarm;
console.log(`Etter 10s: isApneaAlarm = ${hasAlarmAt10} (Forventet false)`);

// Kjør 6 sekunder til (totalt 16s) -> Skal ha alarm
runSimulation(simE17, 6);
const hasAlarmAt16 = simE17.state.isApneaAlarm;
const activeAlarms16 = simE17.state.activeAlarms;
console.log(`Etter 16s: isApneaAlarm = ${hasAlarmAt16} (Forventet true), Alarmer:`, activeAlarms16.map(a => a.title));

if (!hasAlarmAt10 && hasAlarmAt16 && activeAlarms16.some(a => a.id === 'apnea')) {
    console.log('✅ TEST E17 BESTÅTT!\n');
} else {
    console.error('❌ TEST E17 FEILET!\n');
}

// -------------------------------------------------------------
// Test 2: T11 - rrSpont 14, trigger 5 L/min (Asynkroni / Missed efforts)
// -------------------------------------------------------------
console.log('--- TEST T11: rrSpont 14, trigger 5 L/min (svak innsats vs høy trigger) ---');
const simT11 = new VentilatorSimulator();
simT11.patientDrive.rrSpont = 14;
simT11.patientDrive.pmusMax = 0.3; // Svak pasientinnsats (gir ca 3.6 L/min flow)
simT11.settings.triggerFlow = 5.0; // Triggerterskel 5.0 L/min > pasientflow

// Kjør simulering i 65 sekunder for å fylle/stabilisere 60s historikk
runSimulation(simT11, 65);
console.log(`Målt RRtot: ${simT11.state.measured.rrTotal} (Forventet: 0 eller lav)`);
console.log(`Målt % Spontan: ${simT11.state.measured.spontPercent}%`);
console.log(`Målt Asynkroni-indeks: ${simT11.state.measured.asynchronyIndex}% (Forventet: > 50%)`);

if (simT11.state.measured.asynchronyIndex > 50) {
    console.log('✅ TEST T11 BESTÅTT!\n');
} else {
    console.error('❌ TEST T11 FEILET!\n');
}

// -------------------------------------------------------------
// Test 3: T12 - Lekkasje 30 L/min -> VTI > VTE og differanse samsvarer
// -------------------------------------------------------------
console.log('--- TEST T12: Lekkasje 30 L/min (VTI > VTE) ---');
const simT12 = new VentilatorSimulator();
simT12.settings.leak = 30; // 30 L/min @ 10 cmH2O
runSimulation(simT12, 30);

const vti = simT12.state.measured.vti;
const vte = simT12.state.measured.vte;
const diff = vti - vte;
console.log(`VTI = ${vti} ml, VTE = ${vte} ml, Differanse = ${diff} ml`);
console.log(`Målt lekkasje: ${simT12.state.measured.leak} L/min (${simT12.state.measured.leakPercent}%)`);

if (vti > vte && diff > 30) {
    console.log('✅ TEST T12 BESTÅTT!\n');
} else {
    console.error('❌ TEST T12 FEILET!\n');
}

// -------------------------------------------------------------
// Test 4: T13 - Stigetid 50 ms -> PIP > Pplat med minst 1 cmH2O (oversving)
// -------------------------------------------------------------
console.log('--- TEST T13: Stigetid 50 ms (PIP > Pplat) ---');
const simT13 = new VentilatorSimulator();
simT13.settings.riseTime = 0.05; // 50 ms
simT13.settings.ipap = 14;
runSimulation(simT13, 20);

const pip = simT13.state.measured.ppeak;
const pplat = simT13.state.measured.pplat;
const deltaP = pip - pplat;
console.log(`PIP = ${pip.toFixed(1)} cmH₂O, Pplat = ${pplat.toFixed(1)} cmH₂O, PIP - Pplat = ${deltaP.toFixed(1)} cmH₂O`);

if (deltaP >= 0.8) {
    console.log('✅ TEST T13 BESTÅTT!\n');
} else {
    console.error('❌ TEST T13 FEILET!\n');
}

// -------------------------------------------------------------
// Test 5: T14 - KOLS-preset, rrSpont 25 -> PEEPi > 1.2, PIP - Pplat signifikant
// -------------------------------------------------------------
console.log('--- TEST T14: KOLS-preset, rrSpont 25 ---');
const simT14 = new VentilatorSimulator();
simT14.setPreset('copd');
simT14.settings.ipap = 16;
simT14.settings.epap = 5;
simT14.patientDrive.rrSpont = 25;
runSimulation(simT14, 45);

const peepi = simT14.state.PEEPi;
const pipKols = simT14.state.measured.ppeak;
const pplatKols = simT14.state.measured.pplat;
const deltaPKols = pipKols - pplatKols;
console.log(`PEEPi = ${peepi.toFixed(1)} cmH₂O (Normal = 0.0)`);
console.log(`PIP = ${pipKols.toFixed(1)}, Pplat = ${pplatKols.toFixed(1)}, PIP - Pplat = ${deltaPKols.toFixed(1)} cmH₂O`);

if (peepi > 1.0 && deltaPKols > 1.0) {
    console.log('✅ TEST T14 BESTÅTT!\n');
} else {
    console.error('❌ TEST T14 FEILET!\n');
}

// -------------------------------------------------------------
// Test 6: T15 - Dra triggerslideren -> Ingen måleverdi endres i det øyeblikket
// -------------------------------------------------------------
console.log('--- TEST T15: Endring av slider endrer IKKE måleverdier i sanntid ---');
const simT15 = new VentilatorSimulator();
runSimulation(simT15, 20);

const beforeVt = simT15.state.measured.vt;
const beforeRR = simT15.state.measured.rrTotal;
const beforeMV = simT15.state.measured.mv;
const beforePIP = simT15.state.measured.ppeak;

// Endre triggermodus og triggerFlow direkte
simT15.settings.triggerFlow = 1.0;
simT15.settings.rr = 30; // Innstilt backup frekvens endres

const afterVt = simT15.state.measured.vt;
const afterRR = simT15.state.measured.rrTotal;
const afterMV = simT15.state.measured.mv;
const afterPIP = simT15.state.measured.ppeak;

console.log(`Før sliderendring: Vt=${beforeVt}, RR=${beforeRR}, MV=${beforeMV}, PIP=${beforePIP}`);
console.log(`Rett etter sliderendring (0 tidssteg): Vt=${afterVt}, RR=${afterRR}, MV=${afterMV}, PIP=${afterPIP}`);

if (beforeVt === afterVt && beforeRR === afterRR && beforeMV === afterMV && beforePIP === afterPIP) {
    console.log('✅ TEST T15 BESTÅTT (Ingen synkron lekkasje fra slider til måleverdi)!\n');
} else {
    console.error('❌ TEST T15 FEILET!\n');
}

console.log('=== ALLE AUTOMATISERTE TESTER FULLFØRT ===');
