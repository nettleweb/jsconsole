export default class Module {
	static {
		const proto = this.prototype;
		Object.defineProperty(proto, Symbol.toStringTag, {
			value: "Module",
			writable: false,
			enumerable: false,
			configurable: false
		});
		Object.setPrototypeOf(proto, null);
		Object.freeze(proto);
	}

	get name(): string {
		throw new Error("Stub!");
	}

	get meta(): ImportMeta {
		throw new Error("Stub!");
	}

	get exports(): any {
		throw new Error("Stub!");
	}

	get sandbox(): any {
		throw new Error("Stub!");
	}

	async import(name: string): Promise<any> {
		throw new Error("Stub!");
	}
}