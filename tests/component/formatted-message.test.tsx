import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormattedMessage } from "../../src/client/components/ui/FormattedMessage";

describe("FormattedMessage", () => {
  it("renders common model formatting without interpreting HTML", () => {
    render(
      <FormattedMessage content={'> **The 5-Minute Draft:** Write *one next step* and use `notes.md`.\n\n- Keep it simple\n<script>alert(1)</script>'} />,
    );

    expect(screen.getByText("The 5-Minute Draft:").tagName).toBe("STRONG");
    expect(screen.getByText("one next step").tagName).toBe("EM");
    expect(screen.getByText("notes.md").tagName).toBe("CODE");
    expect(screen.getByText("Keep it simple")).toBeInTheDocument();
    expect(screen.queryByRole("script")).not.toBeInTheDocument();
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
  });
});
