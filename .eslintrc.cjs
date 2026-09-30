module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  env: { node: true, es2022: true },
  extends: ['eslint:recommended'],
  ignorePatterns: ['out/', 'node_modules/'],
  rules: {
    'no-undef': 'off',
    'no-unused-vars': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-async-promise-executor': 'error',
    'no-promise-executor-return': 'error',
    'no-unsafe-finally': 'error'
  }
}
