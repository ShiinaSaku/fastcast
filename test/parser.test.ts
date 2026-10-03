import { describe, expect, it } from "vitest";
import { parse } from "../src/parser";

describe("parser compatibility", () => {
  it("returns recast-compatible file, program, token and comment locations", () => {
    const source = "// heading\r\nexport default { /* inner */ value: 1 };";
    const file = parse(source);

    expect(file.type).toBe("File");
    expect(file.program.type).toBe("Program");
    expect(file.comments?.[0]).toMatchObject({
      type: "CommentLine",
      value: " heading",
      loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
    });
    expect(file.tokens?.some(token => token.value === "export")).toBe(true);
    expect(file.loc.end).toEqual({ line: 2, column: source.split("\r\n")[1].length });
  });

  it("reports syntax diagnostics with a 1-based line and 0-based column", () => {
    try {
      parse("const valid = 1;\nconst = ;");
      throw new Error("Expected invalid source to fail parsing");
    }
    catch (error) {
      expect(error).toBeInstanceOf(SyntaxError);
      expect(error).toMatchObject({
        loc: { line: 2, column: expect.any(Number) },
        pos: expect.any(Number),
      });
    }
  });

  it("uses an explicit language option instead of filename inference", () => {
    const file = parse("const value = 1 satisfies number;", {
      sourceFileName: "module.js",
      lang: "ts",
    });

    expect(file.program.body).toHaveLength(1);
  });
});
