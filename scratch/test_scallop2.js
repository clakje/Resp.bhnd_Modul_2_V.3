const fs = require('fs');

function simulateRealisticScalloping() {
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

    let phase = 'expiration';
    let timeInPhase = 0;
    let P_servo = epap;
    let dP_servo = 0.0;
    let P_aw = epap;
    let V = C_L * epap;
    let peakFlow = 0;

    const omega = 4.0 / riseTime;
    const zeta = 0.95;

    const records = [];

    // Let's model the patient's neural drive with realistic timing:
    // Neural effort starts at t = 0.05s
    const effortStart = 0.05;

    for (let t = 0; t <= totalDuration; t += dt) {
        timeInPhase += dt;

        // 1. Patient drive
        let pmus = 0;
        if (t >= effortStart && t < effortStart + tiNeural) {
            const tn = t - effortStart;
            // Strong physiological drive with high initial P0.1 and active mid-inspiratory effort
            const tPeak = 0.30;
            if (tn < tPeak) {
                pmus = pmusMax * Math.sin((Math.PI / 2) * (tn / tPeak));
            } else {
                pmus = pmusMax * (0.4 + 0.6 * Math.cos((Math.PI / 2) * ((tn - tPeak) / (tiNeural - tPeak))));
            }
        }

        // 2. Trigger check in expiration
        if (phase === 'expiration') {
            // Before trigger: circuit pressure drops as patient sucks
            // Flow trigger threshold: 1.5 L/min
            const Q_meas = (P_aw + pmus - (V / C_L)) / R_insp;
            if (t >= effortStart && (Q_meas * 60 > 1.5 || pmus > 0.8)) {
                phase = 'inspiration';
                timeInPhase = 0;
                peakFlow = 0;
            }
        }

        // 3. Servo pressure target
        const P_target = (phase === 'inspiration') ? ipap : epap;
        const accel = omega * omega * (P_target - P_servo) - 2 * zeta * omega * dP_servo;
        dP_servo += accel * dt;
        P_servo += dP_servo * dt;

        const P_el = V / C_L;
        const R_eff = R_insp;

        // 4. Effective machine impedance during slow rise
        // When riseTime is 800ms and patient is active (pmus > 0):
        // Throttled inspiratory valve + high flow demand creates large pressure drop across the valve
        const isSlowRise = (riseTime > 0.20 && phase === 'inspiration');
        const riseFactor = isSlowRise ? (riseTime - 0.15) / 0.75 : 0;
        
        // Dynamic impedance that strongly reflects flow starvation / valve throttling
        const starvationScale = 1.0 + 8.5 * riseFactor * (pmus > 0 ? Math.min(1.0, pmus / 2.0) : 0);
        const R_out_eff = 1.0 * starvationScale;

        // Mask pressure
        const num = P_servo - R_out_eff * (pmus - P_el) / R_eff;
        const den = 1 + R_out_eff / R_eff;
        P_aw = num / den;

        // Flow & Volume
        const Q_lunge = (P_aw + pmus - P_el) / R_eff;
        V += Q_lunge * dt;

        if (phase === 'inspiration') {
            if (Q_lunge > peakFlow) peakFlow = Q_lunge;
            // Cycling check
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
                Pservo: parseFloat(P_servo.toFixed(2)),
                Pmus: parseFloat(pmus.toFixed(2)),
                Flow: parseFloat((Q_lunge * 60).toFixed(1)),
                Vol: Math.round((V - C_L * epap) * 1000)
            });
        }
    }

    console.log('=== REALISTIC FLOW STARVATION SIMULATION ===');
    records.forEach(r => {
        const pawBar = '#'.repeat(Math.max(0, Math.round(r.Paw * 2)));
        const flowOffset = 20;
        const flowScaled = Math.round(r.Flow / 2);
        const flowBar = r.Flow >= 0 
            ? ' '.repeat(flowOffset) + '|' + '+'.repeat(flowScaled)
            : ' '.repeat(Math.max(0, flowOffset + flowScaled)) + '-'.repeat(-flowScaled) + '|';
        console.log(`t: ${r.t.toString().padStart(4, ' ')}ms [${r.phase}] | Paw: ${r.Paw.toFixed(2).padStart(5, ' ')} | Flow: ${r.Flow.toFixed(1).padStart(5, ' ')} L/min | ${pawBar.padEnd(30, ' ')} | ${flowBar}`);
    });
}

simulateRealisticScalloping();
