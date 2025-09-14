import * as angularPlugin from '@angular-eslint/eslint-plugin'
import * as angularTemplateParser from '@angular-eslint/template-parser'
import * as prettierPlugin from 'eslint-plugin-prettier'

export default [
	{
		ignores: [
			'.cache/',
			'.git/',
			'.github/',
			'node_modules/'
		],
	},
	{
		files: [
			'**/*.html'
		],
		languageOptions: {
			parser: angularTemplateParser,
		},
		plugins: {
			'@angular-eslint': angularPlugin,
			'@angular-eslint/template': angularPlugin,
			prettier: prettierPlugin,
		},
		rules: {
			'prettier/prettier': [
				'error',
				{
					parser: 'angular',
				}
			],
		},
	},
]
