import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'
import tsdoc from 'eslint-plugin-tsdoc'

export default defineConfig([
	{
		files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
		extends: ['js/recommended'],
		languageOptions: { globals: globals.browser },
		plugins: { js, tsdoc },
		rules: {
			'tsdoc/syntax': 'error',
		},
	},
	tseslint.configs.recommended,
])
