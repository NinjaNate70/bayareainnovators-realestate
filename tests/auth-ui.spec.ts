import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
declare global {
  interface Window {
    authTestUploadReady?: boolean;
    authTestReleaseUpload?: () => void;
  }
}
test.setTimeout(120_000);
const password = "A calm tenant passphrase";
const termsLabel =
  "I agree to the Terms of Service and Privacy Policy, including a 10% success fee (max $75) only if Tenant Shield helps me recover money.";
const photo = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("a signed-out visitor can explore all four tabs of the public demo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Explore the example", exact: true }).click();
  await expect(page).toHaveURL(/\/case\/demo$/, { timeout: 8000 });
  await expect(page.getByRole("heading", { name: "782 Cedar Street", exact: true })).toBeVisible({ timeout: 8000 });
  await expect(page.locator(".charge-card")).toHaveCount(6);
  await page.locator(".charge-card").filter({ hasText: "Professional cleaning" }).getByRole("button", { name: "L01", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Security deposit itemization", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(0);
  await page.keyboard.press("Escape");

  const tabs = page.getByRole("navigation", { name: "Case", exact: true });
  await tabs.getByRole("link", { name: "Photos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Possible ordinary wear" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Bedroom · move-out" })).toBeVisible();
  await page.getByRole("button", { name: "Highlight example marks" }).click();
  await expect(page.getByRole("button", { name: "Hide example marks" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add photos", exact: true })).toHaveCount(0);

  await tabs.getByRole("link", { name: "Letter", exact: true }).click();
  await page.getByRole("button", { name: "Generate draft" }).click();
  await expect(page.getByLabel("Edit demand letter")).toHaveValue(/Alex Morgan/);
  await tabs.getByRole("link", { name: "Replies", exact: true }).click();
  await expect(page.getByLabel("Landlord response")).toHaveValue(/cleaning/i);
  await page.getByRole("button", { name: "Prepare reply", exact: true }).click();
  await expect(page.getByLabel("Edit suggested reply")).toHaveValue(/Cedar Street/);
  await tabs.getByRole("link", { name: "Letter", exact: true }).click();
  await expect(page.getByLabel("Edit demand letter")).toHaveValue(/Alex Morgan/);
  await tabs.getByRole("link", { name: "Replies", exact: true }).click();
  await expect(page.getByLabel("Edit suggested reply")).toHaveValue(/Cedar Street/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Prepare reply", exact: true })).toBeVisible();

  await page.goto("/login");
  await page.getByRole("link", { name: "View demo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "782 Cedar Street", exact: true })).toBeVisible();
  await page.goto("/case/new");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await page.goto("/case/c1f4daa9-5434-4098-8b07-63d5abdac7c1");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
});

test("the public demo works from Help and the phone navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Get help" }).click();
  await page.getByRole("link", { name: "Explore the example case" }).click();
  await expect(page.getByRole("heading", { name: "782 Cedar Street" })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Case navigation" });
  await tabs.getByRole("link", { name: "Photos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Possible ordinary wear" })).toBeVisible();
});

async function signupAndVerify(page: Page, email: string, name = "Test Renter") {
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel(termsLabel, { exact: true }).check();
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
}
async function signup(page: Page, email: string, name?: string) {
  await signupAndVerify(page, email, name);
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
test("legal links are available on public and signed-in screens", async ({
  page,
}) => {
  const legal = page.getByRole("navigation", { name: "Legal" });
  const termsLink = legal.getByRole("link", { name: "Terms of Service" });
  const privacyLink = legal.getByRole("link", { name: "Privacy Policy" });

  for (const route of ["/", "/login", "/inspections"]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(termsLink).toHaveAttribute("href", "/terms");
    await expect(privacyLink).toHaveAttribute("href", "/privacy");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await signupAndVerify(page, `legal-links-${Date.now()}@example.test`);
  await page.goto("/case/new");
  await expect(
    page.getByRole("heading", { name: "Let’s put your case together." }),
  ).toBeVisible();
  for (const [link, pathname, heading] of [
    [termsLink, "/terms", "Terms"],
    [privacyLink, "/privacy", "Privacy"],
  ] as const) {
    const [policy] = await Promise.all([
      page.waitForEvent("popup"),
      link.click(),
    ]);
    await expect(policy).toHaveURL((url) => url.pathname === pathname);
    await expect(
      policy.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(policy.getByRole("navigation", { name: "Legal" })).toBeVisible();
    await policy.close();
  }
  await expect(page).toHaveURL(/\/case\/new/);
});

test("Start your case opens intake across sign-in and screen sizes", async ({
  page,
}) => {
  const expectNavigation = expect.configure({ timeout: 20_000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("link", { name: "Start your case" }).click();
  await expectNavigation(page).toHaveURL(/\/login\?returnTo=%2Fcase%2Fnew$/i);
  await expectNavigation(
    page.getByRole("heading", { name: "Sign in to start your case." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create an account" }).click();
  await expectNavigation(page).toHaveURL(/\/signup\?returnTo=%2Fcase%2Fnew$/i);
  await expectNavigation(
    page.getByRole("heading", { name: "Create an account to start your case." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await page.getByText("Development demo account", { exact: true }).click();
  await page.getByRole("button", { name: "Use demo account" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const firstStep = page.getByRole("heading", {
    name: "Start with the deduction letter",
  });
  await expectNavigation(firstStep).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("link", { name: "Save & exit" }).click();
  await page.getByRole("link", { name: "Start your case" }).click();
  await expectNavigation(firstStep).toBeVisible();
});
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
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
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
      path: test.info().outputPath(`login-${width}.png`),
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
  await expect(
    page.getByRole("heading", { name: "A place for your case." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("signup-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 812, height: 375 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});
test("a cancelled Google sign-in returns to sign in with a clear message", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(
    "/auth/callback?error=access_denied&error_description=The+user+denied+access",
  );
  await expect(page).toHaveURL(/\/login\?error=oauth$/);
  await expect(
    page.getByText(
      "We couldn’t finish signing in with Google. Try again, or sign in with your email and password.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
test("money fields behave the same, and a case can be saved without itemized charges", async ({
  page,
}) => {
  await signup(page, `money-${Date.now()}@example.test`);
  await page.getByLabel("No letter / enter manually").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Property address")
    .fill("9 Money Street, San Luis Obispo, CA");
  const deposit = page.getByLabel("Deposit paid ($)");
  const returned = page.getByLabel("Amount returned ($)");
  await expect(deposit).toHaveValue("0");
  await deposit.click();
  await page.keyboard.type("1500");
  await expect(deposit).toHaveValue("1500");
  await expect(deposit).toHaveAttribute("step", "any");
  await deposit.press("ArrowUp");
  await expect(deposit).toHaveValue("1501");
  await deposit.hover();
  await page.mouse.wheel(0, 400);
  await expect(deposit).toHaveValue("1501");
  await returned.click();
  await page.keyboard.type("12.5");
  await expect(returned).toHaveValue("12.5");
  await returned.fill("0");
  await page.getByRole("button", { name: "Add charge", exact: true }).click();
  const amount = page.getByRole("spinbutton", { name: "Charge 1 amount" });
  await amount.click();
  await page.keyboard.type("250");
  await expect(amount).toHaveValue("250");
  await page
    .getByRole("button", { name: "Remove charge 1", exact: true })
    .click();
  await expect(page.getByText("No charges entered yet")).toHaveCount(0);
  // Zero charges: Continue works and no "Fix this to continue" banner appears.
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/step=photos/);
  await expect(page.getByText("Fix this to continue")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page.getByText("No charges entered yet")).toBeVisible();
  await page.getByRole("button", { name: "Save case", exact: true }).click();
  await expect(page).toHaveURL(/\/case\/[0-9a-f-]{36}$/);
  await expect(page.getByText("No itemized charges to audit.")).toBeVisible();
  await expect(page.getByText("$0", { exact: true })).toHaveCount(0);
  // "Prepare reply" is visible without scrolling on a laptop screen.
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`${page.url()}?tab=replies`);
  await expect(
    page.getByRole("button", { name: "Prepare reply", exact: true }),
  ).toBeInViewport();
});
test("uploads use one clean drop zone with thumbnails", async ({ page }) => {
  await signup(page, `drop-${Date.now()}@example.test`);
  await page.getByLabel("No letter / enter manually").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Property address")
    .fill("5 Drop Street, San Luis Obispo, CA");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/step=photos/);
  const prompt = page.getByText("Drop files here or browse");
  await expect(prompt.first()).toBeVisible();
  // The native input stays for keyboard and screen readers, but is not visible.
  const input = page.getByLabel("Move-in photos (optional)", { exact: true });
  expect(await input.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
  // Clicking the prompt opens the file chooser, so the whole zone is the target.
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    prompt.first().click(),
  ]);
  await chooser.setFiles({ name: "move-in.png", mimeType: "image/png", buffer: photo });
  await expect(
    page.getByRole("button", { name: "Remove move-in.png", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".file-list img.file-thumb")).toHaveCount(1);
  await expect(page.getByText("Saving 1 file")).toHaveCount(0);
});
test("Create account stays disabled until the terms are accepted", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill("Terms Renter");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`terms-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const submit = page.getByRole("button", {
    name: "Create account",
    exact: true,
  });
  const terms = page.getByLabel(termsLabel, { exact: true });
  await expect(terms).not.toBeChecked();
  await expect(submit).toBeDisabled();
  await terms.check();
  await expect(submit).toBeEnabled();
  await terms.uncheck();
  await expect(submit).toBeDisabled();
  await terms.blur();
  await expect(terms).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByText(
      "Fix this: Agree to the Terms of Service and Privacy Policy to continue.",
    ),
  ).toBeVisible();
  for (const [name, href] of [
    ["Terms of Service", "/terms"],
    ["Privacy Policy", "/privacy"],
  ]) {
    const link = page.getByRole("main").getByRole("link", { name, exact: true });
    await expect(link).toHaveAttribute("href", href);
    await expect(link).toHaveAttribute("target", "_blank");
  }
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
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
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
  expect(pageErrors).toEqual([]);
  await context.close();
});
