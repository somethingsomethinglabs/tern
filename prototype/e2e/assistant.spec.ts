import { test, expect } from "@playwright/test";

test("reviewing a source-backed sample recap preserves the form and only keeps accepted text", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Put aside", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Put this task aside" });
  await drawer
    .getByLabel("Where I left off")
    .fill("A note kept while inspecting evidence");
  await drawer.getByRole("link", { name: "Receipt", exact: true }).click();
  await expect(
    drawer.getByRole("heading", { name: "Rail travel receipt" }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "Back to pause" }).click();
  await expect(drawer.getByLabel("Where I left off")).toHaveValue(
    "A note kept while inspecting evidence",
  );
  await drawer.getByRole("button", { name: "Edit recap" }).click();
  await drawer
    .getByLabel("Draft recap")
    .fill("Checked the receipt and policy.");
  await drawer.getByRole("button", { name: "Keep recap", exact: true }).click();
  await drawer.getByRole("button", { name: "Keep page open & pause" }).click();
  await page
    .getByRole("button", { name: "Submit travel claim", exact: true })
    .click();
  await expect(
    page.getByText("Checked the receipt and policy.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume task" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Unsaved changes" }),
  ).toBeVisible();
});

for (const mode of ["stopped", "off"]) {
  test(`the core journey works with assistant ${mode}`, async ({ page }) => {
    await page.goto("/");
    await page.getByText("Prototype controls", { exact: true }).click();
    await page.getByLabel("Assistant example").selectOption(mode);
    await page.getByRole("button", { name: "Put aside", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Sample AI recap" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Keep page open & pause" }).click();
    await page
      .getByRole("button", { name: "Submit travel claim", exact: true })
      .click();
    await page.getByRole("button", { name: "Resume task" }).click();
    await expect(page.getByLabel("Trip purpose")).toHaveValue(
      "Client workshop",
    );
    await expect(
      page.getByRole("status").filter({ hasText: "Unsaved changes" }),
    ).toBeVisible();
  });
}

test("pausing never accepts an unreviewed or discarded recap", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Put aside", exact: true }).click();
  await page.getByRole("button", { name: "Edit recap" }).click();
  await page.getByLabel("Draft recap").fill("Unreviewed text");
  await page.getByRole("button", { name: "Discard draft" }).click();
  await page.getByRole("button", { name: "Keep page open & pause" }).click();
  await page
    .getByRole("button", { name: "Submit travel claim", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Kept recap" })).toHaveCount(
    0,
  );
  await expect(page.getByText("Unreviewed text")).toHaveCount(0);
});
