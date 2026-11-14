// Component test: vitest + jsdom.
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import SearchField from "./SearchField.svelte";
import "$lib/test/setup";

describe("SearchField", () => {
  // Five boxes, two verbs and three placeholder conventions collapse into one
  // rule precisely because the placeholder is built rather than passed.
  //
  // No trailing `…`: an ellipsis means "this will not finish without more
  // input", and narrowing a list you can already see finishes as you type.
  test("filter builds '筛选 {nouns}'", () => {
    render(SearchField, { nouns: "窗口" });
    expect(screen.getByPlaceholderText("筛选 窗口")).toBeTruthy();
  });

  test("search builds '搜索 {nouns}'", () => {
    render(SearchField, { verb: "search", nouns: "命令与按键" });
    expect(screen.getByPlaceholderText("搜索 命令与按键")).toBeTruthy();
  });

  // The accelerator is rendered, never baked into the placeholder — that is what
  // stops the five boxes advertising it three different ways, and what stops
  // macOS being told to press Ctrl.
  test("a shortcut renders as a <kbd>, not inside the placeholder", () => {
    render(SearchField, { verb: "search", nouns: "树", shortcut: "Ctrl+F" });
    expect(screen.getByPlaceholderText("搜索 树")).toBeTruthy();
    expect(screen.getByText("Ctrl+F").tagName).toBe("KBD");
  });

  // It is a hint about how to GET here, so it goes once you have arrived.
  test("the shortcut hint goes once the box has content", () => {
    render(SearchField, { nouns: "行", value: "abc", shortcut: "Ctrl+F" });
    expect(screen.queryByText("Ctrl+F")).toBeNull();
  });

  test("a count renders alone, and with a total renders 'n of m'", () => {
    const { unmount } = render(SearchField, { nouns: "行", count: 3 });
    expect(screen.getByText("3")).toBeTruthy();
    unmount();

    render(SearchField, { nouns: "行", count: 3, total: 12 });
    expect(screen.getByText("3 / 12")).toBeTruthy();
  });

  // Absent rather than dimmed when empty, matching the {#if searching} guard it
  // replaces — and unlike the invisible `.mini` clear button it replaces, it is
  // actually visible when it is there.
  test("the clear button is absent while the box is empty", () => {
    render(SearchField, { nouns: "行" });
    expect(screen.queryByRole("button", { name: "清除" })).toBeNull();
  });

  test("clearing empties the box and reports it", async () => {
    const onclear = vi.fn();
    render(SearchField, { nouns: "行", value: "abc", onclear });

    const input = screen.getByPlaceholderText("筛选 行") as HTMLInputElement;
    expect(input.value).toBe("abc");

    await fireEvent.click(screen.getByRole("button", { name: "清除" }));

    expect(onclear).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("");
  });

  test("Escape clears too", async () => {
    const onclear = vi.fn();
    render(SearchField, { nouns: "行", value: "abc", onclear });

    const input = screen.getByPlaceholderText("筛选 行") as HTMLInputElement;
    await fireEvent.keyDown(input, { key: "Escape" });

    expect(onclear).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("");
  });
});
