import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ExpandToggle } from "./ExpandToggle";

describe("ExpandToggle", () => {
  it("is not rendered when show is false", () => {
    const markup = renderToStaticMarkup(
      <ExpandToggle show={false} isExpanded={false} onToggle={() => undefined} />,
    );
    expect(markup).toBe("");
  });

  it("renders labels based on expansion state", () => {
    const collapsed = renderToStaticMarkup(
      <ExpandToggle show isExpanded={false} onToggle={() => undefined} />,
    );
    const expanded = renderToStaticMarkup(
      <ExpandToggle show isExpanded onToggle={() => undefined} />,
    );

    expect(collapsed).toContain("Show more");
    expect(expanded).toContain("Show less");
  });

  it("calls onToggle when button onClick runs", () => {
    const onToggle = vi.fn();
    const element = ExpandToggle({ show: true, isExpanded: false, onToggle });

    expect(isValidElement(element)).toBe(true);

    if (!isValidElement(element)) {
      throw new Error("Expected ExpandToggle to return a button element.");
    }

    const onClick = element.props.onClick as (() => void) | undefined;
    expect(onClick).toBeTypeOf("function");

    onClick?.();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
