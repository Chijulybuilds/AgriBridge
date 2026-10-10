// Shots of the live Sepolia site for the video's opening and closing scenes.
import { chromium } from "../../node_modules/playwright/index.mjs";
import fs from "node:fs";
const SITE = "https://agribridge-lilac.vercel.app";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const shot = async (name) => { await page.waitForTimeout(1200); await page.screenshot({ path: `public/live/${name}.png` }); };
await page.goto(SITE, { waitUntil: "domcontentloaded", timeout: 90000 }); await page.waitForTimeout(4500); await shot("00-landing");
const video = page.locator(".landing-video-toggle"); // pause the background video for a steady frame
if (await video.isVisible()) { await video.click(); }
await page.locator("#how-title").scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -40)); await page.waitForTimeout(1500); await shot("02-how");
await page.goto(`${SITE}/market`, { waitUntil: "domcontentloaded", timeout: 90000 }); await page.waitForTimeout(7000); await shot("14-live-market");
await page.goto(`${SITE}/activity`, { waitUntil: "domcontentloaded", timeout: 90000 }); await page.waitForTimeout(9000); await shot("13-live-activity");
await browser.close();
console.log(fs.readdirSync("public/live"));
