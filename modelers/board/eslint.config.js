import reactHooks from "eslint-plugin-react-hooks";
import { modelerEslintConfig } from "../../tooling/eslint.mjs";

const reactRules = {
  files: ["packages/renderer/**/*.{ts,tsx}"],
  plugins: { "react-hooks": reactHooks },
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
  },
};

export default modelerEslintConfig(import.meta.dirname, reactRules);
