import antfu from "@antfu/eslint-config";

export default antfu(
  {
    ignores: ["vendor/**/*", "test/stubs/config2.ts"],
    stylistic: {
      quotes: "double",
      semi: true,
    },
  },
);
