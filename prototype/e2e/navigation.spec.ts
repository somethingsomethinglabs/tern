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

test("Settled can be collapsed and reopened to inspect references without reactivating work", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settle task" }).click();
  const settled = page.getByRole("region", { name: "Settled tasks" });
  await page.getByRole("button", { name: "Toggle Settled tasks" }).click();
  await expect(
    settled.getByRole("button", { name: "Submit travel claim", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle Settled tasks" }).click();
  await settled
    .getByRole("button", { name: "Travel policy", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Travel policy" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Reopen task" })).toBeVisible();
});
