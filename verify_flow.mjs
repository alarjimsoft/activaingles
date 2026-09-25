import { chromium } from '@playwright/test';
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:5173';
let browser, page;

function shot(name) {
  return page.screenshot({ path: `verify_${name}.png`, fullPage: false });
}

async function waitAndShot(selector, name, timeout = 10000) {
  await page.waitForSelector(selector, { timeout });
  await shot(name);
}

(async () => {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  page.setDefaultTimeout(15000);

  // Capture console errors
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));

  // ─── 1. LOGIN ───────────────────────────────────────────────────
  console.log('1. LOGIN');
  await page.goto(BASE);
  await page.waitForSelector('input[type="text"], input[placeholder*="matr"]', { timeout: 8000 });
  await shot('01_login_page');

  // Fill credentials (use first input as matricula, second as password)
  const inputs = await page.locator('input').all();
  if (inputs.length >= 2) {
    await inputs[0].fill('LUA2200001');
    await inputs[1].fill('password123');
  }
  await page.locator('button[type="submit"], button:has-text("Iniciar"), button:has-text("Login"), button:has-text("Entrar")').first().click();

  // ─── 2. DASHBOARD ────────────────────────────────────────────────
  console.log('2. DASHBOARD');
  await page.waitForURL('**/dashboard', { timeout: 12000 });
  // Wait for stat cards to load
  await page.waitForTimeout(2500);
  await shot('02_dashboard');

  // Extract stat card values
  const statTexts = await page.locator('[class*="StatCard"], .stat-card, [class*="stat"]').allTextContents().catch(() => []);
  const pageText = await page.innerText('body');

  // Grab XP / streak from page text
  const xpMatch    = pageText.match(/(\d+)\s*XP/i);
  const streakMatch = pageText.match(/(\d+)\s*[Dd]ay/);
  console.log('  XP on page:', xpMatch?.[1] ?? 'not found');
  console.log('  Streak on page:', streakMatch?.[1] ?? 'not found');
  console.log('  Stats section excerpt:', pageText.substring(0, 500).replace(/\n+/g, ' ').trim());

  // ─── 3. OPEN AN ACTIVE MISSION ───────────────────────────────────
  console.log('3. NAVIGATE TO MISSION');
  // Click first ACTIVE mission card
  const missionBtn = page.locator('button:has-text("Iniciar"), button:has-text("Continuar"), a:has-text("Start"), [class*="mission"]:not([disabled])').first();
  const hasMission = await missionBtn.count();
  if (!hasMission) {
    console.log('  No mission button found — screenshotting page');
    await shot('03_no_mission');
  } else {
    await missionBtn.click();
    await page.waitForURL('**/missions/**', { timeout: 10000 });
    await page.waitForTimeout(2000);
    await shot('03_mission_learning');
    console.log('  URL:', page.url());
    console.log('  Phase visible:', await page.locator('[class*="phase"], [class*="Phase"], [class*="navigator"]').count() > 0 ? 'YES' : 'NO');
  }

  // ─── 4. LEARNING PHASE ───────────────────────────────────────────
  console.log('4. LEARNING PHASE');
  const learningContent = await page.innerText('body').catch(() => '');
  const hasLearningContent = learningContent.includes('Vocabulario') || learningContent.includes('Gramática') || learningContent.includes('Objetivos') || learningContent.includes('Continuar');
  console.log('  Learning content rendered:', hasLearningContent);

  // Click through learning (find "Continuar" or "He terminado" button)
  const continueBtn = page.locator('button:has-text("Continuar"), button:has-text("He terminado"), button:has-text("Continue")').first();
  if (await continueBtn.count() > 0) {
    await continueBtn.click();
    await page.waitForTimeout(1500);
    await shot('04_after_learning');
    console.log('  Clicked Continue in Learning');
  } else {
    console.log('  No continue button found in Learning');
    await shot('04_learning_no_continue');
  }

  // ─── 5. PRACTICE PHASE ───────────────────────────────────────────
  console.log('5. PRACTICE PHASE');
  await page.waitForTimeout(3000); // wait for activities to load
  const practiceText = await page.innerText('body').catch(() => '');
  const hasPractice = practiceText.includes('Práctica') || practiceText.includes('actividad') || practiceText.includes('Activity');
  console.log('  Practice content:', hasPractice);
  await shot('05_practice_phase');

  // Answer 4 activities (click first option each time)
  for (let i = 0; i < 4; i++) {
    const optionBtn = page.locator('button[class*="option"], button[class*="choice"], [class*="activity"] button').first();
    if (await optionBtn.count() > 0) {
      await optionBtn.click();
      await page.waitForTimeout(800);
      // Click "Siguiente" / "Next" to advance
      const nextBtn = page.locator('button:has-text("Siguiente"), button:has-text("Continuar"), button:has-text("Next")').first();
      if (await nextBtn.count() > 0) {
        await nextBtn.click();
        await page.waitForTimeout(800);
      }
    }
  }
  await shot('05b_practice_done');

  // Finish practice
  const finishBtn = page.locator('button:has-text("Continuar al Chat"), button:has-text("Finalizar"), button:has-text("Finish")').first();
  if (await finishBtn.count() > 0) {
    await finishBtn.click();
    await page.waitForTimeout(1500);
  }
  await shot('05c_practice_complete');

  // ─── 6. CONVERSATION PHASE ───────────────────────────────────────
  console.log('6. CONVERSATION PHASE');
  await page.waitForTimeout(2000);
  const convText = await page.innerText('body').catch(() => '');
  const hasChat = convText.includes('mensaje') || convText.includes('tutor') || convText.includes('chat') || convText.includes('Type');
  console.log('  Chat visible:', hasChat);
  await shot('06_conversation_phase');

  // Send 5 messages to trigger the completion threshold
  const textInput = page.locator('input[placeholder*="mensaje"], input[placeholder*="message"], textarea, input[type="text"]').last();
  for (let i = 0; i < 5; i++) {
    if (await textInput.count() > 0) {
      await textInput.click();
      await textInput.fill(`Hello, I am practicing English. Message number ${i + 1}.`);
      const sendBtn = page.locator('button[type="submit"], button:has-text("Send"), button:has-text("Enviar")').first();
      if (await sendBtn.count() > 0) await sendBtn.click();
      console.log(`  Sent message ${i + 1}`);
      await page.waitForTimeout(4000); // wait for GPT response + TTS
    }
  }
  await shot('06b_conversation_5_messages');

  // Click "Ir a Pronunciación" if it appears
  const toAssessmentBtn = page.locator('button:has-text("Pronunciación"), button:has-text("Assessment")').first();
  if (await toAssessmentBtn.count() > 0) {
    await toAssessmentBtn.click();
    await page.waitForTimeout(1500);
    console.log('  Clicked → Pronunciación');
  }

  // ─── 7. ASSESSMENT PHASE ─────────────────────────────────────────
  console.log('7. ASSESSMENT PHASE');
  await page.waitForTimeout(1500);
  const assessText = await page.innerText('body').catch(() => '');
  const hasAssess = assessText.includes('Pronunciación') || assessText.includes('Grabar') || assessText.includes('pronunciacion');
  console.log('  Assessment visible:', hasAssess);
  await shot('07_assessment_phase');

  // Skip actual mic recording — click Complete directly if results are shown,
  // or check if there's a bypass
  // Instead, verify the UI renders properly and has the record button
  const recordBtn = page.locator('button:has-text("Grabar"), button:has-text("Record")').first();
  console.log('  Record button present:', await recordBtn.count() > 0);

  // ─── 8. CHECK CONSOLE ERRORS ─────────────────────────────────────
  console.log('\n=== CONSOLE ERRORS ===');
  if (errors.length === 0) {
    console.log('None');
  } else {
    errors.forEach(e => console.log(' ❌', e));
  }

  // ─── 9. CHECK NETWORK — STATS CALL ───────────────────────────────
  console.log('\n=== CHECKING ORACLE STATS ENDPOINT ===');
  const statsRes = await page.evaluate(async () => {
    try {
      const r = await fetch('https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api/progress/stats/1');
      const d = await r.json();
      return d;
    } catch(e) { return { error: e.message }; }
  });
  console.log('Stats response:', JSON.stringify(statsRes?.items?.[0] ?? statsRes, null, 2));

  await browser.close();
  console.log('\nScreenshots saved as verify_*.png');
})().catch(async e => {
  console.error('FATAL:', e.message);
  if (page) await shot('error_state').catch(() => {});
  if (browser) await browser.close();
  process.exit(1);
});
