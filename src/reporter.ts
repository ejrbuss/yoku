import { magenta, yellow, gray, red, underline, blue } from "@std/fmt/colors";
import { Span } from "./utils.ts";
import { CodeSource } from "./codesource.ts";
import { Tokenizer, TokenType } from "./tokens.ts";

export type Fmt = (text: string) => string;

export type HighlightColors = Partial<Record<TokenType, Fmt>>;

export const NoColors: HighlightColors = {};
export const DefaultColors: HighlightColors = {
	[TokenType.Punc]: blue,
	[TokenType.Keyword]: magenta,
	[TokenType.Lit]: yellow,
	[TokenType.Comment]: gray,
	[TokenType.Doc]: gray,
	[TokenType.Error]: (text) => red(underline(text)),
};

export function highlight(
	source: string,
	colors: HighlightColors = DefaultColors
): string {
	const tokens = Tokenizer.tokenize(CodeSource.fromString(source));
	let highlighted = "";
	for (const token of tokens) {
		const formatter = colors[token.type];
		if (formatter) {
			highlighted += formatter(token.image);
		} else {
			highlighted += token.image;
		}
	}
	return highlighted;
}

type Annotation = {
	start: number;
	end: number;
	path?: string;
	note?: string;
	fmt?: Fmt;
	overflow?: number;
};

export function annotate(source: string, annotaion: Annotation): string {
	let { start, end, path, note, fmt, overflow } = annotaion;
	// Validate span
	if (start < 0 || end < 0 || start > end || end > source.length) {
		throw new Error(
			`Cannot annotate (${start}, ${end}] for content of length ${source.length}!`
		);
	}
	// Gather the context
	let ctxStart = 0;
	let ctxEnd = source.length;
	let lineNo = 1;
	let colNo = 1;
	for (let i = 0; i < source.length; i++) {
		const c = source[i];
		if (c === "\n") {
			if (i >= end) {
				ctxEnd = i;
				break;
			}
			if (i < start) {
				ctxStart = i + 1;
				colNo = 1;
			}
			lineNo += 1;
		} else if (i < start) {
			colNo += 1;
		}
	}
	// Render the annotation
	let ctx = source.substring(ctxStart, ctxEnd);
	if (fmt) {
		const prefix = ctx.substring(0, start - ctxStart);
		const span = ctx.substring(start - ctxStart, end - ctxStart);
		const suffix = ctx.substring(end - ctxStart);
		ctx = `${prefix}${fmt(span)}${suffix}`;
	} else {
		fmt = (text) => text;
	}
	const ctxLines = ctx.split("\n");
	const maxLineNo = lineNo + ctxLines.length - 1;
	const annotated: string[] = [];
	const padding = asPadding(` ${maxLineNo}`);
	if (path) {
		annotated.push(gray(`${padding}--> ${path}:${lineNo}:${colNo}`));
	}
	annotated.push(gray(`${padding} |`));
	for (const line of ctxLines) {
		const paddedLineNo = rightPad(lineNo, `${maxLineNo}`.length);
		annotated.push(` ${gray(paddedLineNo)} ${gray("|")} ${line}`);
		lineNo += 1;
	}
	const lastLine = ctxLines[ctxLines.length - 1];
	const oneLine = ctxLines.length === 1;
	const underStart = oneLine ? colNo - 1 : 0;
	const underPadding = tabAwarePadding(underStart, lastLine);
	annotated.push(`${padding} ${gray("|")} ${underPadding}${fmt("^")} `);
	if (note) {
		const last = annotated.pop() as string;
		if (last.length + note.length < (overflow ?? 80)) {
			annotated.push(`${last}${fmt(note)}`);
		} else {
			annotated.push(last);
			annotated.push(`${padding} ${gray("|")}${underPadding} ${fmt(note)}`);
		}
	}
	return annotated.join("\n");
}

function asPadding(text: string): string {
	return " ".repeat(text.length);
}

function rightPad(text: unknown, length: number): string {
	let padded = `${text}`;
	if (padded.length > length) {
		throw new Error(`Cannot pad '${text}' to length ${length}!`);
	}
	while (padded.length < length) {
		padded += " ";
	}
	return padded;
}

function tabAwarePadding(length: number, text: string): string {
	let padded = "";
	for (let i = 0; i < length; i++) {
		padded += text[i] === "\t" ? "\t" : " ";
	}
	return padded;
}

export function tab(
	text: string,
	tab: string = "  ",
	leading: boolean = true
): string {
	return (leading ? `${tab}` : "") + text.replaceAll("\n", `\n${tab}`);
}
