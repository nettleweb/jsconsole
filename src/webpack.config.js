import path from "path";

/**
 * @type {import("webpack").Configuration}
 */
const config = {
	name: "WhiteSpider",
	mode: "production",
	entry: "./main.ts",
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
			arrowFunction: true,
			asyncFunction: true,
			bigIntLiteral: true,
			const: true,
			forOf: true,
			module: false,
			globalThis: false,
			dynamicImport: false,
			destructuring: false,
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
		runtimeChunk: false,
		checkWasmTypes: true,
		providedExports: true,
		removeEmptyChunks: true,
		concatenateModules: true
	}
};

export default config;