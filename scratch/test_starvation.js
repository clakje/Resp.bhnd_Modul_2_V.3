const fs = require('fs');

function testBehavior() {
    // Let's test a clean formulation:
    // When patient is active (P_mus > 0), the flow starvation effect depends on (P_mus) and (riseTime).
    // Specifically:
    // Slow rise time restricts the ventilator's flow delivery response to patient suction.
    // So the effective suction loading on P_aw scales with riseTime and P_mus!

    function getPaw(P_servo, P_mus, P_el, R_eff, R_out_base, riseTime, isInsp) {
        // Starvation factor: when riseTime is long (e.g. > 0.15s) and patient pulls (P_mus > 0),
        // the throttled valve cannot keep up with the patient's flow demand,
        // causing a pressure drop proportional to P_mus.
        const riseFactor = isInsp ? Math.max(0, (riseTime - 0.15) / 0.75) : 0;
        
        // Dynamic impedance that only resists patient suction (flow starvation)
        // without impeding passive pressurization when P_mus = 0:
        const starvationScale = 1.0 + 5.0 * riseFactor * (P_mus > 0 ? Math.min(1.0, P_mus / 5.0) : 0);
        const R_out_effective = R_out_base * starvationScale;

        const num = P_servo - R_out_effective * (P_mus - P_el) / R_eff;
        const den = 1 + R_out_effective / R_eff;
        return num / den;
    }

    console.log('Testing getPaw:');
    // Case 1: Passive patient, slow rise (riseTime = 0.9, Pmus = 0, Pel = 5, Pservo = 14)
    const pawPassive = getPaw(14, 0, 5, 5, 1.0, 0.9, true);
    console.log(`Passive patient (Pmus=0, Pservo=14, Pel=5): Paw = ${pawPassive.toFixed(2)} cmH2O (Target: close to 14/15)`);

    // Case 2: Active patient, slow rise (riseTime = 0.8, Pmus = 8, Pel = 5, Pservo = 5)
    const pawActiveStart = getPaw(5, 8, 5, 5, 1.0, 0.8, true);
    console.log(`Active patient start (Pmus=8, Pservo=5, Pel=5): Paw = ${pawActiveStart.toFixed(2)} cmH2O (Dip: ${(5 - pawActiveStart).toFixed(2)} cmH2O below EPAP)`);
}

testBehavior();
