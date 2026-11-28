import { describe, expect, it } from "bun:test";
import { listText } from "@/utils";

describe("listText", () => {
  it.each([
    [["web"], "web"],
    [["web", "api"], "web and api"],
    [["web", "api", "db"], "web, api and db"],
  ])("joins %p as %p", (items, text) => {
    expect(listText(items)).toBe(text);
  });
});
