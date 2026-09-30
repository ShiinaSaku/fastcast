import type { Options as ParseOptions } from "recast";
import type { ASTNode, ProxifiedModule } from "./types";
import { randomBytes } from "node:crypto";
import { promises as fsp } from "node:fs";
import process from "node:process";
import { generateCode, parseModule } from "./code";

export async function loadFile<Exports extends object = any>(
  filename: string,
  options: ParseOptions = {},
): Promise<ProxifiedModule<Exports>> {
  const contents = await fsp.readFile(filename, "utf8");
  options.sourceFileName = options.sourceFileName ?? filename;
  return parseModule(contents, options);
}

export async function writeFile(
  node: { $ast: ASTNode } | ASTNode,
  filename: string,
  options?: ParseOptions,
): Promise<void> {
  const ast = "$ast" in node ? node.$ast : node;
  const { code, map } = generateCode(ast, options);

  // Write to a sibling temp file and rename into place, so an interrupted
  // write can never leave a half-written config behind.
  const tmpFile = `${filename}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await fsp.writeFile(tmpFile, code);
    await fsp.rename(tmpFile, filename as string);
  }
  catch (error) {
    await fsp.rm(tmpFile, { force: true }).catch(() => {});
    throw error;
  }

  if (map) {
    await fsp.writeFile(`${filename}.map`, map);
  }
}
