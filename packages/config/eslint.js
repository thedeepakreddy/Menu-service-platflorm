// Shared ESLint flat-config building blocks (P-104).
// Type-aware rules are enabled for all TypeScript sources; plain JS/MJS/CJS
// config files are linted without type information.
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export const ignores = {
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/.turbo/**',
    '**/coverage/**',
    '**/test-results/**',
    '**/playwright-report/**',
    '**/next-env.d.ts',
    // Deliberately-violating fixtures used to prove boundary enforcement.
    'tests/architecture/fixtures/**',
  ],
};

export const base = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);

/** Next.js app rules; pass the app directory, e.g. "apps/web". */
export function nextjs(appDir) {
  return [
    {
      files: [`${appDir}/**/*.{ts,tsx}`],
      plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
      languageOptions: { globals: { ...globals.browser } },
      rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs['core-web-vitals'].rules,
        ...reactHooks.configs.recommended.rules,
      },
      settings: { next: { rootDir: appDir } },
    },
  ];
}

export { prettier };
