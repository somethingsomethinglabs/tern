import { test, expect } from "@playwright/test";

test("only a website save clears unsaved state and allows settlement", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settle task", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Finish and save");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settle task", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Settled tasks" })
      .getByRole("button", { name: "Submit travel claim", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Receipt attached. Check the amount, then submit.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reopen task" }).click();
  await page.getByLabel("Trip purpose").fill("One more thing");
  await expect(
    page.getByRole("status").filter({ hasText: "Unsaved changes" }),
  ).toBeVisible();
});

test("failed saves retain edits and a delayed retry cannot mark newer edits saved", async ({
  page,
}) => {
  await page.goto("/?save=fail-once&delay=900");
  await page.getByLabel("Trip purpose").fill("Original value");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not save" }),
  ).toBeVisible();
  await expect(page.getByLabel("Trip purpose")).toHaveValue("Original value");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByLabel("Trip purpose").fill("Newer value");
  await page.getByRole("button", { name: "Settle task", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Finish and save" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("status").filter({ hasText: "Unsaved changes" }),
  ).toBeVisible();
  await page.getByLabel("Trip purpose").fill("Original value");
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
});

test("sample submission validates required fields, handles failure, and needs an explicit retry", async ({
  page,
}) => {
  await page.goto("/?submit=fail-once");
  await page.getByLabel("Trip purpose").fill("");
  await page
    .getByRole("combobox", { name: "Receipt", exact: true })
    .selectOption("");
  await page.getByRole("button", { name: "Submit claim", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Enter a trip purpose");
  await expect(page.getByRole("alert")).toContainText(
    "Attach the sample receipt",
  );
  await page.getByLabel("Trip purpose").fill("Verified client workshop");
  await page
    .getByRole("combobox", { name: "Receipt", exact: true })
    .selectOption("train-receipt.pdf");
  await page.getByRole("button", { name: "Submit claim", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not submit");
  await expect(page.getByLabel("Trip purpose")).toHaveValue(
    "Verified client workshop",
  );
  await page.getByRole("button", { name: "Submit claim", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sample claim submitted" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Active tasks" })
      .getByRole("button", { name: "Submit travel claim", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settle task" }).click();
  await expect(page.getByRole("button", { name: "Reopen task" })).toBeVisible();
});

test("an unknown website state is never presented as saved", async ({
  page,
}) => {
  await page.goto("/?status=unknown");
  await expect(
    page.getByRole("status").filter({ hasText: "Page state unknown" }),
  ).toBeVisible();
  await expect(page.getByText("Draft saved", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Settle task" }).click();
  await expect(page.getByRole("alert")).toContainText("Check the website");
});
