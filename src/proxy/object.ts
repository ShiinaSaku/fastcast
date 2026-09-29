import type { ObjectExpression, ObjectProperty, SpreadElement } from "yuku-parser";
import type { ASTNode } from "../types";
import type { ProxifiedModule, ProxifiedObject } from "./types";
import * as recast from "recast";
import { MagicastError } from "../error";
import { createProxy, isValidPropName, literalToAst } from "./_utils";
import { proxify } from "./proxify";

const b = recast.types.builders;

export function proxifyObject<T extends object>(
  node: ASTNode,
  mod?: ProxifiedModule,
): ProxifiedObject<T> {
  if (!("properties" in node)) {
    return undefined as unknown as ProxifiedObject<T>;
  }

  const objNode = node as ObjectExpression;

  const getPropName = (
    prop: ObjectProperty | SpreadElement | ASTNode,
    throwError = false,
  ): string | undefined => {
    if ("key" in prop && prop.key) {
      const propKey = prop.key as ASTNode;
      if (propKey.type === "Identifier") {
        return propKey.name;
      }
      if (
        propKey.type === "Literal"
        || (propKey.type as string) === "StringLiteral"
        || (propKey.type as string) === "NumericLiteral"
        || (propKey.type as string) === "BooleanLiteral"
      ) {
        return String((propKey as { value: unknown }).value);
      }
    }
    if (throwError) {
      throw new MagicastError(
        `Casting "${prop.type}" is not supported`,
        {
          ast: prop,
          code: mod?.$code,
        },
      );
    }
    return undefined;
  };

  const getProp = (key: string | symbol): ASTNode | undefined => {
    const stringKey = String(key);
    for (const prop of objNode.properties as (ObjectProperty | ASTNode)[]) {
      if (getPropName(prop) === stringKey) {
        if ("value" in prop && prop.value) {
          return prop.value as ASTNode;
        }
        if ("params" in prop && "body" in prop) {
          const methodProp = prop as unknown as {
            params: ASTNode[];
            body: ASTNode;
            generator?: boolean;
            async?: boolean;
            loc?: recast.types.namedTypes.SourceLocation;
          };
          const funcExpr = b.functionExpression(
            null, // id must be null, not undefined
            methodProp.params as any,
            methodProp.body as any,
            methodProp.generator,
            methodProp.async,
          );
          // WORKAROUND: Recast builder doesn't seem to preserve the async property
          funcExpr.async = methodProp.async;
          funcExpr.loc = methodProp.loc;
          return funcExpr as unknown as ASTNode;
        }
      }
    }
  };

  const replaceOrAddProp = (key: string, value: ASTNode) => {
    const prop = objNode.properties.find(p => getPropName(p) === key);
    if (prop) {
      if ("value" in prop) {
        (prop as ObjectProperty).value = value as any;
      }
      else if ("params" in prop) {
        const newProp = b.property("init", b.identifier(key), value as any);
        const index = objNode.properties.indexOf(prop);
        if (index !== -1) {
          objNode.properties[index] = newProp as any;
        }
      }
    }
    else {
      const newProp = b.property(
        "init",
        isValidPropName(key) ? b.identifier(key) : b.stringLiteral(key),
        value as any,
      );
      // Comments inside an otherwise-empty object (e.g. `{ /* keep me */ }`)
      // are attached as `innerComments`. Move them onto the first inserted
      // property as leading comments so recast reprints them.
      const innerComments = objNode.innerComments;
      if (innerComments?.length) {
        (newProp as any).comments = innerComments.map(comment => ({
          ...comment,
          leading: true,
          trailing: false,
        }));
        objNode.innerComments = [];
      }
      objNode.properties.push(newProp as any);
    }
  };

  return createProxy(
    node,
    {
      $type: "object",
      toJSON() {
        return objNode.properties.reduce((acc: Record<string, unknown>, prop) => {
          const propName = getPropName(prop);
          if (propName) {
            if ("value" in prop && prop.value) {
              acc[propName] = proxify(prop.value, mod);
            }
            else if ("params" in prop && "body" in prop) {
              const methodProp = prop as unknown as {
                params: ASTNode[];
                body: ASTNode;
                generator?: boolean;
                async?: boolean;
                loc?: recast.types.namedTypes.SourceLocation;
              };
              const funcExpr = b.functionExpression(
                null, // id must be null, not undefined
                methodProp.params as any,
                methodProp.body as any,
                methodProp.generator,
                methodProp.async,
              );
              // WORKAROUND: Recast builder doesn't seem to preserve the async property
              funcExpr.async = methodProp.async;
              funcExpr.loc = methodProp.loc;
              acc[propName] = proxify(funcExpr as unknown as ASTNode, mod);
            }
          }
          return acc;
        }, {});
      },
    },
    {
      get(_, key) {
        const prop = getProp(key);
        if (prop) {
          return proxify<any>(prop, mod);
        }
      },
      set(_, key, value) {
        if (typeof key !== "string") {
          key = String(key);
        }
        replaceOrAddProp(key, literalToAst(value));
        return true;
      },
      deleteProperty(_, key) {
        if (typeof key !== "string") {
          key = String(key);
        }
        const index = objNode.properties.findIndex(p => getPropName(p) === key);
        if (index !== -1) {
          objNode.properties.splice(index, 1);
        }
        return true;
      },
      ownKeys() {
        return objNode.properties
          .map(p => getPropName(p))
          .filter(Boolean) as string[];
      },
      getOwnPropertyDescriptor(target, key) {
        if (
          typeof key === "string"
          && Array.from(this.ownKeys!(target)).includes(key)
        ) {
          return {
            enumerable: true,
            configurable: true,
          };
        }
        return undefined;
      },
      has(_, key) {
        if (typeof key === "string") {
          return Array.from(this.ownKeys!(_)).includes(key);
        }
        return false;
      },
    },
  ) as ProxifiedObject<T>;
}
