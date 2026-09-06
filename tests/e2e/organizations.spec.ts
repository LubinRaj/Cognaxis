import type { Page } from "@playwright/test";
import { expect, hardenContext, test } from "./fixtures/test";
import { createVerifiedUser, type SyntheticAccount } from "./support/accounts";
import { signIn } from "./support/ui";

async function createOrganization(page: Page, name: string): Promise<string> {
  await page.goto("/app/organizations");
  await page.getByRole("button", { name: "New team" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Create team" }).click();
  // Creation opens the new organization's workspace directly.
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const organizationId = page.url().split("/").at(-1);
  expect(organizationId, "the organization workspace URL must include its ID").toBeTruthy();
  return organizationId as string;
}

async function createInviteLink(page: Page, role?: "viewer" | "admin"): Promise<string> {
  await page.getByRole("tab", { name: "Invites" }).click();
  if (role) {
    await page.getByLabel("Role", { exact: true }).selectOption(role);
  }
  await page.getByRole("button", { name: "Create invitation link" }).click();
  const link = await page.getByTestId("invite-link").textContent();
  expect(link, "the one-time invitation link must be shown").toBeTruthy();
  return new URL(link ?? "").pathname + new URL(link ?? "").search + new URL(link ?? "").hash;
}

async function signInFromInvite(page: Page, account: SyntheticAccount, invitePath: string) {
  await page.goto(invitePath);
  await expect(
    page.getByRole("heading", { name: "You have been invited to an organization" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign in to continue" }).click();
  const form = page.locator("form");
  await form.getByLabel("Email").fill(account.email);
  await form.getByLabel("Password", { exact: true }).fill(account.password);
  await form.getByRole("button", { name: "Sign in" }).click();
}

async function acceptInvite(page: Page, account: SyntheticAccount, invitePath: string) {
  await signInFromInvite(page, account, invitePath);
  await expect(page.getByRole("heading", { name: /^Join / })).toBeVisible();
  await page.getByRole("button", { name: "Join organization" }).click();
}

test.describe("organizations", () => {
  test("owner invites a member, adjusts their role, and removes them across live sessions", async ({
    page,
    browser,
  }) => {
    const owner = await createVerifiedUser("owner");
    const member = await createVerifiedUser("member");

    await signIn(page, owner);
    const organizationId = await createOrganization(page, "Research Group");
    await expect(page.getByText("Owner", { exact: true }).first()).toBeVisible();
    const invitePath = await createInviteLink(page);

    // The invitation is accepted exactly once, in a completely separate browser session.
    const memberContext = await browser.newContext();
    const memberReport = await hardenContext(memberContext, /Failed to load resource/);
    const memberPage = await memberContext.newPage();
    await acceptInvite(memberPage, member, invitePath);
    await expect(memberPage.getByRole("heading", { name: "Research Group" })).toBeVisible();

    // The member sees the workspace but none of the owner-only surfaces.
    await expect(memberPage.getByText("Member", { exact: true }).first()).toBeVisible();
    await expect(memberPage.getByRole("tab", { name: "Settings" })).toHaveCount(0);
    await expect(memberPage.getByRole("tab", { name: "Invites" })).toHaveCount(0);
    await expect(memberPage.getByRole("button", { name: /^Manage / })).toHaveCount(0);

    // Reflection creation is centralized in Home. Selecting the team here changes only the
    // destination of the same personal reflection UI; it never opens an editable team workspace.
    await memberPage.goto("/app/journal");
    await memberPage
      .locator('select[aria-label="Reflection space"]:visible')
      .selectOption(`team:${organizationId}`);
    await memberPage.getByRole("button", { name: "New reflection" }).click();
    await expect(memberPage.getByLabel("Write your reflection")).toBeVisible();
    await memberPage.getByLabel("Write your reflection").fill("A shared thought for the group.");
    await memberPage.getByRole("button", { name: "Send message" }).click();
    await expect(memberPage.getByText("Test reflection response 1")).toBeVisible();
    await memberPage.locator('select[aria-label="Reflection space"]:visible').selectOption("personal");
    await expect(
      memberPage.getByRole("heading", { name: "Start your first reflection" }),
    ).toBeVisible();

    // Team management remains on the organization route.
    await memberPage.goto(`/app/organizations/${organizationId}`);
    await expect(memberPage.getByRole("heading", { name: "Research Group" })).toBeVisible();

    // The owner demotes the member to viewer; the change is visible on the member's next load.
    // Organization membership is loaded when the workspace opens, so refresh the owner's already
    // open workspace after the invite has been accepted in the separate session.
    await page.reload();
    await expect(page.getByRole("tab", { name: "Members (2)" })).toBeVisible();
    await page.getByRole("tab", { name: /Members/ }).click();
    await page.getByRole("button", { name: `Manage ${member.email}` }).click();
    await page.getByRole("menuitem", { name: "Make viewer" }).click();
    await expect(page.getByText("Role updated.")).toBeVisible();

    await memberPage.reload();
    await expect(memberPage.getByText("Viewer", { exact: true }).first()).toBeVisible();
    await memberPage.getByRole("tabpanel").getByRole("list").getByRole("button").first().click();
    await expect(memberPage.getByText("Test reflection response 1")).toBeVisible();
    await expect(memberPage.getByText(/Team reflections are read-only here/)).toBeVisible();
    await expect(memberPage.getByLabel("Message to the organization")).toHaveCount(0);

    // The owner removes the viewer entirely; the removed session loses access on its next
    // request.
    await page.getByRole("button", { name: `Manage ${member.email}` }).click();
    await page.getByRole("menuitem", { name: "Remove from organization" }).click();
    const removeDialog = page.getByRole("dialog");
    await expect(removeDialog.getByRole("heading", { name: "Remove this member?" })).toBeVisible();
    await removeDialog.getByRole("button", { name: "Remove member" }).click();
    await expect(page.getByText("Member removed.")).toBeVisible();

    await memberPage.reload();
    await expect(
      memberPage.getByRole("heading", { name: "This organization could not be opened" }),
    ).toBeVisible();

    expect(memberReport.errors).toEqual([]);
    await memberContext.close();
  });

  test("incomplete and revoked invitations fail safely", async ({ page, browser }) => {
    const owner = await createVerifiedUser("inviteowner");
    const invitee = await createVerifiedUser("invitee");

    await signIn(page, owner);
    await createOrganization(page, "Careful Org");
    const invitePath = await createInviteLink(page, "viewer");

    // Revoke the freshly created invitation.
    await page.getByRole("button", { name: "Revoke" }).first().click();
    await expect(page.getByText("Invitation revoked.")).toBeVisible();

    const inviteeContext = await browser.newContext();
    const inviteeReport = await hardenContext(inviteeContext, /Failed to load resource/);
    const inviteePage = await inviteeContext.newPage();

    // An incomplete link never reaches the server.
    await inviteePage.goto("/join?org=only-half-a-link");
    await expect(
      inviteePage.getByRole("heading", { name: "This invitation link is incomplete" }),
    ).toBeVisible();

    // The revoked link authenticates but is rejected with the safe generic message.
    await signInFromInvite(inviteePage, invitee, invitePath);
    await expect(
      inviteePage.getByRole("heading", { name: "Invitation not accepted" }),
    ).toBeVisible();
    await expect(
      inviteePage.getByText("This invitation is not valid any more. Ask for a new link."),
    ).toBeVisible();

    expect(inviteeReport.errors).toEqual([]);
    await inviteeContext.close();
  });

  test("keeps reflection creation and Ask Me out of team management", async ({ page }) => {
    const owner = await createVerifiedUser("managementowner");
    await signIn(page, owner);
    await createOrganization(page, "Management Only Team");
    // The global Home entry point stays available everywhere, including Teams. The team page
    // itself must remain read-only and cannot host a second composition flow.
    await expect(page.getByRole("button", { name: "New reflection" })).toHaveCount(1);
    await expect(page.getByLabel("Write your reflection")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Ask team/i })).toHaveCount(0);
    await expect(page.getByText(/Team update/)).toHaveCount(0);
  });
});
