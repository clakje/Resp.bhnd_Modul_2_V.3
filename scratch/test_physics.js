const fs = require('fs');

function testDip(rOutVal, pmusProfile) {
    const riseTime = 0.80; // 800 ms
    const ipap = 14;
    const epap = 5;
    const pmusMax = 8.0;
    const tiNeural = 0.9;
    const compliance = 50;
    const resistance = 5;

    const C_L = compliance / 1000;
    const R_insp = resistance;
    const dt = 0.0002;
    const totalDuration = 1.2;

    let P_servo = epap;
    let dP_servo = 0.0;
    let P_aw = epap;
    let V = C_L * epap;
    let minPaw = epap;
    let minPawTime = 0;

    const omega = 4.0 / riseTime;
    const zeta = 0.95;

    const records = [];

    for (let t = 0; t <= totalDuration; t += dt) {
        let pmus = 0;
        if (t < tiNeural) {
            if (pmusProfile === 'sinusoidal') {
                // Sinusoidal
                pmus = pmusMax * Math.sin((Math.PI / 2) * Math.min(1.0, t / (0.45 * tiNeural)));
            } else if (pmusProfile === 'fast_rise') {
                // Standard physiological high-drive: fast onset over 0.2s then plateau
                const tRise = 0.25;
                if (t < tRise) {
                    pmus = pmusMax * (0.5 - 0.5 * Math.cos(Math.PI * t / tRise));
                } else {
                    pmus = pmusMax;
                }
            } else {
                pmus = (t < 0.75 * tiNeural) ? pmusMax * (t / (0.75 * tiNeural)) : pmusMax;
            }
        }

        const accel = omega * omega * (ipap - P_servo) - 2 * zeta * omega * dP_servo;
        dP_servo += accel * dt;
        P_servo += dP_servo * dt;

        const P_el = V / C_L;
        const R_eff = R_insp;

        const num = P_servo - rOutVal * (pmus - P_el) / R_eff;
        const den = 1 + rOutVal / R_eff;
        P_aw = num / den;

        const Q_lunge = (P_aw + pmus - P_el) / R_eff;
        V += Q_lunge * dt;

        if (P_aw < minPaw) {
            minPaw = P_aw;
            minPawTime = t;
        }

        if (Math.round(t * 10000) % 250 === 0) {
            records.push({
                t: Math.round(t * 1000),
                Paw: parseFloat(P_aw.toFixed(2)),
                Pservo: parseFloat(P_servo.toFixed(2)),
                Pmus: parseFloat(pmus.toFixed(2)),
                Flow: parseFloat((Q_lunge * 60).toFixed(1)),
                Vol: Math.round((V - C_L * epap) * 1000)
            });
        }
    }

    console.log(`\n--- Config: R_out = ${rOutVal}, Profile = ${pmusProfile} ---`);
    console.log(`Min Paw = ${minPaw.toFixed(2)} cmH2O (Dip depth: ${(epap - minPaw).toFixed(2)} cmH2O below EPAP) at t = ${Math.round(minPawTime*1000)} ms`);
    records.slice(0, 16).forEach(r => {
        console.log(`  t: ${r.t.toString().padStart(4, ' ')}ms | Paw: ${r.Paw.toFixed(2).padStart(5, ' ')} | Pservo: ${r.Pservo.toFixed(2).padStart(5, ' ')} | Pmus: ${r.Pmus.toFixed(2).padStart(5, ' ')} | Flow: ${r.Flow.toFixed(1).padStart(5, ' ')} L/min | Vol: ${r.Vol.toString().padStart(4, ' ')} ml`);
    });
}

testDip(1.0, 'linear');
testDip(6.0, 'sinusoidal');
testDip(8.0, 'fast_rise');
testDip(10.0, 'fast_rise');
