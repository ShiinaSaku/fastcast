import type { ASTNode, BinaryOperator, Proxified } from "./types";
import * as recast from "recast";
import { parseExpression } from "./code";
import { literalToAst } from "./proxy/_utils";
import { proxifyAwaitExpression } from "./proxy/await-expression";
import { proxifyBinaryExpression } from "./proxy/binary-expression";
import { proxifyFunctionCall } from "./proxy/function-call";
import { proxifyNewExpression } from "./proxy/new-expression";

const b = recast.types.builders;

/** Builders for constructing and proxifying JavaScript expressions. */
export const builders = {
  /**
   * Create a proxified function call expression.
   *
   * Arguments are serialized as JavaScript literals; use {@link raw} for source
   * expressions such as identifiers, callbacks, or member access.
   *
   * @param callee Identifier naming the called function.
   * @param args Values to serialize as call arguments.
   */
  functionCall(callee: string, ...args: unknown[]): Proxified {
    const node = b.callExpression(
      b.identifier(callee),
      args.map(value => literalToAst(value)) as unknown as Parameters<typeof b.callExpression>[1],
    );
    return proxifyFunctionCall(node as unknown as ASTNode);
  },

  /**
   * Create a proxified `new` expression.
   *
   * Arguments are serialized as JavaScript literals.
   *
   * @param callee Identifier naming the constructor.
   * @param args Values to serialize as constructor arguments.
   */
  newExpression(callee: string, ...args: unknown[]): Proxified {
    const node = b.newExpression(
      b.identifier(callee),
      args.map(value => literalToAst(value)) as unknown as Parameters<typeof b.newExpression>[1],
    );
    return proxifyNewExpression(node as unknown as ASTNode);
  },

  /**
   * Create a proxified binary expression from literal operands.
   *
   * @param left Left operand value.
   * @param operator JavaScript binary operator.
   * @param right Right operand value.
   */
  binaryExpression(
    left: unknown,
    operator: Exclude<BinaryOperator, "|>">,
    right: unknown,
  ): Proxified {
    const node = b.binaryExpression(
      operator,
      literalToAst(left) as unknown as Parameters<typeof b.binaryExpression>[1],
      literalToAst(right) as unknown as Parameters<typeof b.binaryExpression>[2],
    );
    return proxifyBinaryExpression(
      node as unknown as Parameters<typeof proxifyBinaryExpression>[0],
    );
  },

  /**
   * Create a proxified `await` expression.
   *
   * An object with an `$ast` property is inserted as a source expression;
   * other values are serialized as literals.
   *
   * @param argument Value or proxified expression to await.
   */
  awaitExpression(argument: unknown): Proxified {
    const proxified = argument as { $ast?: ASTNode } | null | undefined;
    const argAst = proxified?.$ast ?? literalToAst(argument);
    const node = b.awaitExpression(
      argAst as unknown as Parameters<typeof b.awaitExpression>[0],
    );
    return proxifyAwaitExpression(
      node as unknown as Parameters<typeof proxifyAwaitExpression>[0],
    );
  },

  /**
   * Convert a runtime value into an AST node suitable for insertion.
   *
   * @param value JavaScript value to serialize.
   * @returns An AST node; existing proxified values are returned by reference.
   */
  literal(value: unknown): ASTNode {
    return literalToAst(value);
  },

  /**
   * Parse a raw JavaScript expression and return its proxified value.
   *
   * ```ts
   * const obj = builders.raw("{ foo: 1 }");
   * console.log(obj.foo); // 1
   * ```
   *
   * @param code Source text containing one expression.
   */
  raw(code: string): Proxified {
    return parseExpression(code);
  },
};
