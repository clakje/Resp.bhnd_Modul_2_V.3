/**
 * diagnostikk/test_playwright.js
 * Kjører Playwright headless mot http://localhost:8080/
 * Måler simuleringstilstand, tar skjermbilder, tester UI og sjekker alle symptomer.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
    console.log('Starter Playwright Chromium headless...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    const consoleMessages = [];
    const pageErrors = [];

    page.on('console', msg => {
        consoleMessages.push({ type: msg.type(), text: msg.text() });
    });
    page.on('pageerror', err => {
        pageErrors.push(err.toString());
        console.error('PAGESIDE-FEIL:', err);
    });

    console.log('Navigerer til http://localhost:8080/ ...');
    await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });

    const screenshotsDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    console.log('--- TEST 1: Symptom S1 - Kurvefylling etter flere sveip (15 s) ---');
    await page.waitForTimeout(15000);
    await page.screenshot({ path: path.join(screenshotsDir, '01_s1_after_15s.png') });
    console.log('Skjermbilde lagret: 01_s1_after_15s.png');

    console.log('\n--- TEST 2: Symptom S2 - RRtot og MV normalisering under 60 s ---');
    // Nullstill simuleringen og logg ved 5s, 10s, 20s, 30s
    await page.click('#btnReset');
    await page.waitForTimeout(500);

    const s2Measurements = [];
    for (const waitTime of [5000, 5000, 10000, 10000]) {
        await page.waitForTimeout(waitTime);
        const metrics = await page.evaluate(() => {
            return {
                valRR: document.getElementById('valRR')?.textContent,
                valMv: document.getElementById('valMv')?.textContent,
                valVt: document.getElementById('valVt')?.textContent,
                dispRrSpont: document.getElementById('dispRrSpont')?.textContent,
                dispSpontFoot: document.getElementById('dispSpontFoot')?.textContent
            };
        });
        s2Measurements.push(metrics);
        console.log(`Måling etter tid:`, metrics);
    }

    console.log('\n--- TEST 3: Symptom S3 - Lekkasje og Lekkasjeprosent i ekspirasjon ---');
    // Sett lekkasje til 20 L/min via evaluate slik at fane ikke blokkerer
    await page.evaluate(() => {
        const slider = document.getElementById('sliderLeak');
        slider.value = '20';
        slider.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(3000);

    const leakSamples = [];
    for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(400);
        const lData = await page.evaluate(() => {
            return {
                leakSec: document.getElementById('dispLeakSec')?.textContent,
                leakStatus: document.getElementById('dispLeakStatus')?.textContent
            };
        });
        leakSamples.push(lData);
    }
    console.log('Lekkasje-samples under pustesyklus:', leakSamples);
    await page.screenshot({ path: path.join(screenshotsDir, '02_s3_leakage.png') });

    console.log('\n--- TEST 4: Symptom S4 - Asynkroni-indeks og ST-backup ---');
    // Sett lav pasientdrive og ST backup for å fremprovosere mandatory-pust
    await page.evaluate(() => {
        const sRr = document.getElementById('sliderRrSpont');
        sRr.value = '4';
        sRr.dispatchEvent(new Event('input'));

        const sPm = document.getElementById('sliderPmus');
        sPm.value = '1.0';
        sPm.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(8000);

    const s4Data = await page.evaluate(() => {
        return {
            asynchronyIndex: document.getElementById('dispAsynchronyIndex')?.textContent,
            rrTotal: document.getElementById('valRR')?.textContent,
            rrSpont: document.getElementById('dispRrSpont')?.textContent,
            spontFoot: document.getElementById('dispSpontFoot')?.textContent
        };
    });
    console.log('Asynkroni-indeks data ved blandet rytme:', s4Data);
    await page.screenshot({ path: path.join(screenshotsDir, '03_s4_asynchrony.png') });

    console.log('\n--- TEST 5: Sjekk alle 10 scenarioer og fasit-annotasjoner ---');
    const scenarioKeys = [
        'scenWellAdjusted', 'scenSlowTrigger', 'scenAutotrigger',
        'scenSlowRise', 'scenFastRise', 'scenEarlyCycle',
        'scenLateCycle', 'scenCopdAutoPeep', 'scenCopdAdjusted', 'scenLowDrive'
    ];

    // Aktiver fasit først
    await page.click('#btnToggleAnnotations');

    for (const sKey of scenarioKeys) {
        console.log(`Klikker scenario: #${sKey}`);
        await page.click(`#${sKey}`);
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(screenshotsDir, `scen_${sKey}.png`) });
    }

    console.log('\n--- TEST 6: Test FPS og ytelse med 4 spor, 6s sveip, KOLS ---');
    await page.click('#presetCopd');
    await page.click('#btnSweep6');
    await page.waitForTimeout(1000);

    const fpsResult = await page.evaluate(async () => {
        return new Promise(resolve => {
            let frames = 0;
            const startTime = performance.now();
            function countFrame() {
                frames++;
                if (frames < 120) { // 2 sekunder
                    requestAnimationFrame(countFrame);
                } else {
                    const elapsed = (performance.now() - startTime) / 1000;
                    resolve({
                        frames,
                        elapsed,
                        fps: frames / elapsed
                    });
                }
            }
            requestAnimationFrame(countFrame);
        });
    });
    console.log(`Målt FPS: ${fpsResult.fps.toFixed(1)} fps over ${fpsResult.elapsed.toFixed(2)} s (${fpsResult.frames} frames)`);

    console.log('\n--- TEST 7: Test Frys- og kursor-modus ---');
    await page.click('#btnPause'); // Frys
    await page.waitForTimeout(500);
    const canvasBox = await page.locator('#waveformCanvas').boundingBox();
    if (canvasBox) {
        await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(screenshotsDir, '04_freeze_cursor.png') });
    }
    await page.click('#btnPause'); // Fortsett

    console.log('\n--- TEST 8: Konsollfeil og sidefeil oppsummert ---');
    console.log(`Antall konsollmeldinger: ${consoleMessages.length}`);
    console.log(`Antall page errors: ${pageErrors.length}`);
    if (pageErrors.length > 0) {
        console.error('Page errors:', pageErrors);
    }
    const warnings = consoleMessages.filter(m => m.type === 'warning' || m.type === 'error');
    if (warnings.length > 0) {
        console.log('Konsoll advarsler/feil:', warnings);
    }

    const testSummary = {
        s2Measurements,
        leakSamples,
        s4Data,
        fpsResult,
        pageErrors,
        consoleWarnings: warnings
    };

    fs.writeFileSync(path.join(__dirname, 'playwright_results.json'), JSON.stringify(testSummary, null, 2));
    console.log('Playwright test fullført. Resultater lagret i diagnostikk/playwright_results.json');

    await browser.close();
})();
