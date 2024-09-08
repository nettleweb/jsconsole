import * as ace from "ace-code";
import * as js from "ace-code/src/mode/typescript";
import Rewriter from "./Rewriter";
import Module from "./Module";
import Constants from "./Constants";

"use strict"; debugger; (async ({ window: win, document: doc }: {
	readonly window: Window;
	readonly document: Document;
}) => {
	function $(id: string): HTMLElement {
		const elem = doc.getElementById(id);
		if (elem == null)
			throw new Error("Element does not exist: " + id);
		return elem;
	}

	function q(q: string): HTMLElement {
		const elem = doc.querySelector(q);
		if (elem instanceof HTMLElement)
			return elem;
		throw new Error("Failed to query selector: " + q);
	}

	if (doc.readyState !== "complete") {
		await new Promise<void>((resolve) => {
			const callback = () => {
				if (doc.readyState === "complete") {
					doc.removeEventListener("readystatechange", callback);
					setTimeout(resolve, 50, null);
				}
			};
			doc.addEventListener("readystatechange", callback, { passive: true });
		});
	}

	win.stop();
	win.focus();

	// cache built-in objects to avoid error after being modified by the executed code
	const { Reflect, DataView, Function, Object, String, Error } = win;

	const isArray = Array.isArray.bind(Array);
	const isArrayBufferView = ArrayBuffer.isView.bind(ArrayBuffer);

	const toStringTag = Symbol.toStringTag;

	// freeze the reflect object to avoid errors
	Object.freeze(Object.setPrototypeOf(Reflect, null));

	win.addEventListener("error", (e) => {
		e.preventDefault();
		e.stopPropagation();

		const msg = "Unhandled error at " + (e.filename || "unknown source") + " " + (e.lineno || "X") + ":" + (e.colno || "X") + "\n\n Message: " + String(e.error);

		console.error(msg);
		errElem.textContent = msg;
		errElem.style.display = "block";
	});
	win.addEventListener("unhandledrejection", (e) => {
		e.preventDefault();
		e.stopPropagation();

		console.error("Unhandled rejection: ", e.reason);
	});

	const history: string[] = [];
	const errElem = $("error");
	const output = $("output");
	const mode = new js.Mode();
	let current: number = 0;

	const input = ace.edit(q("#input>div"), {
		tabSize: 4,
		minLines: 1,
		maxLines: 99,
		fontSize: 16,
		fontFamily: "Ubuntu Mono",
		showGutter: false,
		cursorStyle: "ace",
		newLineMode: "unix",
		animatedScroll: false,
		enableAutoIndent: true,
		indentedSoftWrap: true,
		highlightActiveLine: false,
		wrapBehavioursEnabled: true,
		autoScrollEditorIntoView: true
	});

	input.focus();
	input.resize(true);
	input.session.setMode(mode);
	input.session.setUseWrapMode(true);

	input.commands.addCommand({
		exec: () => {
			const { row, column } = input.getCursorPosition();
			if (row === 0) {
				if (current > 0) {
					input.moveCursorTo(0, 0);
					input.setValue(history[--current], -1);
				}
			} else input.moveCursorTo(row - 1, column);
		},
		name: "1",
		bindKey: "Up",
		readOnly: false
	});
	input.commands.addCommand({
		exec: () => {
			const { row, column } = input.getCursorPosition();
			if (row === input.getLastVisibleRow()) {
				if (current < history.length) {
					input.moveCursorTo(0, 0);
					input.setValue(history[++current] || "", -1);
				}
			} else input.moveCursorTo(row + 1, column);
		},
		name: "2",
		bindKey: "Down",
		readOnly: false
	});
	input.commands.addCommand({
		exec: () => {
			const value = input.getValue().trim();
			if (value.length > 0) {
				history.push(value);
				current = history.length;

				input.blur();
				input.setValue("", -1);
				input.setReadOnly(true);

				runCmd(value).then(() => {
					input.setReadOnly(false);
					input.focus();
				});
			}
		},
		name: "3",
		bindKey: "Enter",
		readOnly: false
	});

	const scope = Object.create(null);
	const module = new Module();
	const scopeId = "scope_" + Date.now().toString(36);
	const DUMMY_STRING = "&quot;<span style=\"color:#808080\">...</span>&quot;";
	const DUMMY_FUNCTION = "<span style=\"color:#000080\">function</span> (<span style=\"color:#808080\">...</span>) { <span style=\"color:#808080\">...</span> }";

	Object.defineProperty(module, "global", {
		value: (...args: string[]) => {
			for (const k of args)
				win[k] = void 0;
		},
		writable: false,
		enumerable: false,
		configurable: false
	});
	Object.defineProperty(module, "scope", {
		value: (...args: string[]) => {
			for (const k of args)
				scope[k] = void 0;
		},
		writable: false,
		enumerable: false,
		configurable: false
	});

	function isArrayBuffer(obj: any): obj is ArrayBuffer {
		try {
			new DataView(obj, 0, 0);
			return true;
		} catch (err) {
			return false;
		}
	}

	function escapeString(str: string): string {
		return str.replace(/[\"\'\\(\x00-\x1F)(\x7f-\x9f)(\ud800-\udfff)]/g, (ch) => {
			switch (ch) {
				case "\"":
					return "\\\"";
				case "\'":
					return "\\\'";
				case "\\":
					return "\\\\";
				case "\b":
					return "\\b";
				case "\f":
					return "\\f";
				case "\n":
					return "\\n";
				case "\r":
					return "\\r";
				case "\t":
					return "\\t";
				default:
					return "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
			}
		});
	}

	function getClassName(obj: any): string | null {
		try {
			const name = obj[toStringTag];
			if (typeof name === "string")
				return name;

			const struct = obj["constructor"];
			if (typeof struct === "function") {
				const name = struct["name"];
				if (typeof name === "string")
					return name;
			}
		} catch (err) {
			// ignore
		}
		return null;
	}

	function print(text: string, color?: string | nul, parent?: HTMLElement | nul): HTMLElement {
		const elem = doc.createElement("span");
		(parent || output).appendChild(elem);
		elem.style.color = color || "";
		elem.textContent = text;
		return elem;
	}

	function println(text: string, color?: string | nul, parent?: HTMLElement | nul): HTMLElement {
		return print(text + "\n", color, parent);
	}

	function printhr() {
		const elem = doc.createElement("hr");
		output.appendChild(elem);
		elem.scrollIntoView({
			block: "nearest",
			inline: "nearest",
			behavior: "instant"
		});
	}

	function printCmd(cmd: string) {
		const elem = doc.createElement("div");
		output.appendChild(elem);
		elem.scrollIntoView({
			block: "nearest",
			inline: "nearest",
			behavior: "instant"
		});

		ace.edit(elem, {
			value: cmd,
			tabSize: 4,
			minLines: 1,
			maxLines: 99,
			readOnly: true,
			fontSize: 14,
			fontFamily: "Ubuntu Mono",
			showGutter: false,
			cursorStyle: "ace",
			newLineMode: "unix",
			animatedScroll: false,
			indentedSoftWrap: true,
			highlightActiveLine: false,
			wrapBehavioursEnabled: true
		}).session.setMode(mode);
	}

	function printString(value: string, parent?: HTMLElement | nul) {
		const elem = doc.createElement("span");
		(parent || output).appendChild(elem);

		if ((value = "\"" + escapeString(value) + "\"").length > 30) {
			const text = print("", "#008000", elem);
			text.innerHTML = DUMMY_STRING;

			{
				const e = doc.createElement("button");
				e.type = "button";
				e.title = "Copy text";
				e.style.backgroundImage = "url(\"res/copy.svg\")";
				elem.appendChild(e);

				e.onclick = () => {
					navigator.clipboard.writeText(value);
				};
			}
			{
				const e = doc.createElement("button");
				e.type = "button";
				e.title = "Expand";
				e.style.backgroundImage = "url(\"res/expand.svg\")";
				elem.appendChild(e);

				e.onclick = () => {
					if (e.title === "Expand") {
						e.title = "Collapse";
						e.style.backgroundImage = "url(\"res/collapse.svg\")";
						text.textContent = value;
					} else {
						e.title = "Expand";
						e.style.backgroundImage = "url(\"res/expand.svg\")";
						text.innerHTML = DUMMY_STRING;
					}
				};
			}
		} else {
			print(value, "#008000", elem);

			{
				const e = doc.createElement("button");
				e.type = "button";
				e.title = "Copy text";
				e.style.backgroundImage = "url(\"res/copy.svg\")";
				elem.appendChild(e);

				e.onclick = () => {
					navigator.clipboard.writeText(value);
				};
			}
		}
	}

	function printFunction(value: any, parent?: HTMLElement | nul) {
		const elem = doc.createElement("span");
		(parent || output).appendChild(elem);

		const text = print("", void 0, elem);
		text.innerHTML = DUMMY_FUNCTION;
		value = value.toString().trim();

		{
			const e = doc.createElement("button");
			e.type = "button";
			e.title = "Copy text";
			e.style.backgroundImage = "url(\"res/copy.svg\")";
			elem.appendChild(e);

			e.onclick = () => {
				navigator.clipboard.writeText(value);
			};
		}
		{
			const e = doc.createElement("button");
			e.type = "button";
			e.title = "Expand";
			e.style.backgroundImage = "url(\"res/expand.svg\")";
			elem.appendChild(e);

			e.onclick = () => {
				if (e.title === "Expand") {
					e.title = "Collapse";
					e.style.backgroundImage = "url(\"res/collapse.svg\")";
					text.textContent = value;
				} else {
					e.title = "Expand";
					e.style.backgroundImage = "url(\"res/expand.svg\")";
					text.innerHTML = DUMMY_FUNCTION;
				}
			};
		}
	}

	function printObject(value: any, parent?: HTMLElement | nul) {
		const elem = doc.createElement("span");
		(parent || output).appendChild(elem);
		elem.style.display = "inline-block";

		const name = getClassName(value) || "";
		const dummy = name.length > 0 ? name + " { ... }" : "{ ... }";
		const text = print(dummy, void 0, elem);

		{
			const e = doc.createElement("button");
			e.type = "button";
			e.title = "Expand";
			e.style.backgroundImage = "url(\"res/expand.svg\")";
			elem.appendChild(e);

			e.onclick = () => {
				if (e.title === "Expand") {
					e.title = "Collapse";
					e.style.backgroundImage = "url(\"res/collapse.svg\")";

					text.innerHTML = "";
					print(name.length > 0 ? name + " {\n" : "{\n", void 0, text);

					{
						const proto = Reflect.getPrototypeOf(value);
						if (proto != null) {
							print("\t#prototype: ", void 0, text);
							printObject(proto, text);
							print(",\n", void 0, text);
						}
					}

					for (const key of Reflect.ownKeys(value)) {
						print("\t", void 0, text);

						const desc = Reflect.getOwnPropertyDescriptor(value, key);
						if (desc != null) { // keep null check to avoid rare case errors
							if ("value" in desc) {
								if (!(desc.writable ?? true))
									print("readonly ", "#000080", text);
								if (!(desc.configurable ?? true))
									print("final ", "#000080", text);

								print(typeof key === "string" ? key : "[" + key.toString() + "]", (desc.enumerable ?? true) ? "#008000" : "#808080", text);
								print(": ", void 0, text);
								printValue(desc.value, text);
								print(",\n", void 0, text);
							} else {
								if (!(desc.configurable ?? true))
									print("final ", "#000080", text);

								if ("get" in desc) {
									print("get ", "#000080", text);
									print(typeof key === "string" ? key : "[" + key.toString() + "]", (desc.enumerable ?? true) ? "#008000" : "#808080", text);
									print("() { ... }, ", void 0, text);
								}
								if ("set" in desc) {
									print("set ", "#000080", text);
									print(typeof key === "string" ? key : "[" + key.toString() + "]", (desc.enumerable ?? true) ? "#008000" : "#808080", text);
									print("(v) { ... }, ", void 0, text);
								}
								print("\n", void 0, text);
							}
						}
					}

					print("}", void 0, text);
				} else {
					e.title = "Expand";
					e.style.backgroundImage = "url(\"res/expand.svg\")";
					text.textContent = dummy;
				}
			};
		}

	}

	function printArray(value: any[], parent?: HTMLElement | nul) {
		const elem = doc.createElement("span");
		(parent || output).appendChild(elem);
		elem.style.display = "inline-block";

		const dummy = value.length > 0 ? "[ ... ]" : "[]";
		const text = print(dummy, void 0, elem);

		{
			const e = doc.createElement("button");
			e.type = "button";
			e.title = "Expand";
			e.style.backgroundImage = "url(\"res/expand.svg\")";
			elem.appendChild(e);

			e.onclick = () => {
				if (e.title === "Expand") {
					e.title = "Collapse";
					e.style.backgroundImage = "url(\"res/collapse.svg\")";

					text.innerHTML = "";
					print("[\n", void 0, text);

					for (const it of value) {
						print("\t", void 0, text);
						printValue(it, text);
						print(",\n", void 0, text);
					}

					print("]", void 0, text);
				} else {
					e.title = "Expand";
					e.style.backgroundImage = "url(\"res/expand.svg\")";
					text.textContent = dummy;
				}
			};
		}
	}

	function printValue(value: any, parent?: HTMLElement | nul) {
		switch (typeof value) {
			case "number":
				print(value.toString(10), "#0000ff", parent);
				break;
			case "bigint":
				print(String(value) + "n", "#0000ff", parent);
				break;
			case "symbol":
				print(value.toString(), "#800080", parent);
				break;
			case "boolean":
				print(value ? "true" : "false", "#000080", parent);
				break;
			case "undefined":
				print("undefined", "#000080", parent);
				break;
			case "string":
				printString(value, parent);
				break;
			case "function":
				printFunction(value, parent);
				break;
			default:
				if (value == null)
					print("null", "#000080", parent);
				else if (isArray(value))
					printArray(value, parent);
				else if (isArrayBuffer(value))
					print("ArrayBuffer {}", void 0, parent);
				else if (isArrayBufferView(value))
					print("ArrayBufferView {}", void 0, parent);
				else
					printObject(value, parent);
		}
	}

	async function runCmd(cmd: string) {
		printCmd(cmd = cmd.trim());

		if (cmd.charAt(0) === "/") {
			const args = cmd.slice(1).replace(/\s+/g, " ").split(" ");
			switch (cmd = args[0]) {
				case "clear":
					if (args.length > 1) {
						println("Error: Invalid argument.", "#ff0000");
						println("Try '/help' for more information.", "#ff0000");
						printhr();
					} else output.innerHTML = "";
					break;
				case "help":
					println("Embedded JSConsole version 0.1.0 by WhiteSpider Dev\n", "#0000ff");
					println("Basic usage notes:", "#808000");
					println("\tAll inputs that starts with '/' will be treated as a built-in command.", "#808000");
					println("\tAll other inputs will be executed as JavaScript code with 'eval(code)'.\n", "#808000");
					println("Built-in commands:", "#008000");
					println("\t/clear			- Clear the console.", "#008000");
					println("\t/help			- Display this help message.", "#008000");
					println("\t/version			- Show version information.", "#008000");
					printhr();
					break;
				case "version":
					if (args.length > 1) {
						println("Error: Invalid argument.", "#ff0000");
						println("Try '/help' for more information.", "#ff0000");
						printhr();
					} else {
						println("v0.1.0");
						printhr();
					}
					break;
				default:
					println(cmd + ": command not found.", "#ff0000");
					println("Try '/help' for a list of built-in commands.", "#ff0000");
					printhr();
					break;
			}
			return;
		}

		try {
			cmd = "\"use strict\";\n" + Rewriter.rewrite(";" + cmd);
		} catch (err) {
			println(String(err), "#ff0000");
			printhr();
			return;
		}

		let value: any;

		try {
			value = await Reflect.apply(new Function("arguments", "self", "window", "globalThis", scopeId, Constants.module, "with(" + scopeId + "){return(async()=>{\"use strict\";\n" + cmd + "\n;\n})();}"), win, [void 0, win, win, win, scope, module]);
		} catch (err) {
			println("Uncaught " + err, "#ff0000");
			printhr();
			return;
		}

		printValue(value);
		printhr();
	}
})(window);