import globals from "globals";
import tseslint from "typescript-eslint";
import userscripts from "eslint-plugin-userscripts";

export default [
  {
    ignores: ["dist/*", "!dist/boks.user.js"]
  },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        chrome: "readonly"
      }
    },
    rules: {
      "curly": ["error", "all"],
      "@typescript-eslint/prefer-optional-chain": "error",
      "prefer-const": "warn",
      "@typescript-eslint/no-explicit-any": "warn"
    }
  },
  {
    files: ["src/userscript.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        GM_getValue: "readonly",
        GM_setValue: "readonly",
        GM_registerMenuCommand: "readonly",
        GM_notification: "readonly",
        GM_setClipboard: "readonly",
        unsafeWindow: "readonly"
      }
    },
    rules: {
      "no-console": "off",
      "no-alert": "off"
    }
  },
  {
    // Lint the generated userscript for headers validation
    files: ["dist/boks.user.js"],
    plugins: {
      userscripts
    },
    rules: {
      ...userscripts.configs.recommended.rules,
      "userscripts/no-invalid-headers": "error",
      "userscripts/no-useless-headers": "warn",
      // Disable code rules for the bundle
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-undef": "off"
    }
  }
];
