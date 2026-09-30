import type {
  ASTNode,
  ProxifiedArrowFunctionExpression,
  ProxifiedModule,
} from "../types";
import { MagicastError } from "../error";
import { createFunctionProxy, makeProxyUtils } from "./_utils";
import { proxifyArrayElements } from "./array";
import { proxify } from "./proxify";

export function proxifyArrowFunctionExpression<T extends []>(
  node: ASTNode,
  mod?: ProxifiedModule,
): ProxifiedArrowFunctionExpression {
  if (node.type !== "ArrowFunctionExpression") {
    throw new MagicastError("Not an arrow function expression");
  }

  const utils = makeProxyUtils(node, {
    $type: "arrow-function-expression",
    $params: proxifyArrayElements<T>(node, node.params, mod),
    $body: proxify(node.body, mod),
  });

  return createFunctionProxy<ProxifiedArrowFunctionExpression>(utils);
}
