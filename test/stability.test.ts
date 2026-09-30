import { parseModule } from "magicast";
import { describe, expect, it } from "vitest";
import { generate } from "./_utils";

describe("stability", () => {
  it("serializes shared (non-circular) references", async () => {
    const mod = parseModule("export default {}");
    const shared = { x: 1 };

    // The same object referenced from two sibling positions is a DAG, not a
    // cycle, and must serialize without throwing.
    mod.exports.default = { a: shared, b: shared };

    expect(await generate(mod)).toMatchInlineSnapshot(`
      "export default {
        a: {
          x: 1,
        },

        b: {
          x: 1,
        },
      };"
    `);
  });

  it("still rejects circular references", () => {
    const mod = parseModule("export default {}");
    const circular: any = { foo: 1 };
    circular.self = circular;

    expect(() => {
      mod.exports.default = circular;
    }).toThrowErrorMatchingInlineSnapshot(`[MagicastError: Can not serialize circular reference]`);
  });

  it("reads, updates and deletes multi-declarator named exports", async () => {
    const mod = parseModule("export const a = 1, b = 2;");

    expect(mod.exports.a).toBe(1);
    expect(mod.exports.b).toBe(2);

    mod.exports.b = 20;

    expect(await generate(mod)).toMatchInlineSnapshot(`
      "export const a = 1,
        b = 20;"
    `);

    delete mod.exports.a;

    expect(await generate(mod)).toMatchInlineSnapshot(`"export const b = 20;"`);
  });
});
