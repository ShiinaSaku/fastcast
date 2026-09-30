import type { FunctionExpression } from "yuku-parser";
import type {
  ProxifiedBlockStatement,
  ProxifiedFunctionExpression,
  ProxifiedModule,
} from "./types";
import { createFunctionProxy, makeProxyUtils } from "./_utils";
import { proxifyArrayElements } from "./array";
import { proxify } from "./proxify";

export function proxifyFunctionExpression(
  node: FunctionExpression,
  mod?: ProxifiedModule,
): ProxifiedFunctionExpression {
  const utils = makeProxyUtils(node, {
    $type: "function-expression",
    $params: proxifyArrayElements(node, node.params, mod),
    $body: proxify(node.body!, mod) as ProxifiedBlockStatement,
  });

  return createFunctionProxy<ProxifiedFunctionExpression>(utils);
}
