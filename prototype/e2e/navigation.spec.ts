import { test, expect } from "@playwright/test";

test("back and forward retain edits and cancelling reload preserves the live form", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Trip purpose").fill("Keep this draft");
  await page
    .getByRole("button", { name: "Travel policy", exact: true })
    .click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Trip purpose")).toHaveValue("Keep this draft");
  await page.getByRole("button", { name: "Forward", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Travel policy" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Reload sample page", exact: true })
    .click();
  await expect(page.getByLabel("Trip purpose")).toHaveValue("Keep this draft");
});
