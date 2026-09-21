import { test, expect } from "@playwright/test";

test("claim edits survive consulting a reference and switching tasks", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Trip purpose").fill("September client visit");
  await page.getByLabel("Expense type").selectOption("Accommodation");
  await page
    .getByLabel("Additional details")
    .fill("Confirm the amount before submitting.");
  await page
    .getByRole("button", { name: "Travel policy", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Travel policy" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choose a team browser", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Submit travel claim", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Travel policy" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Expense form", exact: true }).click();
  await expect(page.getByLabel("Trip purpose")).toHaveValue(
    "September client visit",
  );
  await expect(page.getByLabel("Expense type")).toHaveValue("Accommodation");
  await expect(page.getByLabel("Additional details")).toHaveValue(
    "Confirm the amount before submitting.",
  );
  await expect(
    page.getByRole("combobox", { name: "Receipt", exact: true }),
  ).toHaveValue("train-receipt.pdf");
  await expect(
    page.getByRole("status").filter({ hasText: "Unsaved changes" }),
  ).toBeVisible();
});

test("pause keeps the live form and next step, and resume returns it to Active", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Trip purpose").fill("A claim to come back to");
  await page.getByRole("button", { name: "Put aside", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Put this task aside" });
  await expect(
    drawer.getByText("Keeping the page open does not save the form."),
  ).toBeVisible();
  await drawer
    .getByLabel("Where I left off")
    .fill("Check the AUD 24.00 receipt before submitting.");
  await drawer.getByRole("button", { name: "Keep page open & pause" }).click();
  await expect(
    page
      .getByRole("region", { name: "Later tasks" })
      .getByRole("button", { name: "Submit travel claim", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Submit travel claim", exact: true })
    .click();
  await expect(
    page.getByText("Check the AUD 24.00 receipt before submitting.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume task", exact: true }).click();
  await expect(page.getByLabel("Trip purpose")).toHaveValue(
    "A claim to come back to",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "Unsaved changes" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Active tasks" })
      .getByRole("button", { name: "Submit travel claim", exact: true }),
  ).toBeVisible();
});

for (const exit of ["Back to form", "Close pause drawer", "Escape"]) {
  test(`cancel with ${exit} discards the provisional note and restores focus`, async ({
    page,
  }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", {
      name: "Put aside",
      exact: true,
    });
    await trigger.click();
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Where I left off").fill("Do not keep this note");
    if (exit === "Escape") await page.keyboard.press("Escape");
    else await drawer.getByRole("button", { name: exit, exact: true }).click();
    await expect(drawer).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.press("Enter");
    await expect(drawer.getByLabel("Where I left off")).toHaveValue(
      "Receipt attached. Check the amount, then submit.",
    );
  });
}

test("notes enforce 500 characters without truncation and allow an empty next step", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Put aside", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByLabel("Where I left off").fill("a".repeat(501));
  await expect(drawer.getByRole("alert")).toContainText("500 characters");
  await expect(drawer.getByLabel("Where I left off")).toHaveValue(
    "a".repeat(501),
  );
  await expect(
    drawer.getByRole("button", { name: "Keep page open & pause" }),
  ).toBeDisabled();
  await drawer.getByLabel("Where I left off").fill("a".repeat(500));
  await drawer.getByRole("button", { name: "Keep page open & pause" }).click();
  await page
    .getByRole("button", { name: "Submit travel claim", exact: true })
    .click();
  await expect(page.getByText("a".repeat(500), { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume task" }).click();
  await page.getByRole("button", { name: "Put aside", exact: true }).click();
  await drawer.getByLabel("Where I left off").fill("");
  await drawer.getByRole("button", { name: "Keep page open & pause" }).click();
  await page
    .getByRole("button", { name: "Submit travel claim", exact: true })
    .click();
  await expect(page.getByText("No next step recorded.")).toBeVisible();
});

test("pausing the last active task leaves a resumable context without duplicating pages", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Put aside", exact: true }).click();
  await page.getByRole("button", { name: "Keep page open & pause" }).click();
  await page.getByRole("button", { name: "Put aside", exact: true }).click();
  await page.getByRole("button", { name: "Pause task", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Active tasks" }).getByRole("heading"),
  ).toHaveText("Active0");
  await expect(
    page.getByRole("region", { name: "Later tasks" }).getByRole("heading"),
  ).toHaveText("Later2");
  await page.getByRole("button", { name: "Resume task" }).click();
  await expect(
    page.getByRole("heading", { name: "Team requirements" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Team requirements", exact: true }),
  ).toHaveCount(1);
});

test("a next step can be edited without pausing the task", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Task notes", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Task notes" });
  await drawer
    .getByLabel("Where I left off")
    .fill("Check the policy exception.");
  await drawer.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Active tasks" })
      .getByRole("button", { name: "Submit travel claim", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Put aside", exact: true }).click();
  await expect(page.getByLabel("Where I left off")).toHaveValue(
    "Check the policy exception.",
  );
});
