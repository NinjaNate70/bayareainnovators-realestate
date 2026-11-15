import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

// Use an existing Playwright installation; this script does not install packages.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || "playwright");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:3010";
await mkdir("output/ui-qa", { recursive: true });
try {
  await page.goto(`${origin}/case/demo`);
  await page.getByRole("heading", { name: "782 Cedar Street" }).waitFor();
  assert.match(await page.locator(".owed-amount").innerText(), /650.*900/s);
  for (const width of [320, 360, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `Audit overflow at ${width}`,
    );
    await page.screenshot({
      path: `output/ui-qa/audit-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /How this is estimated/ }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.waitForFunction(
    () =>
      document.activeElement?.tagName === "BUTTON" &&
      document.activeElement?.textContent?.includes("How this is estimated"),
    undefined,
    { timeout: 3000 },
  );
  assert.equal(
    await page
      .getByRole("button", { name: /How this is estimated/ })
      .evaluate((el) => el === document.activeElement),
    true,
    "Sheet returns focus",
  );
  await page.getByRole("button", { name: /Fair2/ }).click();
  assert.equal(await page.locator(".charge-card").count(), 2);
  await page.getByRole("button", { name: /All charges/ }).click();
  assert.equal(await page.locator(".charge-card").count(), 6);
  if (!process.argv.includes("--audit-only")) {
    await page
      .getByRole("navigation", { name: "Case navigation" })
      .getByRole("link", { name: "Letter", exact: true })
      .click();
    await page.getByRole("button", { name: "Generate draft" }).click();
    await page.getByRole("textbox", { name: "Edit demand letter" }).waitFor();
    await page.emulateMedia({ media: "print" });
    assert.equal(
      await page.locator(".print-letter").isVisible(),
      true,
      "Print letter is available",
    );
    await page.pdf({ path: "output/ui-qa/letter-print.pdf", format: "Letter" });
    await page.emulateMedia({ media: "screen" });
    await page.screenshot({
      path: "output/ui-qa/letter-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "output/ui-qa/letter-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("textbox", { name: "Edit demand letter" })
      .fill("Edited letter that should persist.");
    await page.reload();
    await page.getByRole("textbox", { name: "Edit demand letter" }).waitFor();
    assert.equal(
      await page
        .getByRole("textbox", { name: "Edit demand letter" })
        .inputValue(),
      "Edited letter that should persist.",
    );
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export letter (.txt)" }).click();
    assert.equal(
      (await download).suggestedFilename(),
      "tenant-shield-demand-letter.txt",
    );
    await page
      .getByRole("navigation", { name: "Case navigation" })
      .getByRole("link", { name: "Photos", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Before. After. In context." })
      .waitFor();
    await page.screenshot({
      path: "output/ui-qa/photos-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("navigation", { name: "Case navigation" })
      .getByRole("link", { name: "Replies", exact: true })
      .click();
    await page
      .getByLabel("Landlord response")
      .fill("Please send me the photos supporting your request.");
    await page.getByRole("button", { name: "Prepare reply" }).click();
    await page.getByLabel("Edit suggested reply").waitFor();
    await page.screenshot({
      path: "output/ui-qa/replies-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "output/ui-qa/replies-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.match(
      await page.getByLabel("Edit suggested reply").inputValue(),
      /photos supporting/,
    );
    await page.goto(`${origin}/case/new`);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.locator('.notice[role="alert"]').waitFor();
    await page.getByRole("button", { name: "Use example documents" }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("heading", { name: "Confirm the details" }).waitFor();
    await page.screenshot({
      path: "output/ui-qa/wizard-mobile.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue to review" }).click();
    await page.getByRole("button", { name: "Run audit" }).click();
    await page.locator(".owed-amount").waitFor();
    await page.goto(origin);
    await page
      .getByRole("heading", { name: /Your deposit deserves/ })
      .waitFor();
    for (const width of [360, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `Landing overflow at ${width}`,
      );
      await page.screenshot({
        path: `output/ui-qa/landing-${width}.png`,
        fullPage: true,
      });
    }
    // Real files must persist without receiving the fixture's legal findings.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/case/new`);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5eYAAAAASUVORK5CYII=",
      "base64",
    );
    await page.getByLabel("Landlord’s deduction letter").setInputFiles({
      name: "deductions.png",
      mimeType: "image/png",
      buffer: png,
    });
    await page
      .locator(".file-list li")
      .filter({ hasText: "deductions.png" })
      .waitFor();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .locator("#address")
      .fill("123 Example Street, San Luis Obispo, CA");
    assert.equal(
      await page
        .locator("input")
        .evaluateAll((inputs) =>
          inputs.every(
            (input) => parseFloat(getComputedStyle(input).fontSize) >= 16,
          ),
        ),
      true,
      "Mobile inputs are 16px or larger",
    );
    await page.locator("#deposit").fill("1000");
    await page.getByLabel("Amount returned ($)", { exact: true }).fill("800");
    await page.getByRole("button", { name: "Add charge", exact: true }).click();
    await page.getByLabel("Charge 1 description").fill("Cleaning");
    await page.getByLabel("Charge 1 amount").fill("200");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Move-in photos (optional)").setInputFiles([
      { name: "before-a.png", mimeType: "image/png", buffer: png },
      { name: "before-b.png", mimeType: "image/png", buffer: png },
    ]);
    await page
      .locator(".file-list li")
      .filter({ hasText: "before-b.png" })
      .waitFor();
    assert.equal(
      await page.locator(".file-list li").count(),
      2,
      "Both photos retained",
    );
    await page.getByRole("button", { name: "Continue to review" }).click();
    await page.getByRole("button", { name: "Run audit" }).click();
    await page.locator(".verdict-info").waitFor();
    assert.equal(
      await page.locator(".owed-amount").count(),
      0,
      "Real files do not receive demo money",
    );
    await page
      .getByRole("navigation", { name: "Case navigation" })
      .getByRole("link", { name: "Photos", exact: true })
      .click();
    await page
      .locator("#select-before")
      .selectOption({ label: "before-b.png" });
    await page.reload();
    await page.locator("#select-before").waitFor();
    assert.equal(
      await page.locator("#select-before option:checked").innerText(),
      "before-b.png",
      "Photo pairing retained",
    );
    await page.waitForFunction(
      () => document.querySelector(".evidence-image")?.naturalWidth > 0,
    );
    await page.setViewportSize({ width: 320, height: 800 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "Real evidence IDs reflow",
    );
    await page.screenshot({
      path: "output/ui-qa/real-photos-320.png",
      fullPage: true,
    });
    await page.goto(`${origin}/case/not-a-saved-case`);
    await page
      .getByRole("heading", { name: "We couldn’t find that case." })
      .waitFor();
  }
  assert.deepEqual(errors, [], "No uncaught browser errors");
  console.log(
    "PASS: responsive layouts, audit math, filters, sheet dismissal/focus" +
      (process.argv.includes("--audit-only")
        ? ""
        : ", letter persistence/export, photos, replies, wizard and landing"),
  );
} catch (error) {
  console.error(
    "Failed at",
    page.url(),
    await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 400)),
    "\n",
    await page.locator("body").innerText(),
  );
  await page.screenshot({ path: "output/ui-qa/failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
}
