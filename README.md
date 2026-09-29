# fastcast

[![Open on npmx.dev](https://npmx.dev/api/registry/badge/version/fastcast)](https://npmx.dev/package/fastcast)
[![Downloads](https://npmx.dev/api/registry/badge/downloads/fastcast)](https://npmx.dev/package/fastcast)
[![Licence](https://npmx.dev/api/registry/badge/license/fastcast)](https://npmx.dev/package/fastcast)

Programmatically modify JavaScript and TypeScript source codes with a simplified, elegant, and familiar syntax.

`fastcast` is a high-performance fork of [`magicast`](https://github.com/unjs/magicast) (originally created by [Pooya Parsa](https://github.com/pi0) and [unjs](https://github.com/unjs)), re-engineered to use [`yuku-parser`](https://github.com/yuku-toolchain/yuku) and [`recast`](https://github.com/benjamn/recast).

- **Intuitive Modification**: Modify JS/TS source files and write them back just like modifying JSON objects.
- **High Performance**: Powered by `yuku-parser` (written in Zig) delivering up to 25%+ faster parsing throughput.
- **Lightweight Footprint**: 70%+ reduction in parser dependencies on disk compared to `@babel/parser` and `@babel/types`.
- **Imports & Exports**: Easily inspect, mutate, add, or remove ESM imports and exports.
- **Function Arguments**: Easily manipulate arguments passed to wrapper functions like `defineConfig()`.
- **Style Preservation**: Preserves code formatting styles (quotes, tabs, spaces, comments) from the original code.
- **Strict Type Safety**: Full TypeScript type definitions with strict AST typing.

## About This Fork

`fastcast` was created to modernize the parsing backend of `magicast`:
- Replaced Babel (`@babel/parser` and `@babel/types`) with `yuku-parser`.
- Reduced installed parser footprint from ~4.5 MB down to ~1.3 MB.
- Faster cold start and parse throughput on modern runtimes.
- Retains 100% test and API compatibility with `magicast`.

Repository: [github.com/shiinasaku/fastcast](https://github.com/shiinasaku/fastcast)

## Install

Install the package:

```sh
pnpm add -D fastcast

npm install -D fastcast

yarn add --dev fastcast
```

Import utilities:

```js
import { builders, generateCode, loadFile, parseModule, writeFile } from "fastcast";
```

## Examples

### Modify a configuration file

`config.js`:

```js
export default {
  foo: ["a"],
};
```

Code to modify and append `"b"` to `foo` property of `default`:

```js
import { loadFile, writeFile } from "fastcast";

const mod = await loadFile("config.js");

mod.exports.default.foo.push("b");

await writeFile(mod, "config.js");
```

Updated `config.js`:

```js
export default {
  foo: ["a", "b"],
};
```

### Direct AST manipulation

```js
import { generateCode, parseModule } from "fastcast";

// Parse to AST proxy
const mod = parseModule(`export default { }`);

// Ensure foo is an array and append elements
mod.exports.default.foo ||= [];
mod.exports.default.foo.push("b");
mod.exports.default.foo.unshift("a");

// Generate code
const { code } = generateCode(mod);
```

Output:

```js
export default {
  foo: ["a", "b"],
};
```

### Working with wrapper functions (`defineConfig`)

```js
import { parseModule } from "fastcast";

const mod = parseModule(`export default defineConfig({ foo: 'bar' })`);

// Access either bare object export or wrapped function arguments
const options
  = mod.exports.default.$type === "function-call"
    ? mod.exports.default.$args[0]
    : mod.exports.default;

console.log(options.foo); // 'bar'
```

### Creating function calls

```js
import { builders, parseModule } from "fastcast";

const mod = parseModule(`export default {}`);

mod.exports.default.list = builders.functionCall("create", [1, 2, 3]);

console.log(mod.generateCode());
// export default { list: create([1, 2, 3]) }
```

## Notes

Because JavaScript and TypeScript can be very dynamic, `fastcast` is designed primarily for static or semi-static configuration files and declarations. For safe modifications, wrapping updates in a `try/catch` block is recommended:

```ts
import { loadFile, writeFile } from "fastcast";

async function updateConfig() {
  try {
    const mod = await loadFile("config.js");
    mod.exports.default.foo.push("b");
    await writeFile(mod);
  }
  catch (error) {
    console.error("Unable to automatically update config.js:", error);
  }
}
```

## Browser and Worker Support

The main entrypoint includes Node filesystem utilities (`loadFile`, `writeFile`). If bundling for browser or worker environments, import from `fastcast/core` instead:

```js
import { parseModule } from "fastcast/core";
```

## High Level Helpers

`fastcast` provides helpers for common framework config operations via `fastcast/helpers`:

```js
import {
  addNuxtModule,
  addVitePlugin,
  deepMergeObject,
  findVitePluginCall,
  updateVitePluginConfig,
} from "fastcast/helpers";
```

See the [source code](./src/helpers) and [test cases](./test/helpers) for full helper documentation.

<!-- benchmark:start -->
## Benchmark

Performance comparison between the latest upstream release (`magicast@0.5.5` using Babel) and fastcast (powered by [`yuku-parser`](https://github.com/yuku-toolchain/yuku)).

*Last updated: 2026-09-29 (Node.js v24.21.0, darwin arm64)*

### Performance & Throughput

| Benchmark Case | `magicast@0.5.5` | fastcast (`yuku-parser`) | Speedup |
| :--- | :---: | :---: | :---: |
| **Small Config Parse (vite.config.ts)** | 15,188 ops/s (`0.066 ms`) | **19,553 ops/s** (`0.051 ms`) | **+28.7% (1.29x)** |
| **Medium Config Parse (nuxt.config.ts)** | 5,458 ops/s (`0.183 ms`) | **7,447 ops/s** (`0.134 ms`) | **+36.4% (1.36x)** |
| **Large TS Module Parse (~1,000 lines)** | 186 ops/s (`5.383 ms`) | **193 ops/s** (`5.171 ms`) | **+3.8% (1.04x)** |
| **E2E: Parse + Mutate + Codegen (Vite)** | 5,431 ops/s (`0.184 ms`) | **5,603 ops/s** (`0.178 ms`) | **+3.2% (1.03x)** |
| **E2E: Parse + Mutate + Codegen (Nuxt)** | 2,692 ops/s (`0.371 ms`) | **2,983 ops/s** (`0.335 ms`) | **+10.8% (1.11x)** |

### Footprint & Efficiency

| Metric | `magicast@0.5.5` (Babel) | fastcast (`yuku-parser`) | Improvement |
| :--- | :---: | :---: | :---: |
| **Parser Dependencies on Disk** | 4.53 MB | **1.29 MB** | **-71.5% smaller** |
| **Cold Start (Module Load)** | 38.5 ms | **35.3 ms** | **~8.4% faster** |
| **Heap Memory Growth (1,000 parses)** | 36.45 MB | **54.74 MB** | **+50.2%** |
<!-- benchmark:end -->

## Development

- Clone this repository: `git clone https://github.com/shiinasaku/fastcast.git`
- Enable Corepack: `corepack enable`
- Install dependencies: `pnpm install`
- Run tests: `pnpm test`
- Run benchmarks: `pnpm run bench`

## Credits & License

`fastcast` is a fork of [`magicast`](https://github.com/unjs/magicast) created by Pooya Parsa and the unjs contributors.

Published under the [MIT License](./LICENSE).

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/fastcast?style=flat&colorA=18181B&colorB=F0DB4F
[npm-version-href]: https://npmjs.com/package/fastcast
[npm-downloads-src]: https://img.shields.io/npm/dm/fastcast?style=flat&colorA=18181B&colorB=F0DB4F
[npm-downloads-href]: https://npmjs.com/package/fastcast
[license-src]: https://img.shields.io/github/license/shiinasaku/fastcast.svg?style=flat&colorA=18181B&colorB=F0DB4F
[license-href]: https://github.com/shiinasaku/fastcast/blob/main/LICENSE
