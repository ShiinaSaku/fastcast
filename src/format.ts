// Extracted from recast
export interface CodeFormatOptions {
  tabWidth?: number;
  useTabs?: boolean;
  wrapColumn?: number;
  quote?: "single" | "double";
  trailingComma?: boolean;
  arrayBracketSpacing?: boolean;
  objectCurlySpacing?: boolean;
  arrowParensAlways?: boolean;
  useSemi?: boolean;
}

/**
 * Cache of detected formats keyed by source.
 *
 * The same source is scanned twice per parse/generate cycle (once for
 * `tabWidth`, once for the full format) and again across repeated parses, so
 * caching the style-independent result pays off. User overrides are applied
 * on top afterwards.
 */
const _formatCache = new Map<string, CodeFormatOptions>();
const _FORMAT_CACHE_LIMIT = 128;

/**
 * Detect the formatting style of `code`, with optional `userStyles` taking
 * precedence over detected values.
 */
export function detectCodeFormat(
  code: string,
  userStyles: CodeFormatOptions = {},
): CodeFormatOptions {
  const cached = _formatCache.get(code);
  if (cached !== undefined) {
    return applyUserStyles(cached, userStyles);
  }

  const format = Object.freeze(detectFormat(code));
  if (_formatCache.size >= _FORMAT_CACHE_LIMIT) {
    // Map preserves insertion order, so the first key is the oldest.
    _formatCache.delete(_formatCache.keys().next().value as string);
  }
  _formatCache.set(code, format);

  return applyUserStyles(format, userStyles);
}

/**
 * Overlay user-provided styles on top of a detected format.
 *
 * Only keys explicitly set by the user are applied. An explicit `undefined`
 * is ignored (it means "not specified"), because recast resolves defaults with
 * `hasOwnProperty` — a key holding `undefined` would shadow the default
 * instead of falling back to it.
 */
function applyUserStyles(
  detected: CodeFormatOptions,
  userStyles: CodeFormatOptions,
): CodeFormatOptions {
  const keys = Object.keys(userStyles) as (keyof CodeFormatOptions)[];
  if (keys.length === 0) {
    return detected;
  }
  const format = { ...detected };
  for (const key of keys) {
    if (userStyles[key] !== undefined) {
      format[key] = userStyles[key] as any;
    }
  }
  return format;
}

function detectFormat(code: string): CodeFormatOptions {
  // The cached result is style-independent, so detect every feature here.
  const detect = {
    wrapColumn: true,
    indent: true,
    quote: true,
    arrowParens: true,
    trailingComma: true,
  };

  // Frequency counters and state
  let codeIndent = 2;
  let tabUsages = 0;
  let semiUsages = 0;
  let maxLineLength = 0;
  let multiLineTrailingCommaUsages = 0;

  // Syntax detection regex
  // TODO: Perf: Compile only for features we need to detect
  const syntaxDetectRegex
    = /(?<doubleQuote>"[^"]+")|(?<singleQuote>'[^']+')|(?<singleParam>\([^),]+\)\s*=>)|(?<trailingComma>,\s*[\]}])/g;
  const syntaxUsages = {
    doubleQuote: 0,
    singleQuote: 0,
    singleParam: 0,
    trailingComma: 0,
  };

  // Line by line analysis
  const lines = (code || "").split("\n");
  let previousLineTrailing = false;
  for (const line of lines) {
    // Trim line
    // TODO: Trim comments
    const trimmitedLine = line.trim();

    // Skip empty lines
    if (trimmitedLine.length === 0) {
      continue;
    }

    // Max width
    if (detect.wrapColumn && line.length > maxLineLength) {
      maxLineLength = line.length;
    }

    // Indentation analysis
    if (detect.indent) {
      const lineIndent = line.match(/^\s+/)?.[0] || "";
      if (lineIndent.length > 0) {
        if (lineIndent.length > 0 && lineIndent.length < codeIndent) {
          codeIndent = lineIndent.length;
        }
        if (lineIndent[0] === "\t") {
          tabUsages++;
        }
        else if (lineIndent.length > 0) {
          tabUsages--;
        }
      }
    }

    // Line ending analysis
    if (trimmitedLine.at(-1) === ";") {
      semiUsages++;
    }
    else if (trimmitedLine.length > 0) {
      semiUsages--;
    }

    // Syntax analysis
    if (detect.quote || detect.arrowParens) {
      const matches = trimmitedLine.matchAll(syntaxDetectRegex);
      for (const match of matches) {
        if (!match.groups) {
          continue;
        }
        for (const key in syntaxUsages) {
          if (match.groups[key]) {
            // @ts-expect-error indexing with a template literal type key
            syntaxUsages[key]++;
          }
        }
      }
    }

    if (detect.trailingComma) {
      if (line.startsWith("}") || line.startsWith("]")) {
        if (previousLineTrailing) {
          multiLineTrailingCommaUsages++;
        }
        else {
          multiLineTrailingCommaUsages--;
        }
      }
      previousLineTrailing = trimmitedLine.endsWith(",");
    }
  }

  const format = <CodeFormatOptions>{
    wrapColumn: maxLineLength,
    useTabs: tabUsages > 0,
    tabWidth: codeIndent,
    quote:
      syntaxUsages.singleQuote > syntaxUsages.doubleQuote ? "single" : "double",
    arrowParensAlways: syntaxUsages.singleParam > 0,
    trailingComma:
      multiLineTrailingCommaUsages > 0 || syntaxUsages.trailingComma > 0,
    useSemi: semiUsages > 0,
    // TODO: detect arrayBracketSpacing / objectCurlySpacing
  };

  return format;
}
