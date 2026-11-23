import { describe, it, expect } from "bun:test";
import { buildLatinKeyMap, readMacKeyTables } from "@/keyboard-layout";
import { answerForKey } from "@/utils";

describe("buildLatinKeyMap", () => {
  it("maps each character of the current layout to the Latin letter of its key", () => {
    const map = buildLatinKeyMap(["ф", "н", "т"], ["a", "y", "n"]);
    expect(map.get("н")).toBe("y");
    expect(map.get("т")).toBe("n");
    expect(map.size).toBe(3);
  });

  it("leaves out keys that type the same character, keys with no letter, and empty keys", () => {
    const map = buildLatinKeyMap(["a", "1", "ж", "", "щ"], ["a", "1", ";", "q", ""]);
    expect(map.size).toBe(0);
  });
});

describe("answerForKey", () => {
  const russian = new Map([
    ["н", "y"],
    ["т", "n"],
  ]);

  it("reads a Latin y or n in either case, with or without a map", () => {
    for (const map of [null, russian]) {
      expect(answerForKey("y", map)).toBe("yes");
      expect(answerForKey("Y", map)).toBe("yes");
      expect(answerForKey("n", map)).toBe("no");
      expect(answerForKey("N", map)).toBe("no");
    }
  });

  it("reads the key under Y and N on a Russian layout through the map", () => {
    expect(answerForKey("н", russian)).toBe("yes");
    expect(answerForKey("Н", russian)).toBe("yes");
    expect(answerForKey("т", russian)).toBe("no");
    expect(answerForKey("Т", russian)).toBe("no");
  });

  it("reads Cyrillic letters as other with no map", () => {
    expect(answerForKey("н", null)).toBe("other");
    expect(answerForKey("у", null)).toBe("other");
  });

  it("reads Enter as the default and Ctrl+C as an interrupt", () => {
    expect(answerForKey("\r", null)).toBe("default");
    expect(answerForKey("\n", null)).toBe("default");
    expect(answerForKey("\x03", null)).toBe("interrupt");
  });

  it("reads any other key as other", () => {
    expect(answerForKey("x", russian)).toBe("other");
    expect(answerForKey("ф", russian)).toBe("other");
  });
});

// Reads the installed Russian layout without switching to it, so the result does not depend on the layout in use
describe.skipIf(process.platform !== "darwin")("readMacKeyTables on macOS", () => {
  it("maps the Russian keys under Y and N to y and n", async () => {
    const { current, latin } = await readMacKeyTables("com.apple.keylayout.Russian");
    const map = buildLatinKeyMap(current, latin);
    expect(map.get("н")).toBe("y");
    expect(map.get("т")).toBe("n");
  });

  it("rejects an input source that is not installed", async () => {
    expect(readMacKeyTables("com.example.keylayout.Missing")).rejects.toThrow("No input source");
  });
});
