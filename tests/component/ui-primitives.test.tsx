import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { Button } from "../../src/client/components/ui/Button";
import { IconButton } from "../../src/client/components/ui/IconButton";
import { InlineAlert } from "../../src/client/components/ui/InlineAlert";
import { TextField } from "../../src/client/components/ui/TextField";
import { Chip } from "../../src/client/components/ui/Chip";
import { EmptyState } from "../../src/client/components/ui/EmptyState";
import { Avatar, deriveInitials } from "../../src/client/components/ui/Avatar";
import { Dialog } from "../../src/client/components/ui/Dialog";
import { Menu } from "../../src/client/components/ui/Menu";

async function scan(): Promise<string> {
  const results = await axe.run(document.body, {
    rules: { "color-contrast": { enabled: false }, "target-size": { enabled: false } },
    resultTypes: ["violations"],
  });
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help}`)
    .join("\n");
}

describe("Button", () => {
  it("does not fire while disabled or loading", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    const { rerender } = render(
      <Button onClick={onClick} disabled>
        Save
      </Button>,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).not.toHaveBeenCalled();

    rerender(
      <Button onClick={onClick} loading>
        Save
      </Button>,
    );
    const loadingButton = screen.getByRole("button", { name: "Save" });
    expect(loadingButton).toBeDisabled();
    expect(loadingButton).toHaveAttribute("aria-busy", "true");
    await user.click(loadingButton);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps its accessible name while loading so the width stays stable", () => {
    render(
      <Button loading loadingLabel="Saving…">
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: /Save/ });
    expect(within(button).getByText("Save")).toHaveClass("sr-only");
    expect(within(button).getByText("Saving…")).toBeVisible();
  });

  it("defaults to type button so it never submits a surrounding form by accident", () => {
    render(<Button>Continue</Button>);
    expect(screen.getByRole("button", { name: "Continue" })).toHaveAttribute("type", "button");
  });

  it("renders every variant without a page-specific colour", () => {
    const variants = ["filled", "tonal", "outlined", "text", "destructive"] as const;
    render(
      <>
        {variants.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
      </>,
    );

    for (const variant of variants) {
      const className = screen.getByRole("button", { name: variant }).className;
      expect(className).not.toMatch(/emerald|teal|zinc|slate|sky-\d/);
    }
  });
});

describe("IconButton", () => {
  it("always exposes an accessible name", () => {
    render(<IconButton icon="delete" label="Delete reflection" />);
    expect(screen.getByRole("button", { name: "Delete reflection" })).toBeInTheDocument();
  });

  it("reports pressed state when active", () => {
    render(<IconButton icon="search" label="Search" active />);
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps an explicit icon color when the button has a filled tone", () => {
    render(
      <IconButton
        icon="check"
        label="Finish recording"
        tone="primary"
        iconClassName="text-on-primary"
        className="bg-primary text-on-primary"
      />,
    );

    expect(screen.getByRole("button", { name: "Finish recording" }).querySelector("svg")).toHaveClass("text-on-primary");
  });
});

describe("InlineAlert", () => {
  it("conveys tone with an icon and text, not colour alone", () => {
    render(<InlineAlert tone="error">Something went wrong.</InlineAlert>);

    const alert = screen.getByRole("status");
    expect(within(alert).getByText("Error:")).toBeInTheDocument();
    expect(alert.querySelector("svg")).not.toBeNull();
  });

  it("interrupts only when the change is urgent", () => {
    const { rerender } = render(<InlineAlert>Saved.</InlineAlert>);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");

    rerender(<InlineAlert urgent>Session expired.</InlineAlert>);
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
  });

  it("can be dismissed", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<InlineAlert onDismiss={onDismiss}>Notice</InlineAlert>);

    await user.click(screen.getByRole("button", { name: "Dismiss message" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("TextField", () => {
  it("associates label, hint, and error with the input", () => {
    const { rerender } = render(<TextField label="Email" hint="We never share it." value="" onChange={() => undefined} />);

    const input = screen.getByLabelText("Email");
    const hintId = input.getAttribute("aria-describedby");
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId!)).toHaveTextContent("We never share it.");

    rerender(<TextField label="Email" error="Enter a valid email address." value="x" onChange={() => undefined} />);
    const invalid = screen.getByLabelText("Email");
    expect(invalid).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
  });

  it("offers a clear action only when there is text", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    const { rerender } = render(
      <TextField label="Search" value="" onChange={() => undefined} onClear={onClear} />,
    );
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();

    rerender(<TextField label="Search" value="notes" onChange={() => undefined} onClear={onClear} />);
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("keeps a hidden label available to assistive technology", () => {
    render(<TextField label="Search reflections" hideLabel value="" onChange={() => undefined} />);
    expect(screen.getByLabelText("Search reflections")).toBeInTheDocument();
  });
});

describe("Chip", () => {
  it("renders a static label without a button role", () => {
    render(<Chip>Clarity</Chip>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Clarity")).toBeInTheDocument();
  });

  it("becomes an activatable control when given a handler", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>Reflect on today</Chip>);

    await user.click(screen.getByRole("button", { name: "Reflect on today" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Avatar", () => {
  it("derives safe initials and never renders untrusted markup", () => {
    expect(deriveInitials("Ada Lovelace")).toBe("AL");
    expect(deriveInitials(null, "ada.lovelace@example.test")).toBe("AL");
    expect(deriveInitials("  ", "  ")).toBe("C");
    expect(deriveInitials("💥")).toBe("C");
  });

  it("strips markup and punctuation out of the derived initials", () => {
    for (const hostile of [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      "‮evil",
      "{{constructor}}",
    ]) {
      const initials = deriveInitials(hostile);
      expect(initials).toMatch(/^[\p{L}\p{N}]{1,2}$/u);
    }
  });

  it("is hidden from assistive technology because adjacent text names the account", () => {
    const { container } = render(<Avatar displayName="Ada Lovelace" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("EmptyState", () => {
  it("renders a heading at the requested level with actions", () => {
    render(
      <EmptyState
        icon="chat_bubble"
        title="Start your first reflection"
        description="Private conversations that turn into useful summaries."
        headingLevel={3}
        actions={<Button>New reflection</Button>}
      />,
    );

    expect(screen.getByRole("heading", { level: 3, name: "Start your first reflection" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New reflection" })).toBeInTheDocument();
  });
});

describe("Dialog", () => {
  function Harness({ busy = false, onClose = vi.fn() }: { busy?: boolean; onClose?: () => void }) {
    return (
      <>
        <button type="button">Outside control</button>
        <Dialog
          open
          title="Delete this reflection?"
          description="This cannot be undone."
          onClose={onClose}
          busy={busy}
          actions={
            <>
              <Button variant="text" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="destructive">Delete reflection</Button>
            </>
          }
        />
      </>
    );
  }

  it("is a labelled modal with a description", () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog");

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Delete this reflection?");
    expect(dialog).toHaveAccessibleDescription("This cannot be undone.");
  });

  it("traps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = screen.getByRole("dialog");

    for (let index = 0; index < 8; index += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("closes on Escape and on backdrop click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<Harness onClose={onClose} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Harness onClose={onClose} />);
    await user.click(screen.getByTestId("dialog-scrim"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("cannot be dismissed while irreversible work is in flight", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness busy onClose={onClose} />);

    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("dialog-scrim"));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeDisabled();
  });

  it("locks page scrolling while open and restores it on close", () => {
    const { unmount } = render(<Harness />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("restores focus to the previously focused control", async () => {
    const user = userEvent.setup();

    function ToggleHarness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open dialog
          </button>
          <Dialog
            open={open}
            title="Export reflection"
            onClose={() => setOpen(false)}
            actions={<Button onClick={() => setOpen(false)}>Done</Button>}
          />
        </>
      );
    }

    render(<ToggleHarness />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("reports no serious accessibility violations", async () => {
    render(<Harness />);
    expect(await scan()).toBe("");
  });
});

describe("Menu", () => {
  const items = [
    { id: "export", label: "Export", icon: "download" as const, onSelect: vi.fn() },
    { id: "delete", label: "Delete reflection", tone: "destructive" as const, onSelect: vi.fn(), separated: true },
  ];

  function MenuHarness({ disabledExport = false }: { disabledExport?: boolean }) {
    return (
      <Menu
        label="Reflection actions"
        items={[{ ...items[0], disabled: disabledExport }, items[1]]}
        trigger={(props) => (
          <button {...props} type="button">
            More actions
          </button>
        )}
      />
    );
  }

  it("opens, moves with arrow keys, and selects with Enter", async () => {
    const user = userEvent.setup();
    render(<MenuHarness />);

    await user.click(screen.getByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu", { name: "Reflection actions" });
    expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "Export" }));

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(
      within(menu).getByRole("menuitem", { name: "Delete reflection" }),
    );

    await user.keyboard("{Enter}");
    expect(items[1].onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("wraps focus and skips disabled items", async () => {
    const user = userEvent.setup();
    render(<MenuHarness disabledExport />);

    await user.click(screen.getByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu");
    expect(document.activeElement).toBe(
      within(menu).getByRole("menuitem", { name: "Delete reflection" }),
    );

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(
      within(menu).getByRole("menuitem", { name: "Delete reflection" }),
    );
    expect(within(menu).getByRole("menuitem", { name: "Export" })).toBeDisabled();
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<MenuHarness />);

    const trigger = screen.getByRole("button", { name: "More actions" });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when clicking outside", async () => {
    const user = userEvent.setup();
    render(
      <>
        <MenuHarness />
        <button type="button">Elsewhere</button>
      </>,
    );

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("marks the trigger with the expanded state", async () => {
    const user = userEvent.setup();
    render(<MenuHarness />);

    const trigger = screen.getByRole("button", { name: "More actions" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
