const fs = require('fs');

function testExactUserWaveform() {
    const riseTime = 0.80; // 800 ms
    const ipap = 14;
    const epap = 5;
    const pmusMax = 8.0;
    const tiNeural = 0.9;
    const compliance = 50;
    const resistance = 5;
    const cyclingPercent = 0.25;

    const C_L = compliance / 1000;
    const R_insp = resistance;
    const dt = 0.0002;
    const totalDuration = 1.4;

    let phase = 'inspiration';
    let timeInPhase = 0;
    let P_servo = epap;
    let dP_servo = 0.0;
    let P_aw = epap;
    let V = C_L * epap;
    let peakFlow = 0;

    const omega = 4.0 / riseTime;
    const zeta = 0.95;

    const records = [];

    for (let t = 0; t <= totalDuration; t += dt) {
        timeInPhase += dt;

        // Realistic neuromuscular activation with early peak (P0.1) and plateau:
        let pmus = 0;
        const tRise = 0.20 * tiNeural; // 0.18s
        const tHold = 0.55 * tiNeural; // 0.50s
        if (t < tRise) {
            pmus = pmusMax * Math.sin((Math.PI / 2) * (t / tRise));
        } else if (t < tHold) {
            pmus = pmusMax;
        } else if (t < tiNeural) {
            const relT = (t - tHold) / (tiNeural - tHold);
            pmus = pmusMax * Math.cos((Math.PI / 2) * relT);
        } else {
            pmus = 0;
        }

        // Servo pressure
        const P_target = (phase === 'inspiration') ? ipap : epap;
        const accel = omega * omega * (P_target - P_servo) - 2 * zeta * omega * dP_servo;
        dP_servo += accel * dt;
        P_servo += dP_servo * dt;

        const P_el = V / C_L;
        const R_eff = R_insp;

        // Flow starvation with throttled inspiratory valve:
        const riseFactor = (phase === 'inspiration') ? Math.max(0, (riseTime - 0.15) / 0.75) : 0;
        const starvationScale = 1.0 + 8.5 * riseFactor * (pmus > 0 ? Math.min(1.0, pmus / 2.0) : 0);
        const R_out_eff = 1.0 * starvationScale;

        const num = P_servo - R_out_eff * (pmus - P_el) / R_eff;
        const den = 1 + R_out_eff / R_eff;
        P_aw = num / den;

        const Q_lunge = (P_aw + pmus - P_el) / R_eff;
        V += Q_lunge * dt;

        if (phase === 'inspiration') {
            if (Q_lunge > peakFlow) peakFlow = Q_lunge;
            if (timeInPhase > 0.25 && Q_lunge <= peakFlow * cyclingPercent) {
                phase = 'expiration';
                timeInPhase = 0;
            }
        }

        if (Math.round(t * 10000) % 250 === 0) { // every 25 ms
            records.push({
                t: Math.round(t * 1000),
                phase: phase.substr(0, 3),
                Paw: parseFloat(P_aw.toFixed(2)),
                Pmus: parseFloat(pmus.toFixed(2)),
                Flow: parseFloat((Q_lunge * 60).toFixed(1)),
                Vol: Math.round((V - C_L * epap) * 1000)
            });
        }
    }

    console.log('=== EXACT USER WAVEFORM SIMULATION ===');
    records.slice(0, 36).forEach(r => {
        const pawScaled = Math.max(0, Math.round(r.Paw * 2));
        const pawBar = '#'.repeat(pawScaled);
        const flowOffset = 15;
        const flowScaled = Math.round(r.Flow / 2);
        const flowBar = r.Flow >= 0 
            ? ' '.repeat(flowOffset) + '|' + '+'.repeat(flowScaled)
            : ' '.repeat(Math.max(0, flowOffset + flowScaled)) + '-'.repeat(-flowScaled) + '|';
        console.log(`t: ${r.t.toString().padStart(4, ' ')}ms [${r.phase}] | Paw: ${r.Paw.toFixed(2).padStart(5, ' ')} | Pmus: ${r.Pmus.toFixed(2).padStart(5, ' ')} | Flow: ${r.Flow.toFixed(1).padStart(5, ' ')} L/min | ${pawBar.padEnd(30, ' ')} | ${flowBar}`);
    });
}

testExactUserWaveform();
