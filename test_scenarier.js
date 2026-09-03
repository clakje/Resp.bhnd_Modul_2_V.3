/**
 * test_scenarier.js - Kontrakttester per scenario som pedagogisk forpliktelse
 * i henhold til FASE 6 (Oppgave 6.2).
 * 
 * Verifiserer at hvert scenarios undervisningsinnhold og kliniske bilde
 * oppfylles av fysikkmotoren, samt at alle scenarioparametere treffer gyldige slidersteg.
 * 
 * Kjøres med: node test_scenarier.js
 */

const fs = require('fs');
const path = require('path');

// 1. Last inn simulatoren
global.window = {};
eval(fs.readFileSync(path.join(__dirname, 'simulator.js'), 'utf8'));
const VentilatorSimulator = global.window.VentilatorSimulator;

// 2. Hent SCENARIOS direkte fra app.js slik at testen alltid kjører mot de verdiene
//    applikasjonen faktisk bruker — ikke mot en kopi som kan komme ut av takt.
const appSrc = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const start = appSrc.indexOf('const SCENARIOS = {');
const end = appSrc.indexOf('// TOAST NOTIFIKASJONER', start);
let blokk = appSrc.slice(start, end);
blokk = blokk.slice(0, blokk.lastIndexOf('};') + 2);
const SCENARIOS = eval('(' + blokk.replace('const SCENARIOS = ', '').replace(/;\s*$/, '') + ')');

console.log('========================================================================');
console.log('  SCENARIOKONTRAKTER: PEDAGOGISK TESTBATTERI (S1 – S13)');
console.log('  Referanse: FASE_06_TESTER.md');
console.log('========================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function record(id, title, success, detail, expected) {
    totalTests++;
    if (success) {
        passedTests++;
        console.log(`✅ [PASS] ${id}: ${title}`);
    } else {
        failedTests++;
        console.error(`❌ [FAIL] ${id}: ${title}`);
    }
    if (detail) console.log(`   Måling:    ${detail}`);
    if (expected) console.log(`   Forventet: ${expected}\n`);
    else console.log('');
    testResults.push({ id, title, success, detail, expected });
}

// Hjelpefunksjon: Bygg en simulator fra en scenariodefinisjon
function createSimulator(scen) {
    const sim = new VentilatorSimulator();
    sim.settings.mode = scen.mode || 'PS';
    sim.settings.ipap = scen.ipap;
    sim.settings.epap = scen.epap;
    sim.settings.rr = scen.rr !== undefined ? scen.rr : 12;
    sim.settings.fio2 = scen.fio2 !== undefined ? scen.fio2 : 30;
    sim.settings.riseTime = scen.riseTime / 1000;          // ms -> s
    sim.settings.cyclingPercent = scen.cycling / 100;      // % -> brøk
    sim.settings.tiSet = scen.tiSet !== undefined ? scen.tiSet : 1.0;
    sim.settings.tiMax = scen.tiMax !== undefined ? scen.tiMax : 2.0;
    sim.settings.leak = scen.leak !== undefined ? scen.leak : 0;
    sim.settings.triggerMode = scen.triggerMode || 'flow';
    if (sim.settings.triggerMode === 'flow') {
        sim.settings.triggerFlow = scen.triggerVal;
    } else {
        sim.settings.triggerPressure = scen.triggerVal;
    }
    sim.settings.stActive = !!scen.stActive;
    sim.settings.backupRate = scen.backupRate !== undefined ? scen.backupRate : 12;

    sim.patient.compliance = scen.compliance;
    sim.patient.resistance = scen.resistance;
    sim.patient.expRatio = scen.expRatio;
    sim.patient.flowLimitation = scen.flowLimitation !== undefined ? scen.flowLimitation : 0.0;
    sim.patient.height = scen.height !== undefined ? scen.height : 175;
    sim.patient.gender = scen.gender || 'male';

    sim.patientDrive.rrSpont = scen.rrSpont;
    sim.patientDrive.pmusMax = scen.pmus;
    sim.patientDrive.tiNeural = scen.tiNeural;
    sim.patientDrive.pmusExp = scen.pmusExp;
    sim.patientDrive.variability = scen.variability;
    sim.patientDrive.cardiacArtifact = scen.cardiac !== undefined ? scen.cardiac : 0.0;

    sim.reset();
    return sim;
}

// Kjør et scenario i 100 sekunder med dt = 1/60 og les av over de siste 60 sekundene (t >= 40s).
// For å håndtere stokastisk biologisk variabilitet kjøres testen over `runs` repetisjoner
// og medianen evalueres.
function runScenario(scenKey, runs = 5) {
    const scen = SCENARIOS[scenKey];
    if (!scen) throw new Error(`Scenario ${scenKey} finnes ikke i SCENARIOS.`);

    const results = [];

    for (let r = 0; r < runs; r++) {
        const sim = createSimulator(scen);
        const dt = 1 / 60;
        let maxPdiff = 0;
        let maxPaw = 0;
        let leakSum = 0;
        let leakCount = 0;
        const inspStartFlows = [];

        for (let i = 0; i < 6000; i++) {
            const t = sim.state.totalTime;
            const isEffortStart = (sim.patientDrive.timeInCycle < dt && sim.patientDrive.rrSpont > 0);
            if (t >= 40 && isEffortStart) {
                inspStartFlows.push(sim.state.flow_lung);
            }

            sim.step(dt);

            if (t >= 40) {
                if (sim.state.phase === 'inspiration') {
                    const pdiff = sim.state.P_servo - sim.state.P_aw;
                    if (pdiff > maxPdiff) maxPdiff = pdiff;
                }
                if (sim.state.P_aw > maxPaw) maxPaw = sim.state.P_aw;
                leakSum += sim.state.measured.leak;
                leakCount++;
            }
        }

        const eff60 = sim.state.efforts.filter(e => e.t >= 40);
        const missed = eff60.filter(e => e.type === 'missed').length;
        const assist = eff60.filter(e => e.type === 'assist').length;
        const double = eff60.filter(e => e.type === 'double').length;
        const auto = eff60.filter(e => e.type === 'auto').length;
        const mand = eff60.filter(e => e.type === 'mandatory').length;
        const patientEff = assist + double + missed;
        const fanget = patientEff > 0 ? ((assist + double) / patientEff) * 100 : 100;

        const b60 = sim.recentBreaths;
        const meanTi60 = b60.length > 0 ? (b60.reduce((s, b) => s + b.ti, 0) / b60.length) : sim.state.measured.ti;
        const tiMaxCount = b60.filter(b => b.cycleReason === 'tiMax').length;

        const medianFlowAtEffortStart = inspStartFlows.length > 0
            ? inspStartFlows.slice().sort((a, b) => a - b)[Math.floor(inspStartFlows.length / 2)]
            : 0;

        results.push({
            vt: sim.state.measured.vt,
            fanget,
            ai: sim.state.measured.asynchronyIndex,
            peepi: sim.state.measured.peepi,
            rrtot: sim.state.measured.rrTotal,
            rrSpont: sim.patientDrive.rrSpont,
            ti: meanTi60,
            tiNeural: scen.tiNeural,
            missed,
            double,
            auto,
            mand,
            spontPct: sim.state.measured.spontPercent,
            leak: leakCount > 0 ? (leakSum / leakCount) : sim.state.measured.leak,
            tiMaxCount,
            maxPdiff,
            maxPaw,
            ipap: scen.ipap,
            flowAtStart: medianFlowAtEffortStart,
            isApneaAlarm: sim.state.isApneaAlarm
        });
    }

    const median = (arr, key) => {
        const sorted = arr.map(x => x[key]).sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
    };

    return {
        vt: median(results, 'vt'),
        fanget: median(results, 'fanget'),
        ai: median(results, 'ai'),
        peepi: median(results, 'peepi'),
        rrtot: median(results, 'rrtot'),
        rrSpont: results[0].rrSpont,
        ti: median(results, 'ti'),
        tiNeural: results[0].tiNeural,
        missed: median(results, 'missed'),
        double: median(results, 'double'),
        auto: median(results, 'auto'),
        mand: median(results, 'mand'),
        spontPct: median(results, 'spontPct'),
        leak: median(results, 'leak'),
        tiMaxCount: median(results, 'tiMaxCount'),
        maxPdiff: median(results, 'maxPdiff'),
        maxPaw: median(results, 'maxPaw'),
        ipap: results[0].ipap,
        flowAtStart: median(results, 'flowAtStart'),
        isApneaAlarm: results.some(r => r.isApneaAlarm)
    };
}

// -----------------------------------------------------------------------------
// S1: wellAdjusted (Godt tilpasset NIV)
// Kontrakt: Vt 430–590 ml · fanget 100 % · asynkroni-indeks 0 % · PEEPi < 0,5
// -----------------------------------------------------------------------------
(() => {
    const res = runScenario('wellAdjusted');
    const pass = res.vt >= 430 && res.vt <= 590 &&
                 res.fanget === 100 &&
                 res.ai === 0 &&
                 res.peepi < 0.5;
    record('S1', 'wellAdjusted (Godt tilpasset NIV)', pass,
        `Vt = ${res.vt} ml, Fanget = ${res.fanget.toFixed(0)} %, AI = ${res.ai} %, PEEPi = ${res.peepi.toFixed(1)} cmH2O`,
        `Vt 430–590 ml · fanget 100 % · AI 0 % · PEEPi < 0.5`);
})();

// -----------------------------------------------------------------------------
// S2: mildlySedated (Lungefrisk, lett sedert)
// Kontrakt: Vt 470–630 ml · fanget 100 % · asynkroni-indeks 0 % · PEEPi < 0,5
// -----------------------------------------------------------------------------
(() => {
    const res = runScenario('mildlySedated');
    const pass = res.vt >= 470 && res.vt <= 630 &&
                 res.fanget === 100 &&
                 res.ai === 0 &&
                 res.peepi < 0.5;
    record('S2', 'mildlySedated (Lungefrisk, lett sedert)', pass,
        `Vt = ${res.vt} ml, Fanget = ${res.fanget.toFixed(0)} %, AI = ${res.ai} %, PEEPi = ${res.peepi.toFixed(1)} cmH2O`,
        `Vt 470–630 ml · fanget 100 % · AI 0 % · PEEPi < 0.5`);
})();

// -----------------------------------------------------------------------------
// S3: slowTrigger (For ufølsom trigger)
// Kontrakt: fanget 40–72 % · minst 6 missed per 60 s · Vt < 380 ml · RRtot minst 8 lavere enn rrSpont
// -----------------------------------------------------------------------------
(() => {
    const res = runScenario('slowTrigger');
    const rrDiff = res.rrSpont - res.rrtot;
    const pass = res.fanget >= 40 && res.fanget <= 72 &&
                 res.missed >= 6 &&
                 res.vt < 380 &&
                 rrDiff >= 8;
    record('S3', 'slowTrigger (For ufølsom trigger)', pass,
        `Fanget = ${res.fanget.toFixed(0)} %, Missed = ${res.missed}, Vt = ${res.vt} ml, RRtot = ${res.rrtot} vs rrSpont = ${res.rrSpont} (diff: ${rrDiff})`,
        `fanget 40–72 % · minst 6 missed · Vt < 380 ml · RRtot minst 8 lavere enn rrSpont`);
})();

// -----------------------------------------------------------------------------
// S4: autotrigger (Autotrigging)
// Kontrakt: minst 6 auto per 60 s · RRtot større enn rrSpont · målt lekkasje > 35 L/min · minst 8 pust avsluttet på tiMax
// Merk: Tester ikke på fanget-andel pga. lite utvalg ved drive 8/min.
// -----------------------------------------------------------------------------
(() => {
    const res = runScenario('autotrigger', 5);
    const pass = res.auto >= 6 &&
                 res.rrtot > res.rrSpont &&
                 res.leak > 35 &&
                 res.tiMaxCount >= 8;
    record('S4', 'autotrigger (Autotrigging)', pass,
        `Auto = ${res.auto}, RRtot = ${res.rrtot} > rrSpont ${res.rrSpont}, Lekkasje = ${res.leak.toFixed(1)} L/min, TiMax-avbrudd = ${res.tiMaxCount}`,
        `minst 6 auto · RRtot > rrSpont · målt lekkasje > 35 L/min · minst 8 pust på tiMax`);
})();

// -----------------------------------------------------------------------------
// S5: slowRise (Stigetid for treg)
// Kontrakt: maks (P_servo − P_aw) under inspirasjon > 2,5 cmH₂O · fanget 100 % · Ti < 0,85 s
// -----------------------------------------------------------------------------
(() => {
    const res = runScenario('slowRise');
    const pass = res.maxPdiff > 2.5 &&
                 res.fanget === 100 &&
                 res.ti < 0.85;
    record('S5', 'slowRise (Stigetid for treg)', pass,
        `Maks P_servo - P_aw = ${res.maxPdiff.toFixed(2)} cmH2O, Fanget = ${res.fanget.toFixed(0)} %, Ti = ${res.ti.toFixed(2)} s`,
        `maks (P_servo − P_aw) > 2.5 cmH2O · fanget 100 % · Ti < 0.85 s`);
})();

// -----------------------------------------------------------------------------
// S6: fastRise (Stigetid for rask)
// Kontrakt: maks P_aw minst 0,8 cmH₂O over innstilt IPAP · fanget 100 %
// -----------------------------------------------------------------------------
(() => {
    const res = runScenario('fastRise');
    const overshoot = res.maxPaw - res.ipap;
    const pass = overshoot >= 0.8 && res.fanget === 100;
    record('S6', 'fastRise (Stigetid for rask)', pass,
        `Maks Paw = ${res.maxPaw.toFixed(2)} cmH2O (oversving: +${overshoot.toFixed(2)} cmH2O over IPAP ${res.ipap}), Fanget = ${res.fanget.toFixed(0)} %`,
        `maks P_aw minst 0.8 cmH2O over innstilt IPAP · fanget 100 %`);
})();

// -----------------------------------------------------------------------------
// S7: earlyCycle (For tidlig avslutning)
// Kontrakt: 4–14 double per 60 s · RRtot minst 4 høyere enn rrSpont · Vt < 430 ml
// -----------------------------------------------------------------------------
(() => {
    const res = runScenario('earlyCycle', 5);
    const rrDiff = res.rrtot - res.rrSpont;
    const pass = res.double >= 4 && res.double <= 14 &&
                 rrDiff >= 4 &&
                 res.vt < 430;
    record('S7', 'earlyCycle (For tidlig avslutning)', pass,
        `Dobbelttriggere = ${res.double}, RRtot = ${res.rrtot} vs rrSpont = ${res.rrSpont} (diff: +${rrDiff}), Vt = ${res.vt} ml`,
        `4–14 double · RRtot minst 4 høyere enn rrSpont · Vt < 430 ml`);
})();

// -----------------------------------------------------------------------------
// S8: lateCycle (For sen avslutning)
// Kontrakt: målt Ti minst 2,5× nevral Ti · Ti > 1,6 s · maks P_aw over innstilt IPAP
// -----------------------------------------------------------------------------
(() => {
    const res = runScenario('lateCycle', 5);
    const tiRatio = res.ti / res.tiNeural;
    const pass = tiRatio >= 2.5 &&
                 res.ti > 1.6 &&
                 res.maxPaw > res.ipap;
    record('S8', 'lateCycle (For sen avslutning)', pass,
        `Målt Ti = ${res.ti.toFixed(2)} s (forhold til nevral ${res.tiNeural} s: ${tiRatio.toFixed(1)}×), Maks Paw = ${res.maxPaw.toFixed(2)} > IPAP ${res.ipap}`,
        `målt Ti minst 2.5× nevral Ti · Ti > 1.6 s · maks P_aw over innstilt IPAP`);
})();

// -----------------------------------------------------------------------------
// S9: copdAutoPeep (KOLS med auto-PEEP)
// Kontrakt: PEEPi 3,2–6,2 · fanget 35–65 % · ekspirasjonsflow ved neste pustestart mer negativ enn −3 L/min · Vt < 400 ml
// -----------------------------------------------------------------------------
let copdAutoPeepResult = null;
(() => {
    copdAutoPeepResult = runScenario('copdAutoPeep', 5);
    const res = copdAutoPeepResult;
    const pass = res.peepi >= 3.2 && res.peepi <= 6.2 &&
                 res.fanget >= 35 && res.fanget <= 65 &&
                 res.flowAtStart < -3.0 &&
                 res.vt < 400;
    record('S9', 'copdAutoPeep (KOLS med auto-PEEP)', pass,
        `PEEPi = ${res.peepi.toFixed(1)} cmH2O, Fanget = ${res.fanget.toFixed(0)} %, Flow ved pustestart = ${res.flowAtStart.toFixed(1)} L/min, Vt = ${res.vt} ml`,
        `PEEPi 3.2–6.2 · fanget 35–65 % · ekspirasjonsflow ved pustestart < -3 L/min · Vt < 400 ml`);
})();

// -----------------------------------------------------------------------------
// S10: copdAdjusted (Hyperkapnisk KOLS, behandlet)
// Kontrakt: PEEPi lavere enn i copdAutoPeep · fanget 100 % · asynkroni-indeks 0 % · Vt høyere enn i copdAutoPeep
// -----------------------------------------------------------------------------
(() => {
    const res = runScenario('copdAdjusted', 5);
    const prev = copdAutoPeepResult || runScenario('copdAutoPeep', 5);
    const pass = res.peepi < prev.peepi &&
                 res.fanget === 100 &&
                 res.ai === 0 &&
                 res.vt > prev.vt;
    record('S10', 'copdAdjusted (Hyperkapnisk KOLS, behandlet)', pass,
        `PEEPi = ${res.peepi.toFixed(1)} (fra ${prev.peepi.toFixed(1)}), Fanget = ${res.fanget.toFixed(0)} %, AI = ${res.ai} %, Vt = ${res.vt} ml (fra ${prev.vt} ml)`,
        `PEEPi lavere enn i copdAutoPeep · fanget 100 % · AI 0 % · Vt høyere enn i copdAutoPeep`);
})();

// -----------------------------------------------------------------------------
// S11: KOLS Lungemekanikk kontrakt
// Kontrakt: Identisk compliance, resistance, expRatio og flowLimitation i copdAdjusted og copdAutoPeep
// -----------------------------------------------------------------------------
(() => {
    const s1 = SCENARIOS.copdAutoPeep;
    const s2 = SCENARIOS.copdAdjusted;
    const sameC = s1.compliance === s2.compliance;
    const sameR = s1.resistance === s2.resistance;
    const sameExp = s1.expRatio === s2.expRatio;
    const sameFl = s1.flowLimitation === s2.flowLimitation;
    const pass = sameC && sameR && sameExp && sameFl;
    record('S11', 'KOLS lungemekanikk kontrakt (copdAutoPeep vs copdAdjusted)', pass,
        `C: ${s1.compliance} == ${s2.compliance}, R: ${s1.resistance} == ${s2.resistance}, expRatio: ${s1.expRatio} == ${s2.expRatio}, flowLimitation: ${s1.flowLimitation} == ${s2.flowLimitation}`,
        `Identisk compliance, resistance, expRatio og flowLimitation`);
})();

// -----------------------------------------------------------------------------
// S12: lowDrive (Redusert respirasjonsdrive)
// Kontrakt: minst 10 mandatory per 60 s · spontPercent < 20 · ingen apné-alarm · Vt 450–620 ml
// Merk: Tester ikke på fanget-andel.
// -----------------------------------------------------------------------------
(() => {
    const res = runScenario('lowDrive', 5);
    const pass = res.mand >= 10 &&
                 res.spontPct < 20 &&
                 !res.isApneaAlarm &&
                 res.vt >= 450 && res.vt <= 620;
    record('S12', 'lowDrive (Redusert respirasjonsdrive)', pass,
        `Mandatory = ${res.mand}, % Spontan = ${res.spontPct} %, Apné-alarm = ${res.isApneaAlarm}, Vt = ${res.vt} ml`,
        `minst 10 mandatory · spontPercent < 20 · ingen apné-alarm · Vt 450–620 ml`);
})();

// -----------------------------------------------------------------------------
// S13: Kryssende kontrakt: Stegvalidering for alle elleve scenarier
// Kontrakt: Hvert scenario og hvert parameter treffer et gyldig slidersteg i index.html
// -----------------------------------------------------------------------------
(() => {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

    // Regex for å hente ut min, max og step fra <input type="range" id="...">
    const sliderConfigs = {};
    const inputRegex = /<input\b[^>]*>/gi;
    let match;
    while ((match = inputRegex.exec(html)) !== null) {
        const tag = match[0];
        if (!tag.includes('type="range"') && !tag.includes("type='range'")) continue;
        const idMatch = tag.match(/id=["']([^"']+)["']/i);
        const minMatch = tag.match(/min=["']([^"']+)["']/i);
        const maxMatch = tag.match(/max=["']([^"']+)["']/i);
        const stepMatch = tag.match(/step=["']([^"']+)["']/i);
        if (idMatch && minMatch && maxMatch && stepMatch) {
            sliderConfigs[idMatch[1]] = {
                min: parseFloat(minMatch[1]),
                max: parseFloat(maxMatch[1]),
                step: parseFloat(stepMatch[1])
            };
        }
    }

    const PARAM_MAP = {
        ipap: 'sliderIpap',
        epap: 'sliderEpap',
        rr: 'sliderRR',
        riseTime: 'sliderRiseTime',
        cycling: 'sliderCycling',
        tiMax: 'sliderTiMax',
        tiSet: 'sliderTiSet',
        leak: 'sliderLeak',
        backupRate: 'sliderBackupRate',
        compliance: 'sliderCompliance',
        resistance: 'sliderResistance',
        expRatio: 'sliderExpRatio',
        flowLimitation: 'sliderFlowLimitation',
        rrSpont: 'sliderRrSpont',
        pmus: 'sliderPmus',
        tiNeural: 'sliderTiNeural',
        pmusExp: 'sliderPmusExp',
        variability: 'sliderVariability',
        height: 'sliderHeight',
        cardiac: 'sliderCardiacArtifact',
        triggerVal: 'sliderTrigger'
    };

    const invalidSteps = [];
    for (const [scenKey, scen] of Object.entries(SCENARIOS)) {
        for (const [paramKey, sliderId] of Object.entries(PARAM_MAP)) {
            const verdi = scen[paramKey];
            if (verdi === undefined) continue;
            const cfg = sliderConfigs[sliderId];
            if (!cfg) {
                invalidSteps.push(`${scenKey}.${paramKey}: Fant ikke ${sliderId} i index.html`);
                continue;
            }
            const { min, max, step } = cfg;
            const n = (verdi - min) / step;
            const gyldig = Math.abs(n - Math.round(n)) < 1e-9 && verdi >= min && verdi <= max;
            if (!gyldig) {
                invalidSteps.push(`${scenKey}.${paramKey} = ${verdi} (slider ${sliderId}: min ${min}, max ${max}, step ${step})`);
            }
        }
    }

    const pass = invalidSteps.length === 0;
    record('S13', 'Stegvalidering for alle 11 scenarier mot index.html', pass,
        pass ? `Alle parametere i alle 11 scenarier treffer gyldige slidersteg (${Object.keys(sliderConfigs).length} slidere validert)` : `Ugyldige steg: ${invalidSteps.join(', ')}`,
        `Alle scenarioparametere treffer et eksakt slidersteg definert i index.html`);
})();

console.log('========================================================================');
console.log(`  VALIDERINGSRESULTAT: ${passedTests} / ${totalTests} KONTRAKTER BESTÅTT (${Math.round(passedTests / totalTests * 100)} %)`);
console.log('========================================================================');

if (failedTests > 0) {
    console.error(`\nFEIL: ${failedTests} kontrakt(er) feilet.`);
    process.exit(1);
} else {
    console.log('\n🌟 SUKSESS: ALLE 13 SCENARIOKONTRAKTER (S1–S13) ER 100% BESTÅTT!\n');
    process.exit(0);
}
