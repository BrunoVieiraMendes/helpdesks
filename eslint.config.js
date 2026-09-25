const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    ignores: ['public/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        Api: 'writable',
        Ui: 'writable',
        Filtros: 'writable',
        Icones: 'writable',
        Abas: 'writable',
        Notificacoes: 'writable',
        BuscaGlobal: 'writable',
        Graficos: 'writable',
        CamposAdicionais: 'writable',
        HD: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern:
            '^(Api|Ui|Filtros|Icones|Abas|Graficos|CamposAdicionais|Notificacoes|BuscaGlobal)$',
        },
      ],
      // api.js / ui.js / filtros.js definem os globais compartilhados pelas páginas
      'no-redeclare': ['error', { builtinGlobals: false }],
      eqeqeq: ['error', 'always'],
    },
  },
  prettier,
];
