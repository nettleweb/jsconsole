declare global {
	export type nul = null | void | undefined;
	export type globalThis = typeof globalThis;
	export interface Window extends Record<any, any>, globalThis {
	}

	export interface Generator<T, TReturn, TNext> {
	}
	export interface AsyncGenerator<T, TReturn, TNext> extends Generator<T, TReturn, TNext> {
	}

	export interface Function {
		(...args: any[]): any;
	}
	export interface AsyncFunction extends Function {
		(...args: any[]): Promise<any>;
	}
	export interface GeneratorFunction extends Function {
		(...args: any[]): Generator<any, any, any>;
	}
	export interface AsyncGeneratorFunction extends AsyncFunction, GeneratorFunction {
		(...args: any[]): AsyncGenerator<any, any, any>;
		prototype: any;
	}

	export interface FunctionConstructor {
		(...args: string[]): Function;
		new(...args: string[]): Function;
		readonly prototype: Function;
	}
	export interface AsyncFunctionConstructor {
		(...args: string[]): AsyncFunction;
		new(...args: string[]): AsyncFunction;
		readonly prototype: AsyncFunction;
	}
	export interface GeneratorFunctionConstructor {
		(...args: string[]): GeneratorFunction;
		new(...args: string[]): GeneratorFunction;
		readonly prototype: GeneratorFunction;
	}
	export interface AsyncGeneratorFunctionConstructor {
		(...args: string[]): AsyncGeneratorFunction;
		new(...args: string[]): AsyncGeneratorFunction;
		readonly prototype: AsyncGeneratorFunction;
	}
}

export { };