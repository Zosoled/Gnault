import * as angularPlugin from '@angular-eslint/eslint-plugin'
import * as angularTemplateParser from '@angular-eslint/template-parser'
import * as prettierPlugin from 'eslint-plugin-prettier'
import * as tsPlugin from '@typescript-eslint/eslint-plugin'
import * as typescriptParser from '@typescript-eslint/parser'
import * as eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'

export default [
	{
		ignores: ['.cache/', '.git/', '.github/', 'node_modules/'],
	},
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: typescriptParser,
			parserOptions: {
				project: ['./tsconfig.json', './tsconfig.app.json', './tsconfig.spec.json'],
			},
		},
		plugins: {
			'@angular-eslint': angularPlugin,
			'@typescript-eslint': tsPlugin,
			prettier: prettierPlugin,
		},
		rules: {
			...angularPlugin.configs.recommended.rules,
			...prettierPlugin.configs?.rules,
			...tsPlugin.configs.recommended.rules,
			'@angular-eslint/component-selector': [
				'warn',
				{
					type: 'element',
					prefix: 'app',
					style: 'kebab-case',
				},
			],
			'@angular-eslint/directive-selector': [
				'warn',
				{
					type: 'attribute',
					prefix: 'app',
					style: 'camelCase',
				},
			],
			'@angular-eslint/no-host-metadata-property': 'off',
			'@angular-eslint/no-output-on-prefix': 'off',
			'@typescript-eslint/ban-types': 'off',
			'@typescript-eslint/member-ordering': 0,
			'@typescript-eslint/naming-convention': 0,
			'@typescript-eslint/no-explicit-any': ['off'],
			'@typescript-eslint/no-inferrable-types': 'off',
			'import/order': 'off',
		},
	},
	{
		files: ['**/*.html'],
		languageOptions: {
			parser: angularTemplateParser,
		},
		plugins: {
			'@angular-eslint': angularPlugin,
			'@angular-eslint/template': angularPlugin,
			prettier: prettierPlugin,
		},
		rules: {
			'prettier/prettier': ['error', { parser: 'angular' }],
		},
	},
	eslintPluginPrettierRecommended,
]
