import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // Scope linting to this package's own source; .kit/, tools/, .claude/,
    // and docs/ belong to the orchestration kit, not the npm package.
    ignores: ["dist/**", ".kit/**", "tools/**", ".claude/**", "docs/**"],
  },
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
);
