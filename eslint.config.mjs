import { base, ignores, nextjs, prettier } from '@platform/config/eslint';

export default [
  ignores,
  ...base,
  ...nextjs('apps/web'),
  {
    // NestJS modules are empty decorated classes (`@Module(...) class X {}`).
    // The rule's own `allowWithDecorator` option exempts only decorated
    // classes; undecorated extraneous classes are still reported.
    files: ['apps/api/**/*.ts'],
    rules: { '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }] },
  },
  prettier,
];
