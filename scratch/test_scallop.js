const fs = require('fs');

function testDetailedWaveform() {
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
    const totalDuration = 1.3;

    let P_servo = epap;
    let dP_servo = 0.0;
    let P_aw = epap;
    let V = C_L * epap;

    const omega = 4.0 / riseTime;
    const zeta = 0.95;

    // Starvation impedance during slow rise
    // When riseTime is 800ms, R_out is high (~7.5) during inspiration
    const R_out_eff = 1.0 + 7.5 * Math.max(0, (riseTime - 0.15) / 0.75);

    const records = [];

    for (let t = 0; t <= totalDuration; t += dt) {
        // Pmus with realistic physiological profile (initial surge, peak around 0.3-0.5s, then relaxes)
        let pmus = 0;
        if (t < tiNeural) {
            // Asymmetric profile: rapid rise in first 0.3s, holds/peaks, then tapers off towards tiNeural
            const tPeak = 0.35 * tiNeural;
            if (t < tPeak) {
                pmus = pmusMax * Math.sin((Math.PI / 2) * (t / tPeak));
            } else {
                pmus = pmusMax * Math.cos((Math.PI / 2) * ((t - tPeak) / (tiNeural - tPeak)));
            }
        }

        // 2nd order P_servo
        const accel = omega * omega * (ipap - P_servo) - 2 * zeta * omega * dP_servo;
        dP_servo += accel * dt;
        P_servo += dP_servo * dt;

        const P_el = V / C_L;
        const R_eff = R_insp;

        // Flow conservation with throttled ventilator output impedance:
        // (P_servo - P_aw) / R_out_eff = (P_aw + P_mus - P_el) / R_eff
        const num = P_servo - R_out_eff * (pmus - P_el) / R_eff;
        const den = 1 + R_out_eff / R_eff;
        P_aw = num / den;

        const Q_lunge = (P_aw + pmus - P_el) / R_eff;
        V += Q_lunge * dt;

        if (Math.round(t * 10000) % 250 === 0) { // every 25 ms
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

    console.log('=== SIMULATED WAVEFORM SAMPLES ===');
    records.slice(0, 35).forEach(r => {
        const pawBar = '#'.repeat(Math.max(0, Math.round(r.Paw * 2)));
        const flowBar = '*'.repeat(Math.max(0, Math.round(r.Flow / 2)));
        console.log(`t: ${r.t.toString().padStart(4, ' ')}ms | Paw: ${r.Paw.toFixed(2).padStart(5, ' ')} | Pmus: ${r.Pmus.toFixed(2).padStart(5, ' ')} | Flow: ${r.Flow.toFixed(1).padStart(5, ' ')} L/min | ${pawBar}`);
    });
}

testDetailedWaveform();
