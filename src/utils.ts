export class Todo extends Error {}

export class Unreachable extends Error {}

type NonNull = Record<string, unknown>;

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

export type Span = {
	start: number;
	end: number;
};

export const Span = { lineOf, columnOf, highlight };

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

function highlight(source: string, span: Span, note?: string): string {
	const column = columnOf(source, span);
	const line = lineOf(source, span);
	let lineContents = "";
	for (let i = 0; i < source.length; i++) {
		if (source[i] === "\n") {
			if (i >= span.end) {
				break;
			}
			lineContents = "";
		} else {
			lineContents += source[i];
		}
	}
	// console.log({
	// 	start: span.start,
	// 	end: span.end,
	// 	line,
	// 	column,
	// 	lineContents,
	// 	note,
	// });
	const prefix = ` ${line + 1} | `;
	const padding = `${" ".repeat(prefix.length - 2)}| ${" ".repeat(column)}`;
	const spanLength = clamp(
		span.end - span.start,
		1,
		lineContents.length - column
	);
	const highlight = "^".repeat(spanLength);
	if (note !== undefined) {
		return `${padding}\n${prefix}${lineContents}\n${padding}${highlight}\n${padding}${note}`;
	} else {
		return `${padding}\n${prefix}${lineContents}\n${padding}${highlight}`;
	}
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
