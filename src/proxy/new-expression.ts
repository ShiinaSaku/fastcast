import type { ASTNode } from "../types";
import type { ProxifiedModule, ProxifiedNewExpression } from "./types";
import { MagicastError } from "../error";
import { createProxy, stringifyCallee } from "./_utils";
import { proxifyArrayElements } from "./array";

export function proxifyNewExpression<T extends []>(
  node: ASTNode,
  mod?: ProxifiedModule,
): ProxifiedNewExpression<T> {
  if (node.type !== "NewExpression") {
    throw new MagicastError("Not a new expression");
  }

  const argumentsProxy = proxifyArrayElements<T>(node, node.arguments, mod);

  return createProxy(
    node,
    {
      $type: "new-expression",
      $callee: stringifyCallee(node.callee as any),
      $args: argumentsProxy,
    },
    {},
  ) as ProxifiedNewExpression<T>;
}
