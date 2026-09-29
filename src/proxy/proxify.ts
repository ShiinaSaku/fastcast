import type { ASTNode } from "../types";
import type { Proxified, ProxifiedModule, ProxifiedValue } from "./types";
import { MagicastError } from "../error";
import { createProxy, LITERALS_AST, LITERALS_TYPEOF } from "./_utils";
import { proxifyArray, proxifyArrayElements } from "./array";
import { proxifyArrowFunctionExpression } from "./arrow-function-expression";
import { proxifyAwaitExpression } from "./await-expression";
import { proxifyBinaryExpression } from "./binary-expression";
import { proxifyBlockStatement } from "./block-statement";
import { proxifyFunctionCall } from "./function-call";
import { proxifyFunctionExpression } from "./function-expression";
import { proxifyIdentifier } from "./identifier";
import { proxifyLogicalExpression } from "./logical-expression";
import { proxifyMemberExpression } from "./member-expression";
import { proxifyNewExpression } from "./new-expression";
import { proxifyObject } from "./object";

const _cache = new WeakMap<ASTNode, any>();

export function proxify<T>(node: ASTNode, mod?: ProxifiedModule): Proxified<T> {
  // Array holes (sparse slots) are parsed as `null`; treat them as `undefined`.
  if (node == null) {
    return undefined as any;
  }

  if (LITERALS_TYPEOF.has(typeof node)) {
    return node as any;
  }

  // Handle special identifiers first
  if (node.type === "Identifier" && node.name === "undefined") {
    return undefined as any;
  }

  if (node.type === "Literal") {
    if ("regex" in node && node.regex) {
      const { pattern, flags } = node.regex;
      return new RegExp(pattern, flags) as Proxified<T>;
    }
    return node.value as Proxified<T>;
  }

  if ((node.type as string) === "RegExpLiteral") {
    const { pattern, flags } = node as unknown as { pattern: string; flags?: string };
    return new RegExp(pattern, flags) as Proxified<T>;
  }

  if (LITERALS_AST.has(node.type)) {
    return (node as unknown as { value: unknown }).value as Proxified<T>;
  }

  if (_cache.has(node)) {
    return _cache.get(node) as Proxified<T>;
  }

  let proxy: ProxifiedValue;
  switch (node.type) {
    case "ObjectExpression": {
      proxy = proxifyObject(node, mod);
      break;
    }
    case "ArrayExpression": {
      proxy = proxifyArray(node, mod);
      break;
    }
    case "CallExpression": {
      proxy = proxifyFunctionCall(node, mod);
      break;
    }
    case "ImportExpression": {
      const args: ASTNode[] = [node.source];
      if (node.options) {
        args.push(node.options);
      }
      const argumentsProxy = proxifyArrayElements(node, args, mod);
      proxy = createProxy(
        node,
        {
          $type: "function-call",
          $callee: "import",
          $args: argumentsProxy,
        },
        {},
      );
      break;
    }
    case "ArrowFunctionExpression": {
      proxy = proxifyArrowFunctionExpression(node, mod);
      break;
    }
    case "FunctionExpression": {
      proxy = proxifyFunctionExpression(node, mod);
      break;
    }
    case "NewExpression": {
      proxy = proxifyNewExpression(node, mod);
      break;
    }
    case "Identifier": {
      proxy = proxifyIdentifier(node);
      break;
    }
    case "LogicalExpression": {
      proxy = proxifyLogicalExpression(node);
      break;
    }
    case "MemberExpression": {
      proxy = proxifyMemberExpression(node);
      break;
    }
    case "BinaryExpression": {
      proxy = proxifyBinaryExpression(node, mod);
      break;
    }
    case "AwaitExpression": {
      proxy = proxifyAwaitExpression(node, mod);
      break;
    }
    case "BlockStatement": {
      proxy = proxifyBlockStatement(node, mod);
      break;
    }
    case "ParenthesizedExpression":
    case "TSAsExpression":
    case "TSSatisfiesExpression": {
      proxy = proxify(node.expression, mod) as ProxifiedValue;
      break;
    }
    default: {
      throw new MagicastError(
        `Casting "${(node as any).type}" is not supported`,
        {
          ast: node,
          code: mod?.$code,
        },
      );
    }
  }

  _cache.set(node, proxy);
  return proxy as unknown as Proxified<T>;
}
