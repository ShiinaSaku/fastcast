import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadFile, parseModule, writeFile } from "../src";

const directories: string[] = [];

async function createDirectory() {
  const directory = await fsp.mkdtemp(join(tmpdir(), "fastcast-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(dir => fsp.rm(dir, { recursive: true, force: true })));
});

describe("file API", () => {
  it("does not mutate caller-provided parse options", async () => {
    const directory = await createDirectory();
    const filename = join(directory, "config.ts");
    await fsp.writeFile(filename, "export default {};");
    const options = { tabWidth: 4 };

    await loadFile(filename, options);

    expect(options).toEqual({ tabWidth: 4 });
  });

  it("preserves existing file permissions when replacing a file", async () => {
    const directory = await createDirectory();
    const filename = join(directory, "config.js");
    await fsp.writeFile(filename, "export default {};", { mode: 0o640 });
    await fsp.chmod(filename, 0o640);

    await writeFile(parseModule("export default { changed: true };"), filename);

    expect((await fsp.stat(filename)).mode & 0o777).toBe(0o640);
    expect(await fsp.readFile(filename, "utf8")).toContain("changed: true");
  });

  it("serializes generated source maps as JSON", async () => {
    const directory = await createDirectory();
    const filename = join(directory, "mapped.js");
    const mod = parseModule("export default 1;", { sourceFileName: filename });

    await writeFile(mod, filename, { sourceMapName: `${filename}.map` });

    const map = JSON.parse(await fsp.readFile(`${filename}.map`, "utf8")) as {
      version: number;
      sources: string[];
    };
    expect(map.version).toBe(3);
    expect(map.sources).toContain(filename);
  });

  it("writes a new file when the target does not exist", async () => {
    const directory = await createDirectory();
    const filename = join(directory, "new.js");

    await writeFile(parseModule("export default 1;"), filename);

    expect(await fsp.readFile(filename, "utf8")).toContain("export default 1");
  });
});
