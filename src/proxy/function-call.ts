import type { ASTNode } from "../types";
import type { ProxifiedFunctionCall, ProxifiedModule } from "./types";
import { MagicastError } from "../error";
import { createProxy, stringifyCallee } from "./_utils";
import { proxifyArrayElements } from "./array";

export function proxifyFunctionCall<T extends []>(
  node: ASTNode,
  mod?: ProxifiedModule,
): ProxifiedFunctionCall<T> {
  if (node.type !== "CallExpression") {
    throw new MagicastError("Not a function call");
  }

  const argumentsProxy = proxifyArrayElements<T>(node, node.arguments, mod);

  return createProxy(
    node,
    {
      $type: "function-call",
      $callee: stringifyCallee(node.callee as any),
      $args: argumentsProxy,
    },
    {},
  ) as ProxifiedFunctionCall<T>;
}
