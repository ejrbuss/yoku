import { Span, RtValue } from "./core.ts";

export enum TokenType {
	Punc = "Punc",
	Op = "Op",
	Keyword = "Keyword",
	Id = "Id",
	Lit = "Lit",
	Doc = "Doc",
	Error = "Error",
}

export type Token = {
	type: TokenType;
	image: string;
	value?: RtValue;
	note?: string;
} & Span;

export const Token = { print };

function print(token: Token): string {
	return `(${token.type} \`${token.image}\` ${token.start}:${token.end})`;
}

const Keywords = new Set([
	"import",
	"export",
	"as",
	"var",
	"const",
	"proc",
	"struct",
	"enum",
	"type",
	"impl",
	"if",
	"else",
	"match",
	"do",
	"loop",
	"break",
	"continue",
	"while",
	"for",
	"in",
	"return",
	"try",
	"throw",
	"todo",
]);

const Escapes: Record<string, string | undefined> = {
	0: "\0",
	b: "\b",
	r: "\r",
	t: "\t",
	n: "\n",
	"'": "'",
	'"': '"',
	"\\": "\\",
};

const Digits = {
	dec: "0123456789",
	bin: "01",
	oct: "01234567",
	hex: "0123456789abcdefABCDEF",
};

type Tokenizer = {
	source: string;
	start: number;
	end: number;
};

export const Tokenizer = { tokenize };

function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	const t: Tokenizer = { source, start: 0, end: 0 };
	while (hasMore(t)) {
		const token = nextToken(t);
		if (token !== undefined) {
			tokens.push(token);
		}
	}
	return tokens;
}

function nextToken(t: Tokenizer): Token | undefined {
	t.start = t.end;
	if (match(t, "---")) {
		while (hasMore(t) && !match(t, "---")) {
			t.end++;
		}
		return tokenHere(t, TokenType.Doc);
	}
	if (match(t, "--")) {
		while (hasMore(t) && !match(t, "\n")) {
			t.end++;
		}
		return undefined;
	}
	if (
		match(t, "->") ||
		match(t, "=>") ||
		match(t, "(") ||
		match(t, ")") ||
		match(t, "[") ||
		match(t, "]") ||
		match(t, "{") ||
		match(t, "}") ||
		match(t, ",") ||
		match(t, ";") ||
		match(t, "@") ||
		match(t, ":")
	) {
		return tokenHere(t, TokenType.Punc);
	}
	if (
		match(t, "...") ||
		match(t, ".") ||
		match(t, "===") ||
		match(t, "!==") ||
		match(t, "==") ||
		match(t, "!=") ||
		match(t, "=") ||
		match(t, "<=") ||
		match(t, ">=") ||
		match(t, "+=") ||
		match(t, "-=") ||
		match(t, "*=") ||
		match(t, "/=") ||
		match(t, "%=") ||
		match(t, "&=") ||
		match(t, "|=") ||
		match(t, "?=") ||
		match(t, "<") ||
		match(t, ">") ||
		match(t, "+") ||
		match(t, "-") ||
		match(t, "*") ||
		match(t, "/") ||
		match(t, "%") ||
		match(t, "^") ||
		match(t, "&") ||
		match(t, "|") ||
		match(t, "?") ||
		match(t, "!")
	) {
		return tokenHere(t, TokenType.Op);
	}
	if (match(t, "0b")) {
		return nextIntLiteral(t, Digits.bin, 0b10);
	}
	if (match(t, "0o")) {
		return nextIntLiteral(t, Digits.oct, 0o10);
	}
	if (match(t, "0x")) {
		return nextIntLiteral(t, Digits.hex, 0x10);
	}
	const c = t.source[t.end];
	if (c === '"') {
		return nextStrLiteral(t);
	}
	if (isDigit(c)) {
		return nextNumberLiteral(t);
	}
	if (isAlpha(c)) {
		return nextIdentifier(t);
	}
	if (isWhitespace(c)) {
		t.end++;
		return undefined;
	}
	t.end++;
	return errorHere(t, "Unexpected character!");
}

function nextIntLiteral(t: Tokenizer, digits: string, radix: number): Token {
	let image = "";
	while (hasMore(t)) {
		const c = t.source[t.end];
		if (isDigit(c, digits)) {
			image += c;
		} else if (c !== "_") {
			break;
		}
		t.end++;
	}
	if (image.length === 0) {
		return errorHere(t, "Integer prefix with no integer value!");
	}
	return tokenHere(t, TokenType.Lit, RtValue.num(parseInt(image, radix)));
}

function nextStrLiteral(t: Tokenizer): Token {
	console.assert(t.source[t.end] === '"');
	t.end++;
	let validEscapes = true;
	let image = "";
	while (hasMore(t) && t.source[t.end] !== '"') {
		const c = t.source[t.end++];
		if (c === "\\") {
			const escaped = t.source[t.end++];
			validEscapes ||= escaped in Escapes;
			image += Escapes[escaped];
		} else {
			image += c;
		}
	}
	if (!match(t, '"') || !validEscapes) {
		return errorHere(t, "Unclosed Str literal!");
	}
	return tokenHere(t, TokenType.Lit, RtValue.str(image));
}

function nextNumberLiteral(t: Tokenizer): Token {
	let image = "";
	while (hasMore(t)) {
		const c = t.source[t.end];
		if (isDigit(c)) {
			image += c;
		} else if (c !== "_") {
			break;
		}
		t.end++;
	}
	if (t.source[t.end] === ".") {
		image += t.source[t.end++];
		while (hasMore(t)) {
			const c = t.source[t.end];
			if (isDigit(c)) {
				image += c;
			} else if (c !== "_") {
				break;
			}
			t.end++;
		}
	}
	if (t.source[t.end] === "e" || t.source[t.end] === "E") {
		image += t.source[t.end++];
		if (t.source[t.end] === "-") {
			image += t.source[t.end++];
		}
		while (hasMore(t)) {
			const c = t.source[t.end];
			if (isDigit(c)) {
				image += c;
			} else if (c !== "_") {
				break;
			}
			t.end++;
		}
	}
	return tokenHere(t, TokenType.Lit, RtValue.num(parseFloat(image)));
}

function nextIdentifier(t: Tokenizer): Token {
	while (hasMore(t)) {
		const c = t.source[t.end];
		if (!isAlpha(c) && !isDigit(c) && c !== "_") {
			break;
		}
		t.end++;
	}
	const image = t.source.substring(t.start, t.end);
	if (Keywords.has(image)) {
		return tokenHere(t, TokenType.Keyword);
	}
	return tokenHere(t, TokenType.Id);
}

function tokenHere(t: Tokenizer, type: TokenType, value?: RtValue): Token {
	return {
		type,
		image: t.source.substring(t.start, t.end),
		value,
		start: t.start,
		end: t.end,
	};
}

function errorHere(t: Tokenizer, note: string): Token {
	return {
		type: TokenType.Error,
		image: t.source.substring(t.start, t.end),
		note,
		start: t.start,
		end: t.end,
	};
}

function hasMore(t: Tokenizer): boolean {
	return t.end < t.source.length;
}

function match(t: Tokenizer, toMatch: string): boolean {
	if (t.source.startsWith(toMatch, t.end)) {
		t.end += toMatch.length;
		return true;
	}
	return false;
}

function isDigit(c: string, digits: string = Digits.dec): boolean {
	return digits.indexOf(c) !== -1;
}

function isAlpha(c: string) {
	return ("a" <= c && c <= "z") || ("A" <= c && c <= "Z");
}

function isWhitespace(c: string) {
	return c === "\n" || c === "\r" || c === "\t" || c === " ";
}
