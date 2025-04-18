export class Todo extends Error {
	constructor() {
		super("Todo!");
	}
}

export type NonNull = Record<string, unknown>;

export function structurallyEq(a: unknown, b: unknown): boolean {
	const aStack: NonNull[] = [];
	const bStack: NonNull[] = [];

	function helper(a: unknown, b: unknown): boolean {
		if (a === b) {
			return true;
		}
		if (a === null || b === null) {
			return false;
		}
		if (typeof a !== "object" || typeof b !== "object") {
			return false;
		}
		if (Array.isArray(a) !== Array.isArray(b)) {
			return false;
		}
		const i = aStack.indexOf(a as NonNull);
		if (i === -1) {
			const aKeys = Object.keys(a);
			const bKeys = Object.keys(b);
			if (aKeys.length !== bKeys.length) {
				return false;
			}
			try {
				aStack.push(a as NonNull);
				bStack.push(b as NonNull);
				for (const key of aKeys) {
					if (!helper((a as NonNull)[key], (b as NonNull)[key])) {
						return false;
					}
				}
			} finally {
				bStack.pop();
				aStack.pop();
			}
			return true;
		} else {
			return bStack[i] === b;
		}
	}
	return helper(a, b);
}

export function clamp(n: number, min: number, max: number): number {
	return Math.max(Math.min(n, max), min);
}

export function zip<A, B>(as: A[], bs: B[]): [A, B][] {
	const length = Math.min(as.length, bs.length);
	const zipped: [A, B][] = new Array(length);
	for (let i = 0; i < length; i++) {
		zipped[i] = [as[i], bs[i]];
	}
	return zipped;
}

export function zipLeft<A, B>(as: A[], bs: B[]): [A, B | undefined][] {
	const zipped: [A, B][] = new Array(as.length);
	for (let i = 0; i < as.length; i++) {
		zipped[i] = [as[i], bs[i]];
	}
	return zipped;
}

export function zipRight<A, B>(as: A[], bs: B[]): [A | undefined, B][] {
	const zipped: [A, B][] = new Array(bs.length);
	for (let i = 0; i < bs.length; i++) {
		zipped[i] = [as[i], bs[i]];
	}
	return zipped;
}

export function enumerate<A>(as: A[]): [number, A][] {
	const enumerated: [number, A][] = new Array(as.length);
	for (let i = 0; i < as.length; i++) {
		enumerated[i] = [i, as[i]];
	}
	return enumerated;
}

export class ArrayIter<T> {
	#array: T[];
	#position: number;

	constructor(array: T[]) {
		this.#array = array;
		this.#position = 0;
	}

	tryNext(): T | undefined {
		return this.next();
	}

	get hasNext(): boolean {
		return this.#position < this.#array.length;
	}

	next(): T {
		return this.#array[this.#position++];
	}

	take(n: number): T[] {
		const taken: T[] = [];
		while (n-- > 0 && this.hasNext) {
			taken.push(this.next());
		}
		return taken;
	}

	rest(): T[] {
		return this.#array.slice(this.#position);
	}

	skip(n: number): void {
		this.#position += n;
	}
}

export type Span = {
	start: number;
	end: number;
};

export const Span = { lineOf, columnOf };

function lineOf(source: string, span: Span): number {
	let line = 0;
	for (let i = 0; i < span.start; i++) {
		if (source[i] === "\n") {
			line++;
		}
	}
	return line;
}

function columnOf(source: string, span: Span): number {
	let column = 0;
	for (let i = 0; i < span.start; i++) {
		column++;
		if (source[i] === "\n") {
			column = 0;
		}
	}
	return column;
}

export function sexpr(v: unknown, ignoreKeys: string[] = []): string {
	if (v === undefined) {
		return "_";
	}
	if (typeof v !== "object" || v === null) {
		return `${v}`;
	}
	let mapped: string[];
	if (Array.isArray(v)) {
		mapped = v.map((vi) => sexpr(vi, ignoreKeys));
	} else {
		mapped = [];
		for (const key in v) {
			if (!ignoreKeys.includes(key)) {
				const vk = (v as NonNull)[key];
				if (Array.isArray(vk)) {
					mapped.push(sexpr([key, ...vk], ignoreKeys));
				} else {
					mapped.push(sexpr(vk, ignoreKeys));
				}
			}
		}
	}
	const oneLine = `(${mapped.join(" ")})`;
	if (!oneLine.includes("\n") && oneLine.length <= 80) {
		return oneLine;
	}
	return `(${mapped.join("\n")})`.replaceAll("\n", "\n  ");
}

// TODO extends me for syntax/type errors
export class Problem extends Error {
	readonly start: number;
	readonly end: number;

	constructor(message: string, span: Span, options: ErrorOptions | undefined) {
		super(message, options);
		this.start = span.start;
		this.end = span.end;
	}
}
