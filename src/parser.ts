import type { SourceLang, SourceType } from "yuku-parser";
import {
  langFromPath,
  sourceTypeFromPath,
  parse as yukuParse,
} from "yuku-parser";

export interface ParserOptions {
  sourceFileName?: string;
  lang?: SourceLang;
  sourceType?: SourceType;
  [key: string]: unknown;
}

export function getParser(options?: ParserOptions) {
  return {
    parse(source: string) {
      return parse(source, options);
    },
  };
}

export const getBabelParser = getParser;

export function parse(source: string, options?: ParserOptions) {
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    const ch = source.charCodeAt(i);
    if (ch === 10 /* \n */) {
      lineStarts.push(i + 1);
    }
    else if (ch === 13 /* \r */) {
      if (source.charCodeAt(i + 1) === 10) {
        i++;
      }
      lineStarts.push(i + 1);
    }
    else if (ch === 0x2028 || ch === 0x2029) {
      lineStarts.push(i + 1);
    }
  }

  function offsetToPos(offset: number) {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (lineStarts[mid] <= offset) {
        low = mid + 1;
      }
      else {
        high = mid - 1;
      }
    }
    const lineIdx = low - 1;
    return {
      line: lineIdx + 1,
      column: offset - lineStarts[lineIdx],
    };
  }

  const lang = options?.lang || (options?.sourceFileName ? langFromPath(options.sourceFileName) : undefined);
  const sourceType = options?.sourceType || (options?.sourceFileName ? sourceTypeFromPath(options.sourceFileName) : "module");

  let parseResult = yukuParse(source, {
    lang: lang || "tsx",
    sourceType,
    tokens: true,
  });
  if (!lang && parseResult.diagnostics.some(d => d.severity === "error")) {
    const fallback = yukuParse(source, {
      lang: "ts",
      sourceType,
      tokens: true,
    });
    if (fallback.diagnostics.length < parseResult.diagnostics.length) {
      parseResult = fallback;
    }
  }

  const firstError = parseResult.diagnostics.find(d => d.severity === "error");
  if (firstError) {
    const pos = offsetToPos(firstError.start);
    const err = new SyntaxError(`${firstError.message} (${pos.line}:${pos.column})`);
    (err as unknown as { loc: typeof pos; pos: number }).loc = pos;
    (err as unknown as { loc: typeof pos; pos: number }).pos = firstError.start;
    throw err;
  }

  const comments: any[] = [];
  for (const c of parseResult.comments) {
    comments.push({
      type: c.type === "Line" ? "CommentLine" : "CommentBlock",
      value: c.value,
      start: c.start,
      end: c.end,
      loc: {
        start: offsetToPos(c.start),
        end: offsetToPos(c.end),
      },
    });
  }

  function transformAndAttachLoc(node: any): any {
    if (!node || typeof node !== "object") {
      return node;
    }

    if (typeof node.start === "number" && typeof node.end === "number") {
      node.loc = {
        start: offsetToPos(node.start),
        end: offsetToPos(node.end),
      };
    }

    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      const child = node[key];
      if (Array.isArray(child)) {
        for (let i = 0; i < child.length; i++) {
          child[i] = transformAndAttachLoc(child[i]);
        }
      }
      else if (child && typeof child === "object") {
        node[key] = transformAndAttachLoc(child);
      }
    }

    // Convert ParenthesizedExpression into extra.parenthesized to match Recast expectations
    if (node.type === "ParenthesizedExpression") {
      const inner = node.expression;
      inner.extra = inner.extra || {};
      inner.extra.parenthesized = true;
      return inner;
    }

    // Attach innerComments for empty containers (such as empty ObjectExpression)
    if (node.type === "ObjectExpression" && node.properties?.length === 0) {
      const inner = comments.filter(c => c.start > node.start && c.end < node.end);
      if (inner.length > 0) {
        node.innerComments = inner.map(c => ({
          type: c.type,
          value: c.value,
          start: c.start,
          end: c.end,
          loc: {
            start: { ...c.loc.start },
            end: { ...c.loc.end },
          },
        }));
      }
    }

    return node;
  }

  const program = transformAndAttachLoc(parseResult.program);

  const tokens: any[] = [];
  if (parseResult.tokens) {
    for (let i = 0; i < parseResult.tokens.length; i++) {
      const start = parseResult.tokens.start(i);
      const end = parseResult.tokens.end(i);
      tokens.push({
        type: parseResult.tokens.kind(i),
        value: parseResult.tokens.text(i),
        start,
        end,
        loc: {
          start: offsetToPos(start),
          end: offsetToPos(end),
        },
      });
    }
  }

  // Merge comment tokens and parser tokens in source order
  const allTokens = [...tokens, ...comments].sort((a, b) => a.start - b.start);

  const file = {
    type: "File",
    program,
    comments,
    tokens: allTokens,
    loc: {
      start: offsetToPos(0),
      end: offsetToPos(source.length),
    },
  };

  return file;
}
