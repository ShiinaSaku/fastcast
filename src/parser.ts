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

/**
 * Create a recast-compatible parser bound to `options`.
 */
export function getParser(options?: ParserOptions) {
  return {
    parse(source: string) {
      return parse(source, options);
    },
  };
}

export const getBabelParser = getParser;

/**
 * Collect the start offset of every line in `source`.
 *
 * Recognizes `\n`, `\r`, `\r\n`, and the Unicode line/paragraph separators.
 */
function buildLineStarts(source: string): number[] {
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
  return lineStarts;
}

/**
 * Resolve a source offset (UTF-16 code units) to a 1-based `{ line, column }`
 * position via binary search.
 */
function offsetToPos(lineStarts: number[], offset: number) {
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

/**
 * Create a position resolver optimized for in-order AST walks.
 *
 * Offsets are visited in non-decreasing order while walking, so a moving
 * cursor is advanced instead of binary searching each time. Backward offsets
 * fall back to binary search, keeping it correct for any traversal order.
 */
function makePosResolver(lineStarts: number[]) {
  let idx = 0;
  return (offset: number) => {
    if (offset < lineStarts[idx]) {
      let low = 0;
      let high = idx;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (lineStarts[mid] <= offset) {
          low = mid + 1;
        }
        else {
          high = mid;
        }
      }
      idx = low > 0 ? low - 1 : 0;
    }
    else {
      const last = lineStarts.length - 1;
      while (idx < last && lineStarts[idx + 1] <= offset) {
        idx++;
      }
    }
    return {
      line: idx + 1,
      column: offset - lineStarts[idx],
    };
  };
}

/**
 * Parse `source` into a recast-compatible `File` node.
 *
 * Uses yuku-parser for parsing, then attaches ESTree-style `loc` objects and
 * normalizes tokens/comments so recast can preserve the original formatting.
 */
export function parse(source: string, options?: ParserOptions) {
  const lineStarts = buildLineStarts(source);

  const lang
    = options?.lang
      || (options?.sourceFileName ? langFromPath(options.sourceFileName) : undefined);
  const sourceType
    = options?.sourceType
      || (options?.sourceFileName ? sourceTypeFromPath(options.sourceFileName) : "module");

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
    const pos = offsetToPos(lineStarts, firstError.start);
    const err = new SyntaxError(`${firstError.message} (${pos.line}:${pos.column})`);
    (err as unknown as { loc: typeof pos; pos: number }).loc = pos;
    (err as unknown as { loc: typeof pos; pos: number }).pos = firstError.start;
    throw err;
  }

  // One resolver per traversal direction; reused across the whole pass.
  const posStart = makePosResolver(lineStarts);
  const posEnd = makePosResolver(lineStarts);

  const comments: any[] = [];
  const posComment = makePosResolver(lineStarts);
  for (const c of parseResult.comments) {
    comments.push({
      type: c.type === "Line" ? "CommentLine" : "CommentBlock",
      value: c.value,
      start: c.start,
      end: c.end,
      loc: {
        start: posComment(c.start),
        end: posComment(c.end),
      },
    });
  }

  // Empty objects need their interior comments attached as `innerComments`
  // for recast to reprint them. Collected during the walk and resolved in a
  // single pass afterwards.
  const emptyObjects: any[] = [];

  function transformAndAttachLoc(node: any): any {
    if (!node || typeof node !== "object") {
      return node;
    }

    const hasSpan
      = typeof node.start === "number" && typeof node.end === "number";
    // Start is resolved in pre-order (monotonic); `loc` is created fully formed
    // once the post-order end is known, so a node changes shape only once.
    const startPos = hasSpan ? posStart(node.start) : undefined;

    // `for...in` avoids allocating a keys array per node. Yuku nodes are plain
    // objects, so no inherited enumerable keys appear.
    for (const key in node) {
      if (key === "loc" || key === "comments" || key === "extra") {
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

    if (hasSpan) {
      node.loc = { start: startPos, end: posEnd(node.end) };
    }

    // Recast expects parens as `extra.parenthesized`, not a wrapper node.
    if (node.type === "ParenthesizedExpression") {
      const inner = node.expression;
      inner.extra = inner.extra || {};
      inner.extra.parenthesized = true;
      return inner;
    }

    // Attach innerComments for empty containers (such as empty ObjectExpression)
    if (
      node.type === "ObjectExpression"
      && node.properties?.length === 0
      && comments.length > 0
    ) {
      emptyObjects.push(node);
    }

    return node;
  }

  const program = transformAndAttachLoc(parseResult.program);

  // Both lists are source ordered, so one forward scan covers every object.
  if (emptyObjects.length > 0) {
    let ci = 0;
    for (const node of emptyObjects) {
      while (ci < comments.length && comments[ci].start <= node.start) {
        ci++;
      }
      let inner: any[] | undefined;
      for (let j = ci; j < comments.length && comments[j].start < node.end; j++) {
        if (comments[j].end < node.end) {
          (inner ||= []).push(comments[j]);
        }
      }
      if (inner) {
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
  }

  const tokens: any[] = [];
  if (parseResult.tokens) {
    const tokenList = parseResult.tokens;
    const posToken = makePosResolver(lineStarts);
    for (let i = 0; i < tokenList.length; i++) {
      const start = tokenList.start(i);
      const end = tokenList.end(i);
      tokens.push({
        type: tokenList.kind(i),
        value: tokenList.text(i),
        start,
        end,
        loc: {
          start: posToken(start),
          end: posToken(end),
        },
      });
    }
  }

  // Both inputs are source ordered, so a linear merge avoids a sort.
  const allTokens: any[] = [];
  {
    let ti = 0;
    let ci = 0;
    while (ti < tokens.length && ci < comments.length) {
      if (tokens[ti].start <= comments[ci].start) {
        allTokens.push(tokens[ti++]);
      }
      else {
        allTokens.push(comments[ci++]);
      }
    }
    while (ti < tokens.length) {
      allTokens.push(tokens[ti++]);
    }
    while (ci < comments.length) {
      allTokens.push(comments[ci++]);
    }
  }

  const file = {
    type: "File",
    program,
    comments,
    tokens: allTokens,
    loc: {
      start: offsetToPos(lineStarts, 0),
      end: offsetToPos(lineStarts, source.length),
    },
  };

  return file;
}
