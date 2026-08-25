/**
 * app.js - Hovedapplikasjon og kontrollerkobling for NIV Simulatoren (Hamilton-stil)
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialiser kjernekomponenter
    const simulator = new VentilatorSimulator();
    const renderer = new WaveformRenderer('waveformCanvas');

    let isPaused = false;
    let lastTimestamp = performance.now();

    // 2. DOM Referanser
    // Alarm-banner
    const alarmBanner = document.getElementById('alarmBanner');

    // Måleverdier
    const valPpeak = document.getElementById('valPpeak');
    const valVt = document.getElementById('valVt');
    const valMv = document.getElementById('valMv');
    const valRR = document.getElementById('valRR');

    // Målekort (for styling ved alarm)
    const cardMetricPpeak = document.getElementById('cardMetricPpeak');
    const cardMetricVt = document.getElementById('cardMetricVt');
    const cardMetricMv = document.getElementById('cardMetricMv');
    const cardMetricRR = document.getElementById('cardMetricRR');

    // Innstilte visningsbokser
    const dispIpap = document.getElementById('dispIpap');
    const dispEpap = document.getElementById('dispEpap');
    const dispFio2 = document.getElementById('dispFio2');

    // Slidere og Badges
    const sliders = {
        ipap: document.getElementById('sliderIpap'),
        epap: document.getElementById('sliderEpap'),
        rr: document.getElementById('sliderRR'),
        fio2: document.getElementById('sliderFio2'),
        trigger: document.getElementById('sliderTrigger'),
        compliance: document.getElementById('sliderCompliance'),
        resistance: document.getElementById('sliderResistance'),
        pmus: document.getElementById('sliderPmus'),
        cycling: document.getElementById('sliderCycling'),
        riseTime: document.getElementById('sliderRiseTime'),
        leak: document.getElementById('sliderLeak')
    };

    const badges = {
        ipap: document.getElementById('badgeIpap'),
        epap: document.getElementById('badgeEpap'),
        rr: document.getElementById('badgeRR'),
        fio2: document.getElementById('badgeFio2'),
        trigger: document.getElementById('badgeTrigger'),
        compliance: document.getElementById('badgeCompliance'),
        resistance: document.getElementById('badgeResistance'),
        pmus: document.getElementById('badgePmus'),
        cycling: document.getElementById('badgeCycling'),
        riseTime: document.getElementById('badgeRiseTime'),
        leak: document.getElementById('badgeLeak')
    };

    // Trigger-samkjøringsfelter (UI/UX)
    const triggerSyncBox = document.getElementById('triggerSyncBox');
    const triggerSyncBadge = document.getElementById('triggerSyncBadge');
    const syncTriggerReq = document.getElementById('syncTriggerReq');
    const syncPatientEffort = document.getElementById('syncPatientEffort');
    const triggerGaugeFill = document.getElementById('triggerGaugeFill');
    const triggerGaugeThreshold = document.getElementById('triggerGaugeThreshold');
    const triggerSyncMessage = document.getElementById('triggerSyncMessage');

    const pmusSyncBox = document.getElementById('pmusSyncBox');
    const pmusSyncBadge = document.getElementById('pmusSyncBadge');
    const pmusSyncMessage = document.getElementById('pmusSyncMessage');

    // Knapper
    const btnPause = document.getElementById('btnPause');
    const pauseIcon = document.getElementById('pauseIcon');
    const pauseText = document.getElementById('pauseText');
    const btnReset = document.getElementById('btnReset');

    // Presets
    const presetBtns = {
        normal: document.getElementById('presetNormal'),
        copd: document.getElementById('presetCopd'),
        restrictive: document.getElementById('presetRestrictive')
    };

    // Innsiktspanel
    const insightTau = document.getElementById('insightTau');
    const insightDeltaP = document.getElementById('insightDeltaP');
    const insightTheoVt = document.getElementById('insightTheoVt');
    const insightText = document.getElementById('insightText');

    // Funksjon for sanntids samkjøring av pasientflow og flow-trigger (1–5 L/min)
    function updateTriggerSyncUI() {
        const trigFlow = simulator.settings.triggerFlow;
        const pmus = simulator.patient.pmusMax;
        const R = simulator.patient.resistance;
        const patientPeakFlow = parseFloat(((pmus / R) * 60).toFixed(1));

        if (syncTriggerReq) syncTriggerReq.textContent = `${trigFlow.toFixed(1)} L/min`;
        if (syncPatientEffort) syncPatientEffort.textContent = `${patientPeakFlow.toFixed(1)} L/min`;

        // Beregn skala for sammenligningsmåler
        const maxVal = 6.0;
        const threshPct = Math.min(95, Math.max(5, (trigFlow / maxVal) * 100));
        
        let effortPct = 80;
        if (trigFlow <= 3.0) {
            effortPct = 85;
        } else if (trigFlow === 4.0 || (trigFlow > 3.0 && trigFlow < 5.0)) {
            effortPct = threshPct; // Akkurat på grensen
        } else {
            effortPct = 25; // Under terskel
        }

        if (triggerGaugeThreshold) triggerGaugeThreshold.style.left = `${threshPct}%`;
        if (triggerGaugeFill) triggerGaugeFill.style.width = `${effortPct}%`;

        // 1 til 3 L/min: 100% trigging med lilla trekant for hver pust
        if (trigFlow <= 3.0) {
            if (triggerSyncBox) triggerSyncBox.className = 'trigger-sync-box';
            if (triggerGaugeFill) triggerGaugeFill.className = 'trigger-gauge-fill';

            if (triggerSyncBadge) {
                triggerSyncBadge.className = 'trigger-sync-status-badge status-ok';
                triggerSyncBadge.textContent = '✅ 100% Utløst (▲)';
            }
            if (pmusSyncBadge) {
                pmusSyncBadge.className = 'trigger-sync-status-badge status-ok';
                pmusSyncBadge.textContent = '✅ Nok flow';
            }

            badges.trigger.classList.remove('badge-warning-pill', 'badge-danger-pill');
            badges.pmus.classList.remove('badge-warning-pill');

            if (triggerSyncMessage) {
                triggerSyncMessage.innerHTML = `Flow-trigger på <strong>${trigFlow.toFixed(1)} L/min</strong>: Pasienten trigger maskinen pålitelig ved hvert innpust (100%). Lilla trekant (▲) vises på hvert pust.`;
            }
            if (pmusSyncMessage) {
                pmusSyncMessage.innerHTML = `Pasientinnsatsen genererer tilstrekkelig flow (P<sub>mus</sub>/R = ${patientPeakFlow.toFixed(1)} L/min) til å overvinne flow-triggeren på <strong>${trigFlow.toFixed(1)} L/min</strong>.`;
            }

        // 4 L/min: Registrerer av og til (~50% av gangene), kun støtte når det registreres
        } else if (trigFlow === 4.0 || (trigFlow > 3.0 && trigFlow < 5.0)) {
            if (triggerSyncBox) triggerSyncBox.className = 'trigger-sync-box warning-state';
            if (triggerGaugeFill) triggerGaugeFill.className = 'trigger-gauge-fill warning-fill';

            if (triggerSyncBadge) {
                triggerSyncBadge.className = 'trigger-sync-status-badge status-warning';
                triggerSyncBadge.textContent = '⚠️ ~50% Asynkroni';
            }
            if (pmusSyncBadge) {
                pmusSyncBadge.className = 'trigger-sync-status-badge status-warning';
                pmusSyncBadge.textContent = '⚠️ Grensetilfelle';
            }

            badges.trigger.classList.add('badge-warning-pill');
            badges.trigger.classList.remove('badge-danger-pill');
            badges.pmus.classList.add('badge-warning-pill');

            if (triggerSyncMessage) {
                triggerSyncMessage.innerHTML = `⚠️ <strong>Grensetrigger (4.0 L/min):</strong> Pasienten klarer kun å utløse ca. 50% av pustene (missed efforts). Maskinen gir kun støtte (▲) på de pustene som utløses. Minuttvolumet halveres.`;
            }
            if (pmusSyncMessage) {
                pmusSyncMessage.innerHTML = `⚠️ Varierende pasientrespons ved 4.0 L/min flow-trigger: Pasienten sliter med å nå terskelen ved hvert pust.`;
            }

        // 5 L/min: Registrerer ingen pust, gir ingen støtte (0%), apné-alarm
        } else {
            if (triggerSyncBox) triggerSyncBox.className = 'trigger-sync-box danger-state';
            if (triggerGaugeFill) triggerGaugeFill.className = 'trigger-gauge-fill danger-fill';

            if (triggerSyncBadge) {
                triggerSyncBadge.className = 'trigger-sync-status-badge status-danger';
                triggerSyncBadge.textContent = '🚨 0% Uutløst / Apné';
            }
            if (pmusSyncBadge) {
                pmusSyncBadge.className = 'trigger-sync-status-badge status-danger';
                pmusSyncBadge.textContent = '🚨 For lav flow';
            }

            badges.trigger.classList.remove('badge-warning-pill');
            badges.trigger.classList.add('badge-danger-pill');
            badges.pmus.classList.add('badge-warning-pill');

            if (triggerSyncMessage) {
                triggerSyncMessage.innerHTML = `🚨 <strong>Uutløst trigger (5.0 L/min):</strong> For tung trigger for pasienten! Ingen pust utløses, ingen støtte gis (forblir på EPAP). <strong>Apné-alarm er utløst!</strong>`;
            }
            if (pmusSyncMessage) {
                pmusSyncMessage.innerHTML = `🚨 Pasienten klarer ikke å utløse 5.0 L/min flow-trigger. Senk triggeren til 1–3 L/min for å gjenopprette synkroni og ventilasjon.`;
            }
        }
    }

    // 3. Koble til Sliders
    function updateSimulatorFromUI() {
        const ipap = parseFloat(sliders.ipap.value);
        let epap = parseFloat(sliders.epap.value);

        // Sikre at IPAP alltid er minst 2 cmH2O høyere enn EPAP
        if (epap >= ipap) {
            epap = ipap - 2;
            sliders.epap.value = epap;
        }

        const rr = parseInt(sliders.rr.value, 10);
        const fio2 = parseInt(sliders.fio2.value, 10);
        const compliance = parseFloat(sliders.compliance.value);
        const resistance = parseFloat(sliders.resistance.value);
        const pmus = parseFloat(sliders.pmus.value);
        const cycling = parseFloat(sliders.cycling.value) / 100;
        const riseTime = parseFloat(sliders.riseTime.value) / 1000;
        const leak = parseFloat(sliders.leak.value);
        const triggerFlow = parseFloat(sliders.trigger.value);

        // Oppdater simulatoren
        simulator.settings.ipap = ipap;
        simulator.settings.epap = epap;
        simulator.settings.rr = rr;
        simulator.settings.fio2 = fio2;
        simulator.settings.riseTime = riseTime;
        simulator.settings.cyclingPercent = cycling;
        simulator.settings.leak = leak;
        simulator.settings.triggerFlow = triggerFlow;

        simulator.patient.compliance = compliance;
        simulator.patient.resistance = resistance;
        simulator.patient.pmusMax = pmus;

        // Oppdater tekstmerker
        badges.ipap.textContent = `${ipap} cmH₂O`;
        badges.epap.textContent = `${epap} cmH₂O`;
        badges.rr.textContent = `${rr} /min`;
        badges.fio2.textContent = `${fio2} %`;
        badges.compliance.textContent = `${compliance} ml/cmH₂O`;
        badges.resistance.textContent = `${resistance} cmH₂O/(L/s)`;
        badges.pmus.textContent = `${pmus} cmH₂O`;
        badges.cycling.textContent = `${Math.round(cycling * 100)} %`;
        badges.riseTime.textContent = `${Math.round(riseTime * 1000)} ms`;
        badges.leak.textContent = `${leak} L/min`;
        badges.trigger.textContent = `${triggerFlow.toFixed(1)} L/min`;

        // Oppdater innstilte visninger i målepanelet
        dispIpap.textContent = ipap;
        dispEpap.textContent = epap;
        dispFio2.textContent = `${fio2}%`;

        updateTriggerSyncUI();
        updateInsights();
    }

    // Lytt på slider-endringer
    Object.values(sliders).forEach(slider => {
        if (!slider) return;
        slider.addEventListener('input', () => {
            if (slider === sliders.compliance || slider === sliders.resistance) {
                setActivePresetButton(null);
                simulator.patient.preset = 'custom';
            }
            updateSimulatorFromUI();
        });
    });

    // Trinnknapper (+ / -)
    document.querySelectorAll('.step-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-target');
            const step = parseFloat(btn.getAttribute('data-step'));
            const targetSlider = document.getElementById(targetId);
            if (targetSlider) {
                let currentVal = parseFloat(targetSlider.value);
                let min = parseFloat(targetSlider.min);
                let max = parseFloat(targetSlider.max);
                let newVal = Math.min(max, Math.max(min, currentVal + step));
                targetSlider.value = newVal;
                targetSlider.dispatchEvent(new Event('input'));
            }
        });
    });

    // 4. Presets (Pasientcaser)
    function setActivePresetButton(activeKey) {
        Object.entries(presetBtns).forEach(([key, btn]) => {
            if (!btn) return;
            if (key === activeKey) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    function applyPreset(presetKey) {
        simulator.setPreset(presetKey);
        setActivePresetButton(presetKey);

        // Synkroniser slidere med den nye preset-tilstanden
        sliders.compliance.value = simulator.patient.compliance;
        sliders.resistance.value = simulator.patient.resistance;
        sliders.pmus.value = simulator.patient.pmusMax;

        if (presetKey === 'copd') {
            sliders.ipap.value = 16;
            sliders.epap.value = 5;
            sliders.rr.value = 16;
            sliders.trigger.value = 3.0;
        } else if (presetKey === 'restrictive') {
            sliders.ipap.value = 18;
            sliders.epap.value = 8;
            sliders.rr.value = 20;
            sliders.trigger.value = 2.0;
        } else if (presetKey === 'normal') {
            sliders.ipap.value = 14;
            sliders.epap.value = 5;
            sliders.rr.value = 15;
            sliders.trigger.value = 3.0;
        }

        updateSimulatorFromUI();
    }

    Object.entries(presetBtns).forEach(([key, btn]) => {
        if (btn) {
            btn.addEventListener('click', () => applyPreset(key));
        }
    });

    // 5. Fane-veksling
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.style.display = 'none');

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            const targetPane = document.getElementById(targetId);
            if (targetPane) {
                targetPane.style.display = 'block';
            }
        });
    });

    // 6. Pause & Reset knapper
    btnPause.addEventListener('click', () => {
        isPaused = !isPaused;
        simulator.isRunning = !isPaused;

        if (isPaused) {
            pauseIcon.textContent = '▶';
            pauseText.textContent = 'Fortsett';
            btnPause.classList.add('active');
        } else {
            pauseIcon.textContent = '⏸';
            pauseText.textContent = 'Pause';
            btnPause.classList.remove('active');
            lastTimestamp = performance.now();
        }
    });

    btnReset.addEventListener('click', () => {
        simulator.reset();
        applyPreset('normal');
        sliders.trigger.value = 3;
        sliders.riseTime.value = 150;
        sliders.cycling.value = 25;
        sliders.leak.value = 0;
        sliders.fio2.value = 30;
        renderer.initCanvas();
        updateSimulatorFromUI();
    });

    // 7. Oppdater pedagogisk innsikt
    function updateInsights() {
        const insights = simulator.getPhysiologicalInsights();
        insightTau.textContent = `${insights.tau} s`;
        insightDeltaP.textContent = `${insights.drivingPressure} cmH₂O`;
        insightTheoVt.textContent = `${insights.theoreticalVt} ml`;
        insightText.innerHTML = insights.clinicalNote;
    }

    // 8. Oppdater målte pasientverdier i displayet og håndter alarmtilstand
    let readoutUpdateTimer = 0;
    function updateReadouts(dt) {
        readoutUpdateTimer += dt;
        if (readoutUpdateTimer >= 0.25) {
            readoutUpdateTimer = 0;

            const isApnea = simulator.state.isApneaAlarm;

            // Oppdater synlighet for alarm-banner
            if (alarmBanner) {
                if (isApnea) {
                    alarmBanner.classList.remove('hidden');
                } else {
                    alarmBanner.classList.add('hidden');
                }
            }

            const m = simulator.state.measured;
            if (isApnea) {
                valPpeak.textContent = simulator.settings.epap.toFixed(1);
                valVt.textContent = '0';
                valMv.textContent = '0.0';
                valRR.textContent = '0';

                if (cardMetricPpeak) cardMetricPpeak.classList.add('metric-alarm-active');
                if (cardMetricVt) cardMetricVt.classList.add('metric-alarm-active');
                if (cardMetricMv) cardMetricMv.classList.add('metric-alarm-active');
                if (cardMetricRR) cardMetricRR.classList.add('metric-alarm-active');
            } else {
                valPpeak.textContent = m.ppeak.toFixed(1);
                valVt.textContent = m.vt;
                valMv.textContent = m.mv.toFixed(1);
                valRR.textContent = m.rrTotal;

                if (cardMetricPpeak) cardMetricPpeak.classList.remove('metric-alarm-active');
                if (cardMetricVt) cardMetricVt.classList.remove('metric-alarm-active');
                if (cardMetricMv) cardMetricMv.classList.remove('metric-alarm-active');
                if (cardMetricRR) cardMetricRR.classList.remove('metric-alarm-active');
            }
        }
    }

    // 9. Hoved-animasjonsloop (60 FPS)
    function loop(currentTimestamp) {
        const elapsedSec = (currentTimestamp - lastTimestamp) / 1000;
        lastTimestamp = currentTimestamp;

        if (!isPaused && elapsedSec > 0) {
            if (elapsedSec > 0.5) {
                // Fanen har vært i bakgrunnen — hopp over uten å skape tidssprang i kurvene
                simulator.step(elapsedSec);
            } else {
                // 1. Simuler fysiologi
                simulator.step(elapsedSec);

                // 2. Send sample til grafisk monitor
                const wasTriggered = simulator.state.justTriggered;
                simulator.state.justTriggered = false;

                renderer.addSample(
                    elapsedSec,
                    simulator.state.paw,
                    simulator.state.volume,
                    simulator.state.flow,
                    wasTriggered,
                    simulator.settings.epap
                );

                // 3. Oppdater måletall og alarmbanner
                updateReadouts(elapsedSec);
            }
        }

        // 4. Tegn kurver
        renderer.render();

        requestAnimationFrame(loop);
    }

    // Start opp med default-verdier
    updateSimulatorFromUI();
    requestAnimationFrame(loop);
});
