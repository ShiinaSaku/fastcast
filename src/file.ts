import type { Options as ParseOptions } from "recast";
import type { ASTNode, ProxifiedModule } from "./types";
import { randomBytes } from "node:crypto";
import { promises as fsp } from "node:fs";
import process from "node:process";
import { generateCode, parseModule } from "./code";

/**
 * Read and parse a source file.
 *
 * The inferred filename is passed to the parser so language and module type can
 * be selected from the file extension. The provided options object is not
 * mutated.
 *
 * @typeParam Exports Expected module export shape.
 * @param filename Path to the source file.
 * @param options Parser and printer options.
 * @returns A mutable module proxy.
 */
export async function loadFile<Exports extends object = any>(
  filename: string,
  options: ParseOptions = {},
): Promise<ProxifiedModule<Exports>> {
  const contents = await fsp.readFile(filename, "utf8");
  return parseModule(contents, {
    ...options,
    sourceFileName: options.sourceFileName ?? filename,
  });
}

/**
 * Generate source from a proxified value or AST node and atomically replace a file.
 *
 * Existing permission bits are retained. A temporary sibling file is removed if
 * writing or replacement fails.
 *
 * @param node Proxified value or AST node to print.
 * @param filename Destination path.
 * @param options Printer and source-map options.
 */
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
    let mode: number | undefined;
    try {
      mode = (await fsp.stat(filename)).mode;
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    await fsp.writeFile(tmpFile, code, mode === undefined ? undefined : { mode });
    await fsp.rename(tmpFile, filename as string);
  }
  catch (error) {
    await fsp.rm(tmpFile, { force: true }).catch(() => {});
    throw error;
  }

  if (map) {
    await fsp.writeFile(`${filename}.map`, JSON.stringify(map));
  }
}
