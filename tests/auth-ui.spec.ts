import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
declare global {
  interface Window {
    authTestUploadReady?: boolean;
    authTestReleaseUpload?: () => void;
  }
}
test.setTimeout(120_000);
const password = "A calm tenant passphrase";
const photo = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
async function signup(page: Page, email: string, name = "Test Renter") {
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("I agree to the Terms and Privacy Policy.").check();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/check-email\?flow=/);
  await expect(page.getByRole("button", { name: /Resend in/ })).toBeDisabled();
  await page.getByRole("link", { name: "Verify email", exact: true }).click();
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Email verified." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to your case" }).click();
  await expect(page).toHaveURL(/\/case\/new/);
  await expect(
    page.getByRole("heading", { name: "Let’s put your case together." }),
  ).toBeVisible();
}
async function signin(page: Page, email: string, secret = password) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/case\/|\/account/);
}
async function signout(page: Page) {
  await page.getByRole("button", { name: /Open account menu/ }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
}
async function expire(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open("tenant-shield-local");
      r.onsuccess = () => {
        const db = r.result,
          tx = db.transaction("sessions", "readwrite"),
          store = tx.objectStore("sessions"),
          token = localStorage.getItem("tenant-shield:session")!,
          read = store.get(token);
        read.onsuccess = () => {
          store.put({ ...read.result, expires_at: "2000-01-01T00:00:00.000Z" });
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
}
test("signup, verify, case/photo persistence, expiry recovery, and account isolation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const email = `renter-a-${Date.now()}@example.test`;
  await page.goto("/case/new?step=details");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await signup(page, email);
  await page.getByLabel("No letter / enter manually").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Property address")
    .fill("123 Test Street, San Luis Obispo, CA");
  await page.getByLabel("Deposit paid ($)").fill("1000");
  await page.getByRole("button", { name: "Add charge", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Charge 1 description" })
    .fill("Cleaning");
  await page.getByRole("spinbutton", { name: "Charge 1 amount" }).fill("1000");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.evaluate(() => {
    const read = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = async function () {
      if (this.size === 8) {
        window.authTestUploadReady = true;
        await new Promise<void>((resolve) => {
          window.authTestReleaseUpload = resolve;
        });
        Blob.prototype.arrayBuffer = read;
      }
      return read.call(this);
    };
  });
  await page
    .getByLabel("Move-in photos (optional)", { exact: true })
    .setInputFiles({
      name: "move-in.png",
      mimeType: "image/png",
      buffer: photo,
    });
  await expect
    .poll(() => page.evaluate(() => !!window.authTestUploadReady))
    .toBe(true);
  await expire(page);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: "Sign in to keep going" }),
  ).toBeVisible();
  await page.evaluate(() => window.authTestReleaseUpload?.());
  await page.getByRole("link", { name: "Sign in to keep going" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/case\/new\?step=photos/);
  await expect(
    page.getByRole("button", { name: "Remove move-in.png", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Run audit", exact: true }).click();
  await expect(page).toHaveURL(/\/case\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: "123 Test Street", exact: true }),
  ).toBeVisible();
  const casePath = new URL(page.url()).pathname;
  await signout(page);
  await signin(page, email);
  await expect(page).toHaveURL(new RegExp(casePath));
  await page.getByRole("link", { name: "Photos", exact: true }).click();
  await expect(
    page.getByRole("img", { name: /move-in.png/ }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Letter", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate draft", exact: true })
    .click();
  const editor = page.locator("textarea.letter-text");
  await expect(editor).toBeVisible();
  await expire(page);
  await editor.fill("My unsaved letter survives a session ending.");
  await expect(
    page.getByRole("heading", { name: "Sign in to keep going" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sign in to keep going" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(casePath + "\\?tab=letter"));
  await expect(page.locator("textarea.letter-text")).toHaveValue(
    "My unsaved letter survives a session ending.",
  );
  await signout(page);
  const emailB = `renter-b-${Date.now()}@example.test`;
  await signup(page, emailB, "Other Renter");
  await page.goto(casePath + "?tab=photos");
  await expect(
    page.getByRole("heading", { name: "We couldn’t find that case." }),
  ).toBeVisible();
  await expect(
    page.getByText("123 Test Street, San Luis Obispo, CA", { exact: true }),
  ).toHaveCount(0);
  await page.goto("/account");
  await page
    .getByRole("button", { name: "Delete account and case data", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const dialogAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(dialogAudit.violations.map((v) => v.id)).toEqual([]);
  await dialog.getByLabel("Current password", { exact: true }).fill(password);
  await dialog.getByLabel("Type DELETE to confirm").fill("delete");
  await dialog
    .getByRole("button", { name: "Delete my account and case data" })
    .click();
  await expect(
    dialog.getByText("Fix this: Type DELETE exactly to confirm."),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Keep my account", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete account and case data", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Current password", { exact: true }),
  ).toHaveValue("");
  await dialog.getByLabel("Current password", { exact: true }).fill(password);
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await dialog
    .getByRole("button", { name: "Delete my account and case data" })
    .click();
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByText(
      "Your account and all its case data have been deleted from this browser.",
      { exact: true },
    ),
  ).toBeVisible();
  await signin(page, email);
  await page.goto(casePath + "?tab=photos");
  await expect(
    page.getByRole("img", { name: /move-in.png/ }).first(),
  ).toBeVisible();
});
test("form semantics, focus, mobile reflow and hidden OAuth", async ({
  page,
}) => {
  await mkdir("output/auth-qa", { recursive: true });
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .getByLabel("Email", { exact: true })
        .evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe("16px");
    await page.screenshot({
      path: `output/auth-qa/login-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await expect(
    page.getByText("Fix this: Enter your email address."),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("bad-email");
  await page.getByLabel("Password", { exact: true }).focus();
  await expect(
    page.getByText("Fix this: Enter an email address like name@example.com."),
  ).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("a pasted password");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/signup");
  await page.screenshot({
    path: "output/auth-qa/signup-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 812, height: 375 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("forgot/reset flow and invalid-link state", async ({ page }) => {
  const email = `reset-${Date.now()}@example.test`;
  await signup(page, email);
  await signout(page);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const r = indexedDB.open("tenant-shield-local");
      r.onsuccess = () => {
        const db = r.result,
          tx = db.transaction("auth_flows", "readwrite"),
          cursor = tx.objectStore("auth_flows").openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (c) {
            c.update({
              ...c.value,
              retry_after_at: "2000-01-01T00:00:00.000Z",
            });
            c.continue();
          }
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await expect(page).toHaveURL(/forgot-password\?flow=/);
  await page.getByRole("link", { name: "Reset password", exact: true }).click();
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
  const link = page.url();
  await page
    .getByLabel("New password", { exact: true })
    .fill("My replacement passphrase");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("does not match");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(
    page.getByLabel("Confirm new password", { exact: true }),
  ).toBeFocused();
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("My replacement passphrase");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(
    page.getByRole("heading", { name: "Your password is updated." }),
  ).toBeVisible();
  await page.goto(link);
  await expect(
    page.getByRole("heading", { name: "This link can't be used." }),
  ).toBeVisible();
  await signin(page, email, "My replacement passphrase");
});
test("demo account seeds once with real evidence; settings save, email change and password change", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByText("Development demo account", { exact: true }).click();
  await page
    .getByRole("button", { name: "Use demo account", exact: true })
    .click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "demo@tenantshield.app",
  );
  const demoPassword = await page
    .getByLabel("Password", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "782 Cedar Street", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("$650", { exact: false }).first()).toBeVisible();
  const count = () =>
    page.evaluate(
      async () =>
        new Promise<{ users: number; cases: number; files: number }>(
          (resolve) => {
            const r = indexedDB.open("tenant-shield-local");
            r.onsuccess = () => {
              const db = r.result,
                tx = db.transaction(["users", "cases", "files"]);
              const users = tx.objectStore("users").count(),
                cases = tx.objectStore("cases").count(),
                files = tx.objectStore("files").count();
              tx.oncomplete = () => {
                db.close();
                resolve({
                  users: users.result,
                  cases: cases.result,
                  files: files.result,
                });
              };
            };
          },
        ),
    );
  expect(await count()).toEqual({ users: 1, cases: 1, files: 4 });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "782 Cedar Street", exact: true }),
  ).toBeVisible();
  expect(await count()).toEqual({ users: 1, cases: 1, files: 4 });
  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "Account settings", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Updated Renter");
  const accountAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accountAudit.violations.map((v) => v.id)).toEqual([]);
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(
    page.getByText("Your name is updated.", { exact: true }),
  ).toBeVisible();
  const newEmail = `demo-updated-${Date.now()}@example.test`;
  await page.getByLabel("New email", { exact: true }).fill(newEmail);
  await page.locator("#email-current-password").fill(demoPassword);
  await page
    .getByRole("button", { name: "Send verification link", exact: true })
    .click();
  await expect(page).toHaveURL(/check-email\?flow=/);
  await page.getByRole("link", { name: "Verify email", exact: true }).click();
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Email verified." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to your case" }).click();
  await expect(page).toHaveURL(/\/case\/[0-9a-f-]{36}/);
  await page.goto("/account");
  await page.locator("#current-password").fill(demoPassword);
  await page.locator("#new-password").fill("A new demo passphrase");
  await page.locator("#confirm-password").fill("A new demo passphrase");
  await page
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByText(
      "Your password is updated. Sign in with your new password.",
      { exact: true },
    ),
  ).toBeVisible();
  await signin(page, newEmail, "A new demo passphrase");
});
test("WCAG AA checks, timed sign-in lockout, and zoom reflow", async ({
  page,
  browser,
}) => {
  for (const route of [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password?token=invalid",
    "/check-email",
  ]) {
    await page.goto(route);
    await expect(page.locator("#auth-main h1")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill("not-an-account@example.test");
  await page.getByLabel("Password", { exact: true }).fill("wrong password");
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    if (i < 4)
      await expect(
        page.getByText("Email or password is incorrect.", { exact: true }),
      ).toBeVisible();
  }
  await expect(
    page.getByText("Too many attempts. Try again in 5 min.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try again in 5 min" }),
  ).toBeDisabled();
  await page
    .getByLabel("Email", { exact: true })
    .fill("different-address@example.test");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
  const context = await browser.newContext({
    viewport: { width: 720, height: 450 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const zoomPage = await context.newPage();
  await zoomPage.goto("http://127.0.0.1:3012/signup");
  await expect(zoomPage.locator("#auth-main h1")).toBeVisible();
  expect(
    await zoomPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.close();
});
