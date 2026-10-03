import type { ASTNode } from "../types";
import * as recast from "recast";
import { MagicastError } from "../error";

export const LITERALS_AST = new Set([
  "Literal",
  "StringLiteral",
  "NumericLiteral",
  "BooleanLiteral",
  "NullLiteral",
  // "RegExpLiteral" is handled separately in proxify
  "BigIntLiteral",
]);

export const LITERALS_TYPEOF = new Set([
  "string",
  "number",
  "boolean",
  "bigint",
  "symbol",
  "undefined",
]);

const b = recast.types.builders;

export function isValidPropName(name: string) {
  return /^[$A-Z_][\w$]*$/i.test(name);
}

const PROXY_KEY = "__magicast_proxy";

/**
 * Convert a runtime value into an AST node.
 *
 * Supports primitives, arrays, plain objects, `RegExp`, `Set`, `Date`, `Map`,
 * and forward proxies (returning their `$ast`). Symbols and functions cannot be
 * represented as JavaScript literals and are rejected. Circular references also
 * throw.
 */
export function literalToAst(value: unknown, seen = new Set<object>()): ASTNode {
  if (value === undefined) {
    return b.identifier("undefined") as any;
  }
  if (value === null) {
    return b.literal(null) as any;
  }
  if (
    typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
    || typeof value === "bigint"
  ) {
    return b.literal(value) as any;
  }
  if (typeof value !== "object") {
    throw new MagicastError(`Can not serialize value of type "${typeof value}"`);
  }
  if (seen.has(value)) {
    throw new MagicastError("Can not serialize circular reference");
  }
  // `seen` tracks only the current recursion path, so a value referenced from
  // two sibling positions (a DAG, not a cycle) is serialized twice instead of
  // being mistaken for a circular reference.
  seen.add(value);
  try {
    // A proxified value can be inserted directly without serializing its wrapper.
    if (
      Reflect.get(value, PROXY_KEY) === true
      && typeof Reflect.get(value, "$ast") === "object"
    ) {
      return Reflect.get(value, "$ast") as ASTNode;
    }

    if (value instanceof RegExp) {
      const regex = b.regExpLiteral(value.source, value.flags) as any;
      // seems to be a bug in recast
      delete regex.extra.raw;
      return regex;
    }
    if (value instanceof Set) {
      return b.newExpression(b.identifier("Set"), [
        b.arrayExpression([...value].map(n => literalToAst(n, seen)) as any),
      ]) as any;
    }
    if (value instanceof Date) {
      return b.newExpression(b.identifier("Date"), [
        b.literal(value.toISOString()),
      ]) as any;
    }
    if (value instanceof Map) {
      return b.newExpression(b.identifier("Map"), [
        b.arrayExpression(
          [...value].map(([key, value]) => {
            return b.arrayExpression([
              literalToAst(key, seen) as any,
              literalToAst(value, seen) as any,
            ]) as any;
          }) as any,
        ),
      ]) as any;
    }
    if (Array.isArray(value)) {
      return b.arrayExpression(
        value.map(n => literalToAst(n, seen)) as any,
      ) as any;
    }
    if (typeof value === "object") {
      return b.objectExpression(
        Object.entries(value).map(([key, value]) => {
          return b.property(
            "init",
            isValidPropName(key) ? b.identifier(key) : b.literal(key),
            literalToAst(value, seen) as any,
          ) as any;
        }),
      ) as any;
    }
    return b.literal(value) as any;
  }
  finally {
    seen.delete(value);
  }
}

/**
 * Render a callee node (`foo`, `foo.bar`, `import`) as a string.
 */
export function stringifyCallee(node: ASTNode): string {
  if (node.type === "Identifier") {
    return node.name;
  }
  if ((node.type as string) === "Import") {
    return "import";
  }
  if (node.type === "MemberExpression") {
    return `${stringifyCallee(node.object)}.${stringifyCallee(node.property)}`;
  }
  throw new MagicastError("Not implemented");
}

/**
 * Wrap function-like nodes in a callable proxy that exposes `utils` and throws
 * if the proxified function is invoked.
 */
export function createFunctionProxy<T>(utils: Record<string, any>): T {
  return new Proxy(() => {}, {
    get(target, key, receiver) {
      if (key in utils) {
        return (utils as any)[key];
      }
      return Reflect.get(target, key, receiver);
    },
    apply() {
      throw new MagicastError(
        "Calling proxified functions is not supported. Use `generateCode` to get the code string.",
      );
    },
  }) as T;
}

export function makeProxyUtils<T extends object>(
  node: ASTNode,
  extend: T = {} as T,
): Record<string, any> {
  const obj = extend as any;
  obj[PROXY_KEY] = true;
  obj.$ast = node;
  obj.$type ||= "object";
  return obj;
}

const propertyDescriptor = {
  enumerable: true,
  configurable: true,
};

export function createProxy<T>(
  node: ASTNode,
  extend: any,
  handler: ProxyHandler<object>,
): T {
  const utils = makeProxyUtils(node, extend);
  return new Proxy(
    {},
    {
      ownKeys() {
        return Object.keys(utils).filter(
          i => i !== PROXY_KEY && !i.startsWith("$"),
        );
      },
      getOwnPropertyDescriptor() {
        return propertyDescriptor;
      },
      has(_target: any, key: string | symbol) {
        if (key in utils) {
          return true;
        }
        return false;
      },
      ...handler,
      get(target: any, key: string | symbol, receiver: any) {
        if (key in utils) {
          return (utils as any)[key];
        }
        if (handler.get) {
          return handler.get(target, key, receiver);
        }
      },
      set(target: any, key: string | symbol, value: any, receiver: any) {
        if (key in utils) {
          (utils as any)[key] = value;
          return true;
        }
        if (handler.set) {
          return handler.set(target, key, value, receiver);
        }
        return false;
      },
    },
  ) as T;
}
