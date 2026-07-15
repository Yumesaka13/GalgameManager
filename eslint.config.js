// Flat ESLint config.
//
// Layers (last wins):
//   1. eslint + typescript-eslint recommended  — generic bugs
//   2. eslint-plugin-solid (flat/typescript)   — SolidJS reactivity pitfalls
//   3. project rules aligned with AGENTS.md    — no `any`, no unused vars
//   4. eslint-config-prettier                  — disable formatting conflicts
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import solidPlugin from 'eslint-plugin-solid'
import prettier from 'eslint-config-prettier'

// The package ships a CJS default export; normalise it.
const solid = solidPlugin.default ?? solidPlugin

export default tseslint.config(
  {
    ignores: ['dist/**', 'src-tauri/**', 'node_modules/**', 'coverage/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { solid },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    rules: {
      // SolidJS reactivity & pattern rules — the main reason we lint.
      ...solid.configs['flat/typescript'].rules,
      // AGENTS.md: no `any` / `as unknown`.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      // TS already enforces undefined-variable checks; the core rule
      // produces false positives for types/globals.
      'no-undef': 'off',
      // Solid assigns `let` refs at runtime via its JSX transform
      // (`<div ref={el}>`), so the linter sees no assignment — disable to
      // avoid false positives on this idiomatic pattern.
      'no-unassigned-vars': 'off',
      // Keep a couple of noisy-but-useful ones as warnings so they don't
      // fail CI but still surface in the editor.
      'no-console': 'warn',
      'prefer-const': 'error'
    }
  },
  prettier
)
