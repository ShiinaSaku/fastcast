import type { GenerateResult } from "../src/types";
import { builders, generateCode, parseModule } from "../src";

interface ExampleConfig {
  default: {
    plugins: string[];
  };
}

const module = parseModule<ExampleConfig>("export default { plugins: [] };");
module.exports.default.plugins.push("example-plugin");
const output: GenerateResult = generateCode(module);
const literal = builders.literal(new Date("2024-01-01T00:00:00.000Z"));

void output;
void literal;
