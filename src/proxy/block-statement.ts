import type { BlockStatement } from "yuku-parser";
import type { ProxifiedBlockStatement, ProxifiedModule } from "./types";
import { createProxy } from "./_utils";
import { proxifyArrayElements } from "./array";

export function proxifyBlockStatement(
  node: BlockStatement,
  mod?: ProxifiedModule,
): ProxifiedBlockStatement {
  return createProxy(
    node,
    {
      $type: "block-statement",
      $body: proxifyArrayElements(node, node.body, mod),
    },
    {},
  ) as ProxifiedBlockStatement;
}
