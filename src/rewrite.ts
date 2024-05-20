import { parse } from "@babel/parser";
import { Identifier, Statement } from "@babel/types";


function rewriteGlobalStatement(js: string, it: Statement): string {
	let newJs: string = "";
	switch (it.type) {
		case "VariableDeclaration":
			switch (it.kind) {
				case "var":
					for (const decl of it.declarations) {
						newJs += "window[\"" + (decl.id as Identifier).name + "\"] = ";

						const init = decl.init;
						if (init != null) {
							const expr = js.slice(init.start!, init.end!).trim();
							if (expr[expr.length - 1] !== ";")
								newJs += expr + ";\n";
							else
								newJs += expr + "\n";
						} else newJs += "void 0;\n";
					}
					break;
				case "let":
					for (const decl of it.declarations) {
						newJs += "__scope__[\"" + (decl.id as Identifier).name + "\"] = ";

						const init = decl.init;
						if (init != null) {
							const expr = js.slice(init.start!, init.end!).trim();
							if (expr[expr.length - 1] !== ";")
								newJs += expr + ";\n";
							else
								newJs += expr + "\n";
						} else newJs += "void 0;\n";
					}
					break;
				case "const":
					for (const decl of it.declarations) {
						newJs += "Object.defineProperty(__scope__, \"" + (decl.id as Identifier).name + "\", { value: ";

						const init = decl.init;
						if (init != null) {
							const expr = js.slice(init.start!, init.end!).trim();
							const last = expr.length - 1;
							if (expr[last] === ";")
								newJs += expr.slice(0, last);
							else
								newJs += expr;
						} else newJs += "void 0";

						newJs += ", writable: false, enumerable: false, configurable: false });\n";
					}
					break;
			}
			break;
		case "InterfaceDeclaration":
		case "FunctionDeclaration":
		case "ClassDeclaration":
		case "EnumDeclaration":
			{
				const id = it.id;
				if (id != null)
					newJs += "__scope__[\"" + id.name + "\"] = ";

				const expr = js.slice(it.start!, it.end!).trim();
				if (expr[expr.length - 1] !== ";")
					newJs += expr + ";\n";
				else
					newJs += expr + "\n";
			}
			break;
		case "EmptyStatement":
		case "DebuggerStatement":
			break;
		case "ExpressionStatement":
			{
				const expr = it.expression;
				switch (expr.type) {
					case "AwaitExpression":
					case "YieldExpression":
						{
							const arg = expr.argument;
							if (arg != null) {
								const expr = js.slice(arg.start!, arg.end!).trim();
								if (expr[expr.length - 1] !== ";")
									newJs += "await " + expr + ";\n";
								else
									newJs += "await " + expr + "\n";
							}
						}
						break;
					default:
						break;
				}
			}
			break;
		default:
			{
				const expr = js.slice(it.start!, it.end!).trim();
				if (expr[expr.length - 1] !== ";")
					newJs += expr + ";\n";
				else
					newJs += expr + "\n";
			}
			break;
	}

	return newJs;
}

export default function rewrite(js: string): string {
	const { body } = parse(js, {
		ranges: true,
		tokens: false,
		strictMode: true,
		sourceType: "script",
		attachComment: false,
		allowAwaitOutsideFunction: true,
		allowReturnOutsideFunction: true
	}).program;

	const last = body.pop();
	let newJs: string = "";

	for (const it of body)
		newJs += rewriteGlobalStatement(js, it);

	if (last != null) {
		if (last.type === "ExpressionStatement")
			newJs += "return " + js.slice(last.start!, last.end!);
		else
			newJs += rewriteGlobalStatement(js, last);
	}

	return newJs;
}