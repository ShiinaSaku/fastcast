import type { Options as ParseOptions } from "recast";
import type { RawSourceMap } from "source-map-js";
import type { AttachedComment, Comment, Node, Program } from "yuku-parser";
import type { CodeFormatOptions } from "./format";

export * from "./proxy/types";

declare module "yuku-parser" {
  interface BaseNode {
    loc?: Loc;
    innerComments?: AttachedComment[];
    leadingComments?: AttachedComment[];
    trailingComments?: AttachedComment[];
    extra?: Record<string, unknown>;
  }
}

export type ASTNode = Node;

export interface LocPosition {
  line?: number;
  column?: number;
  token?: number;
}

export interface Loc {
  start?: LocPosition;
  end?: LocPosition;
  lines?: unknown;
}

export interface Token {
  type: string;
  value: string;
  loc?: Loc;
}

export interface ParsedFileNode {
  type: "file";
  program: Program;
  loc: Loc;
  comments: null | Comment[];
  tokens?: Token[];
}

export type GenerateOptions = ParseOptions & {
  format?: false | CodeFormatOptions;
};

/** Source output and optional source-map data returned by code generation. */
export interface GenerateResult {
  code: string;
  map?: RawSourceMap;
}
