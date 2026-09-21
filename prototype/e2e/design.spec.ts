import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

for (const width of [1488, 900]) {
  test(`pause controls remain usable at desktop width ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1058 });
    await page.goto("/");
    await page.getByRole("button", { name: "Put aside", exact: true }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByLabel("Where I left off")).toBeVisible();
    const bounds = await drawer.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    await drawer
      .getByLabel("Where I left off")
      .fill("Receipt attached. Check the amount, then submit.");
    await mkdir("../design/qa", { recursive: true });
    await page.screenshot({ path: `../design/qa/pause-${width}.png` });
    await drawer
      .getByRole("button", { name: "Keep page open & pause" })
      .click();
    await expect(drawer).not.toBeVisible();
  });
}

test("the main pause and resume journey is keyboard operable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Trip purpose").press("ControlOrMeta+A");
  await page.getByLabel("Trip purpose").pressSequentially("Keyboard journey");
  await page
    .getByRole("button", { name: "Put aside", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("button", { name: "Close pause drawer" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Where I left off")).toBeFocused();
  await page.getByLabel("Where I left off").press("ControlOrMeta+A");
  await page
    .getByLabel("Where I left off")
    .pressSequentially("Continue with the receipt");
  await page
    .getByRole("button", { name: "Keep page open & pause" })
    .press("Enter");
  await page
    .getByRole("button", { name: "Submit travel claim", exact: true })
    .press("Enter");
  await page.getByRole("button", { name: "Resume task" }).press("Enter");
  await expect(page.getByLabel("Trip purpose")).toHaveValue("Keyboard journey");
});
