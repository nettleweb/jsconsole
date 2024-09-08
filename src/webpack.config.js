import path from "path";
import TerserPlugin from "terser-webpack-plugin";

/**
 * @type {import("webpack").Configuration}
 */
const config = {
	name: "WhiteSpider",
	mode: "production",
	entry: "./main.ts",
	cache: true,
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: "ts-loader",
				exclude: /node_modules/
			}
		]
	},
	output: {
		path: path.resolve("../out/"),
		charset: true,
		filename: "out.js",
		uniqueName: "WhiteSpider",
		scriptType: "text/javascript",
		environment: {
			const: true,
			forOf: true,
			module: false,
			globalThis: false,
			arrowFunction: true,
			asyncFunction: true,
			bigIntLiteral: true,
			dynamicImport: false,
			destructuring: false,
			templateLiteral: true,
			optionalChaining: false
		},
		globalObject: "window"
	},
	resolve: {
		extensions: [".js", ".ts"],
		symlinks: false,
		cache: false
	},
	performance: { hints: false },
	optimization: {
		minimize: true,
		minimizer: [new TerserPlugin({
			parallel: true,
			terserOptions: {
				ecma: 2017,
				mangle: true,
				module: true,
				enclose: true,
				toplevel: true,
				keep_fnames: false,
				keep_classnames: false,
				parse: {
					shebang: false,
					bare_returns: false,
					html5_comments: false
				},
				format: {
					shebang: false,
					comments: false,
					preamble: "https://nettleweb.com/\n\n\n/*! Copyright (C) 2024 nettleweb.com; All rights reserved. !*/\n\"use strict\";\n",
					ascii_only: true,
					semicolons: false,
					inline_script: false
				},
				compress: {
					unsafe: true,
					arguments: true,
					hoist_funs: true,
					keep_fargs: false,
					drop_console: true
				}
			}
		})],
		runtimeChunk: false,
		checkWasmTypes: true,
		providedExports: true,
		removeEmptyChunks: true,
		concatenateModules: true
	}
};

export default config;