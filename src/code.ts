import type { Options as ParseOptions } from "recast";
import type {
  ASTNode,
  GenerateOptions,
  GenerateResult,
  ParsedFileNode,
  Proxified,
  ProxifiedModule,
} from "./types";
import { parse, print, types } from "recast";
import { detectCodeFormat } from "./format";
import { getParser } from "./parser";
import { makeProxyUtils } from "./proxy/_utils";
import { proxifyModule } from "./proxy/module";
import { proxify } from "./proxy/proxify";

const b = types.builders;

/**
 * Parse a JavaScript or TypeScript module into a mutable proxy.
 *
 * Provide `Exports` when using TypeScript to type the module's exports, for
 * example `parseModule<{ default: { plugins: string[] } }>(source)`.
 *
 * @param code Module source text.
 * @param options Parser and printer options.
 * @returns A module proxy exposing mutable `imports` and `exports` views.
 */
export function parseModule<Exports extends object = any>(
  code: string,
  options?: ParseOptions,
): ProxifiedModule<Exports> {
  const node: ParsedFileNode = parse(code, {
    parser: options?.parser || getParser(),
    ...options,
    // Parse and print must agree on the width of existing tab indentation.
    tabWidth: options?.tabWidth ?? detectCodeFormat(code).tabWidth,
  });
  return proxifyModule(node, code);
}

/**
 * Parse a single JavaScript or TypeScript expression into a mutable proxy.
 *
 * @typeParam T Expected runtime shape of the expression.
 * @param code Source text containing one expression.
 * @param options Parser and printer options.
 * @returns A proxy for the parsed expression.
 */
export function parseExpression<T>(
  code: string,
  options?: ParseOptions,
): Proxified<T> {
  // Wrapping a standalone comment in "()" makes Babel's parser interpret "/" in
  // expression position as a regex literal, causing a SyntaxError. Detect this
  // case and prepend `null` so the comment is parsed as a trailing remark on a
  // null literal instead.
  const isStandaloneComment = /^(?:\/\*[\s\S]*?\*\/|\/\/[^\n\r\u2028\u2029]*)$/.test(
    code.trim(),
  );

  const parseCode = isStandaloneComment ? `${code}\nnull` : `(${code})`;

  const root: ParsedFileNode = parse(parseCode, {
    parser: options?.parser || getParser(),
    ...options,
  });
  let body: ASTNode = root.program.body[0];
  if (body.type === "ExpressionStatement") {
    const expr = body.expression;
    if (isStandaloneComment && body.comments?.length) {
      // Transfer comments from ExpressionStatement to the expression node so
      // they survive when the node is embedded into another AST.
      expr.comments = body.comments;
      delete body.comments;
    }
    body = expr;
  }
  if (body.type === "ParenthesizedExpression") {
    body = body.expression;
  }
  if (body.extra?.parenthesized) {
    body.extra.parenthesized = false;
  }

  if (isStandaloneComment) {
    // proxify() for NullLiteral returns JS `undefined` (NullLiteral has no
    // .value in Babel's AST), which loses the comment. Return a proxy with
    // $ast pointing to the expression directly so that literalToAst() emits
    // it — including the attached comment — when the node is inserted.
    return makeProxyUtils(body, {
      $type: "comment",
    }) as unknown as Proxified<T>;
  }

  const mod = {
    $ast: root,
    $code: ` ${code} `,
    $type: "module",
  } as any as ProxifiedModule;

  return proxify(body, mod);
}

/**
 * Print a proxified value or AST node to JavaScript source.
 *
 * @param node Proxified value, module, or AST node to print.
 * @param options Printer options and optional formatting overrides.
 * @returns Generated source code and, when requested, its source map.
 */
export function generateCode(
  node: { $ast: ASTNode } | ASTNode | ProxifiedModule<any>,
  options: GenerateOptions = {},
): GenerateResult {
  let ast = (node as Proxified).$ast || node;

  if (ast.type === "FunctionExpression") {
    ast = b.expressionStatement(ast);
  }

  const formatOptions
    = options.format === false || !("$code" in node)
      ? {}
      : detectCodeFormat(node.$code, options.format);

  const { code, map } = print(ast, {
    ...options,
    ...formatOptions,
  });

  return { code, map };
}
