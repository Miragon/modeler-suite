import { grandfatheredCeilings, modelerEslintConfig } from "../../tooling/eslint.mjs";

const grandfatheredDslCeilings = {
  files: ["packages/dsl/src/parser.ts", "packages/dsl/src/serializer.ts"],
  rules: {
    complexity: ["error", 130],
    "max-lines-per-function": ["error", { max: 600, skipBlankLines: true, skipComments: true }],
  },
};

export default modelerEslintConfig(
  import.meta.dirname,
  grandfatheredDslCeilings,
  grandfatheredCeilings("packages/dsl/src/parser.ts", { fileLines: 1623 }),
);
