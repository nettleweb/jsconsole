import { Class, Expression, Function, ModuleDeclaration, Parser, Pattern, Statement, VariableDeclaration } from "acorn";
import Constants from "./Constants";

function parsePatternNames(list: string[], it: Pattern) {
	switch (it.type) {
		case "Identifier":
			list.push("\"" + it.name + "\"");
			break;
		case "RestElement":
			parsePatternNames(list, it.argument);
			break;
		case "ArrayPattern":
			for (const e of it.elements) {
				if (e != null)
					parsePatternNames(list, e);
			}
			break;
		case "ObjectPattern":
			for (const p of it.properties) {
				if (p.type === "Property")
					parsePatternNames(list, p.value);
				else
					parsePatternNames(list, p.argument);
			}
			break;
		case "AssignmentPattern":
			parsePatternNames(list, it.left);
			break;
		default:
			break;
	}
}

function rewritePattern(js: string, it: Pattern): string {
	switch (it.type) {
		case "Identifier":
			return it.name;
		case "RestElement":
			return "..." + rewritePattern(js, it.argument);
		case "ArrayPattern":
			return "[" + it.elements.map((e) => e == null ? "" : rewritePattern(js, e)).join(",") + "]";
		case "ObjectPattern":
			return "{" + it.properties.map((e) => {
				if (e.type === "Property")
					return e.computed ? ("[" + rewriteExpression(js, e.key) + "]") : rewriteExpression(js, e.key) + ":" + rewritePattern(js, e.value);
				else
					return "..." + rewritePattern(js, e.argument);
			}).join(",") + "}";
		default:
			return js.slice(it.start, it.end).trim();
	}
}

function rewriteGlobalVar(js: string, it: VariableDeclaration): string {
	const list: string[] = [];
	let bnjs: string = "";

	for (const { id, init } of it.declarations) {
		parsePatternNames(list, id);

		bnjs += rewritePattern(js, id) + "="
		if (init != null)
			bnjs += rewriteExpression(js, init) + ";\n";
		else
			bnjs += "void 0;\n";
	}

	return Constants.module + ".global(" + list.join(",") + ");\n" + bnjs;
}

function rewriteCommonVar(js: string, it: VariableDeclaration): string {
	return it.kind + " " + it.declarations.map(({ id, init }) => {
		let str = rewritePattern(js, id);
		if (init != null)
			str += "=" + rewriteExpression(js, init);
		return str;
	}).join(",");
}

function rewriteExpression(js: string, it: Expression): string {
	let njs: string = "";

	switch (it.type) {
		case "MetaProperty":
			if (it.meta.name === "import" && it.property.name === "meta")
				njs += Constants.module + ".meta";
			else
				njs += js.slice(it.start, it.end).trim();
			break;
		case "ImportExpression":
			njs += Constants.module + ".import(" + rewriteExpression(js, it.source) + ")";
			break;
		default:
			njs += js.slice(it.start, it.end).trim();
			break;
	}

	return njs;
}

function rewriteClass(js: string, it: Class): string {
	let njs: string = "class";

	{
		const id = it.id;
		if (id != null)
			njs += " " + id.name;
	}

	{
		const sc = it.superClass;
		if (sc != null)
			njs += " extends " + rewriteExpression(js, sc);
	}

	njs += "{\n";

	for (const e of it.body.body) {
		switch (e.type) {
			case "StaticBlock":
				njs += "static{\n" + rewriteFuncScope(js, e.body) + "}\n";
				break;
			case "MethodDefinition":
				{
					const func = e.value;

					if (e.static)
						njs += "static ";
					if (func.async)
						njs += "async "
					if (func.generator)
						njs += "*";

					let hasName: boolean = true;

					switch (e.kind) {
						case "set":
							njs += "set ";
							break;
						case "get":
							njs += "get ";
							break;
						case "constructor":
							njs += "constructor(";
							hasName = false;
							break;
						default:
							// ignore
							break;
					}

					if (hasName) {
						const k = e.key;
						if (e.computed)
							njs += "[" + rewriteExpression(js, k as Expression) + "](";
						else
							njs += js.slice(k.start, k.end).trim() + "("; // non-rewritable
					}

					njs += func.params.map((e) => rewritePattern(js, e)).join(",") + "){\n";
					njs += rewriteFuncScope(js, func.body.body) + "}\n";
				}
				break;
			case "PropertyDefinition":
				if (e.static)
					njs += "static ";

				{
					const k = e.key;
					if (e.computed)
						njs += "[" + rewriteExpression(js, k as Expression) + "]";
					else
						njs += js.slice(k.start, k.end).trim(); // non-rewritable
				}

				{
					const v = e.value;
					if (v != null)
						njs += "=" + rewriteExpression(js, v) + ";\n";
					else
						njs += ";\n";
				}
				break;
			default:
				// never happens
				break;
		}
	}

	return njs + "}\n";
}

function rewriteFunction(js: string, it: Function): string {
	let njs: string = it.async ? "async function" : "function";

	{
		const id = it.id;
		if (id != null)
			njs += " " + id.name;
	}

	njs += it.generator ? "*(" : "(" + it.params.map((e) => rewritePattern(js, e)).join(",") + ")";

	{

		const body = it.body;
		if (body.type === "BlockStatement")
			njs += "{\n" + rewriteFuncScope(js, body.body) + "}\n";
		else
			njs += "{\nreturn " + rewriteExpression(js, body) + ";\n}\n";;
	}

	return njs;
}

function rewriteFuncStatement(js: string, it: Statement): string {
	let njs: string = "";

	switch (it.type) {
		case "FunctionDeclaration":
			njs += rewriteFunction(js, it);
			break;
		case "VariableDeclaration":
			njs += rewriteCommonVar(js, it) + ";\n";
			break;
		case "ClassDeclaration":
			njs += rewriteClass(js, it);
			break;
		case "IfStatement":
			njs += "if(" + rewriteExpression(js, it.test) + ")\n";
			njs += rewriteFuncStatement(js, it.consequent);

			{
				const alt = it.alternate;
				if (alt != null)
					njs += "else " + rewriteFuncStatement(js, alt);
			}
			break;
		case "TryStatement":
			njs += "try{\n" + rewriteFuncScope(js, it.block.body) + "\n}";

			{
				const handler = it.handler;
				if (handler != null) {
					njs += "catch";
					{
						const param = handler.param;
						if (param != null)
							njs += "(" + rewritePattern(js, param) + ")";
					}
					njs += "{\n" + rewriteFuncScope(js, handler.body.body) + "\n}";
				}
			}

			{
				const finalizer = it.finalizer;
				if (finalizer != null)
					njs += "finally{\n" + rewriteFuncScope(js, finalizer.body) + "\n}";
			}
			break;
		case "ForStatement":
			njs += "for(";

			{
				const init = it.init;
				if (init != null) {
					if (init.type === "VariableDeclaration")
						njs += rewriteCommonVar(js, init);
					else
						njs += rewriteExpression(js, init);
				}
			}

			njs += ";";

			{
				const test = it.test;
				if (test != null)
					njs += rewriteExpression(js, test);
			}

			njs += ";";

			{
				const update = it.update;
				if (update != null)
					njs += rewriteExpression(js, update);
			}

			njs += ")\n" + rewriteFuncStatement(js, it.body);
			break;
		case "ForInStatement":
			njs += "for(";

			{
				const left = it.left;
				if (left.type === "VariableDeclaration")
					njs += rewriteCommonVar(js, left);
				else
					njs += rewritePattern(js, left);
			}

			njs += " in " + rewriteExpression(js, it.right) + ")\n" + rewriteFuncStatement(js, it.body);
			break;
		case "ForOfStatement":
			njs += it.await ? "for await(" : "for(";

			{
				const left = it.left;
				if (left.type === "VariableDeclaration")
					njs += rewriteCommonVar(js, left);
				else
					njs += rewritePattern(js, left);
			}

			njs += " of " + rewriteExpression(js, it.right) + ")\n" + rewriteFuncStatement(js, it.body);
			break;
		case "SwitchStatement":
			njs += "switch(" + rewriteExpression(js, it.discriminant) + "){\n";

			for (const { test, consequent } of it.cases) {
				if (test != null)
					njs += "case " + rewriteExpression(js, test) + ":\n";
				else
					njs += "default:\n";

				njs += rewriteFuncScope(js, consequent);
			}

			njs += "}\n";
			break;
		case "ReturnStatement":
			{
				const arg = it.argument;
				if (arg != null)
					njs += "return " + rewriteExpression(js, arg) + ";\n";
				else
					njs += "return;\n";
			}
			break;
		case "WithStatement":
			njs += "with(" + rewriteExpression(js, it.object) + ")\n" + rewriteFuncStatement(js, it.body);
			break;
		case "WhileStatement":
			njs += "while(" + rewriteExpression(js, it.test) + ")\n" + rewriteFuncStatement(js, it.body);
			break;
		case "DoWhileStatement":
			njs += "do " + rewriteFuncStatement(js, it.body) + "while(" + rewriteExpression(js, it.test) + ");\n";
			break;
		case "BlockStatement":
			njs += "{\n" + rewriteFuncScope(js, it.body) + "\n}\n";
			break;
		case "ThrowStatement":
			njs += "throw " + rewriteExpression(js, it.argument) + ";\n";
			break;
		case "LabeledStatement":
			njs += it.label.name + ":\n" + rewriteFuncStatement(js, it.body);
			break;
		case "ExpressionStatement":
			njs += rewriteExpression(js, it.expression) + ";\n";
			break;
		case "EmptyStatement":
		case "DebuggerStatement":
			break;
		default:
			njs += js.slice(it.start, it.end).trim() + ";\n";
			break;
	}

	return njs;
}

function rewriteFuncScope(js: string, list: Statement[]): string {
	let njs: string = "";

	for (const it of list)
		njs += rewriteFuncStatement(js, it);

	return njs;
}

function rewriteGlobalStatement(js: string, it: Statement): string {
	let njs: string = "";

	switch (it.type) {
		case "FunctionDeclaration":
			njs += "window[\"" + it.id.name + "\"]=" + (it.async ? "async function" : "function") + (it.generator ? "*(" : "(");
			njs += it.params.map((e) => rewritePattern(js, e)).join(",") + "){\n";
			njs += rewriteFuncScope(js, it.body.body) + "}\n";
			break;
		case "VariableDeclaration":
			if (it.kind === "var")
				njs += rewriteGlobalVar(js, it);
			else
				njs += rewriteCommonVar(js, it) + ";\n";
			break;
		case "ClassDeclaration":
			njs += rewriteClass(js, it);
			break;
		case "IfStatement":
			njs += "if(" + rewriteExpression(js, it.test) + ")\n";
			njs += rewriteGlobalStatement(js, it.consequent);

			{
				const alt = it.alternate;
				if (alt != null)
					njs += "else " + rewriteGlobalStatement(js, alt);
			}
			break;
		case "TryStatement":
			njs += "try{\n" + rewriteGlobalScope(js, it.block.body) + "\n}";

			{
				const handler = it.handler;
				if (handler != null) {
					njs += "catch";
					{
						const param = handler.param;
						if (param != null)
							njs += "(" + rewritePattern(js, param) + ")";
					}
					njs += "{\n" + rewriteGlobalScope(js, handler.body.body) + "\n}";
				}
			}

			{
				const finalizer = it.finalizer;
				if (finalizer != null)
					njs += "finally{\n" + rewriteGlobalScope(js, finalizer.body) + "\n}";
			}
			break;
		case "ForStatement":
			{
				const arg = it.init;
				if (arg != null) {
					if (arg.type === "VariableDeclaration") {
						if (arg.kind === "var") {
							const list: string[] = [];
							const bnjs: string[] = [];

							for (const { id, init } of arg.declarations) {
								parsePatternNames(list, id);
								bnjs.push(rewritePattern(js, id) + "=" + (init == null ? "void 0" : rewriteExpression(js, init)));
							}

							njs += Constants.module + ".global(" + list.join(",") + ");\nfor(" + bnjs.join(",") + ";";
						} else njs += "for(" + rewriteCommonVar(js, arg) + ";";
					} else njs += "for(" + rewriteExpression(js, arg) + ";";
				} else njs += "for(;";
			}

			{
				const test = it.test;
				if (test != null)
					njs += rewriteExpression(js, test);
			}

			njs += ";";

			{
				const update = it.update;
				if (update != null)
					njs += rewriteExpression(js, update);
			}

			njs += ")\n" + rewriteGlobalStatement(js, it.body);
			break;
		case "ForInStatement":
			{
				const arg = it.left;
				if (arg.type === "VariableDeclaration") {
					if (arg.kind === "var") {
						const list: string[] = [];
						const bnjs: string[] = [];

						for (const { id, init } of arg.declarations) {
							parsePatternNames(list, id);
							bnjs.push(rewritePattern(js, id) + "=" + (init == null ? "void 0" : rewriteExpression(js, init)));
						}

						njs += Constants.module + ".global(" + list.join(",") + ");\nfor(" + bnjs.join(",");
					} else njs += "for(" + rewriteCommonVar(js, arg);
				} else njs += "for(" + rewritePattern(js, arg);
			}

			njs += " in " + rewriteExpression(js, it.right) + ")\n" + rewriteGlobalStatement(js, it.body);
			break;
		case "ForOfStatement":
			{
				const arg = it.left;
				if (arg.type === "VariableDeclaration") {
					if (arg.kind === "var") {
						const list: string[] = [];
						const bnjs: string[] = [];

						for (const { id, init } of arg.declarations) {
							parsePatternNames(list, id);
							bnjs.push(rewritePattern(js, id) + "=" + (init == null ? "void 0" : rewriteExpression(js, init)));
						}

						njs += Constants.module + ".global(" + list.join(",") + ");\n" + (it.await ? "for await(" : "for(") + bnjs.join(",");
					} else njs += (it.await ? "for await(" : "for(") + rewriteCommonVar(js, arg);
				} else njs += (it.await ? "for await(" : "for(") + rewritePattern(js, arg);
			}

			njs += " of " + rewriteExpression(js, it.right) + ")\n" + rewriteGlobalStatement(js, it.body);
			break;
		case "SwitchStatement":
			njs += "switch(" + rewriteExpression(js, it.discriminant) + "){\n";

			for (const { test, consequent } of it.cases) {
				if (test != null)
					njs += "case " + rewriteExpression(js, test) + ":\n";
				else
					njs += "default:\n";

				njs += rewriteGlobalScope(js, consequent);
			}

			njs += "}\n";
			break;
		case "ReturnStatement":
			{
				const arg = it.argument;
				if (arg != null)
					njs += "return " + rewriteExpression(js, arg) + ";\n";
				else
					njs += "return;\n";
			}
			break;
		case "WithStatement":
			njs += "with(" + rewriteExpression(js, it.object) + ")\n" + rewriteGlobalStatement(js, it.body);
			break;
		case "WhileStatement":
			njs += "while(" + rewriteExpression(js, it.test) + ")\n" + rewriteGlobalStatement(js, it.body);
			break;
		case "DoWhileStatement":
			njs += "do " + rewriteGlobalStatement(js, it.body) + "while(" + rewriteExpression(js, it.test) + ");\n";
			break;
		case "BlockStatement":
			njs += "{\n" + rewriteGlobalScope(js, it.body) + "\n}\n";
			break;
		case "ThrowStatement":
			njs += "throw " + rewriteExpression(js, it.argument) + ";\n";
			break;
		case "LabeledStatement":
			njs += it.label.name + ":\n" + rewriteGlobalStatement(js, it.body);
			break;
		case "ExpressionStatement":
			njs += rewriteExpression(js, it.expression) + ";\n";
			break;
		case "EmptyStatement":
		case "DebuggerStatement":
			break;
		default:
			njs += js.slice(it.start, it.end).trim() + ";\n";
			break;
	}

	return njs;
}

function rewriteGlobalScope(js: string, list: Statement[]): string {
	let njs: string = "";

	for (const it of list)
		njs += rewriteGlobalStatement(js, it);

	return njs;
}

function rewriteTopLevelStatement(js: string, it: Statement | ModuleDeclaration) {
	switch (it.type) {
		case "VariableDeclaration":
			if (it.kind !== "var") {
				const list: string[] = [];
				let bnjs: string = "";

				for (const { id, init } of it.declarations) {
					parsePatternNames(list, id);

					bnjs += rewritePattern(js, id) + "="
					if (init != null)
						bnjs += rewriteExpression(js, init) + ";\n";
					else
						bnjs += "void 0;\n";
				}

				return Constants.module + ".scope(" + list.join(",") + ");\n" + bnjs;
			}
			return rewriteGlobalVar(js, it);
		case "ClassDeclaration":
			const n = it.id.name;
			return Constants.module + ".scope(\"" + n + "\");\n" + n + "=" + rewriteClass(js, it);
		case "ImportDeclaration":
		case "ExportAllDeclaration":
		case "ExportNamedDeclaration":
		case "ExportDefaultDeclaration":
			return ""; // ignore
		default:
			return rewriteGlobalStatement(js, it);
	}
}

const Rewriter: { readonly rewrite: (js: string) => string; } = {
	rewrite: (js: string) => {
		const body = Parser.parse(js, {
			ranges: true,
			locations: false,
			sourceType: "script",
			ecmaVersion: 2022,
			allowHashBang: true,
			allowReserved: false,
			checkPrivateFields: true,
			allowAwaitOutsideFunction: true,
			allowReturnOutsideFunction: true
		}).body;

		const last = body.pop();
		if (last == null)
			return ""; // empty script

		let njs: string = "";

		for (const it of body)
			njs += rewriteTopLevelStatement(js, it);

		if (last.type === "ExpressionStatement")
			njs += "return " + rewriteExpression(js, last.expression) + ";\n";
		else
			njs += rewriteTopLevelStatement(js, last);

		return njs;
	}
};

Object.setPrototypeOf(Rewriter, null);
export default Object.freeze(Rewriter);