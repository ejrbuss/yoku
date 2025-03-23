import { CodeSource } from "./codesource.ts";
import { Span } from "./utils.ts";

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
	value?: unknown;
	note?: string;
} & Span;

export const Token = { print };

function print(token: Token): string {
	return `(${token.type} \`${token.image}\` ${token.start}:${token.end})`;
}

export const Keywords = new Set([
	"import",
	"export",
	"module",
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
	"test",
	"assert",
	"_",
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

export const Tokenizer = { tokenize, nextToken };

function tokenize(s: CodeSource): Token[] {
	const tokens: Token[] = [];
	let t = nextToken(s);
	while (t !== undefined) {
		tokens.push(t);
		t = nextToken(s);
	}
	return tokens;
}

function nextToken(s: CodeSource): Token | undefined {
	if (!CodeSource.hasMore(s)) {
		return undefined;
	}
	CodeSource.startScan(s);
	if (CodeSource.match(s, "---")) {
		while (CodeSource.hasMore(s) && !CodeSource.match(s, "---")) {
			CodeSource.consume(s);
		}
		// TODO Doc comments
		return nextToken(s);
	}
	if (CodeSource.match(s, "--")) {
		while (CodeSource.hasMore(s) && !CodeSource.match(s, "\n")) {
			CodeSource.consume(s);
		}
		return nextToken(s);
	}
	if (
		CodeSource.match(s, "->") ||
		CodeSource.match(s, "=>") ||
		CodeSource.match(s, "(") ||
		CodeSource.match(s, ")") ||
		CodeSource.match(s, "[") ||
		CodeSource.match(s, "]") ||
		CodeSource.match(s, "{") ||
		CodeSource.match(s, "}") ||
		CodeSource.match(s, ",") ||
		CodeSource.match(s, ";") ||
		CodeSource.match(s, "@") ||
		CodeSource.match(s, ":")
	) {
		return tokenHere(s, TokenType.Punc);
	}
	if (
		CodeSource.match(s, "...") ||
		CodeSource.match(s, ".") ||
		CodeSource.match(s, "===") ||
		CodeSource.match(s, "!==") ||
		CodeSource.match(s, "==") ||
		CodeSource.match(s, "!=") ||
		CodeSource.match(s, "=") ||
		CodeSource.match(s, "<=") ||
		CodeSource.match(s, ">=") ||
		CodeSource.match(s, "+=") ||
		CodeSource.match(s, "-=") ||
		CodeSource.match(s, "*=") ||
		CodeSource.match(s, "/=") ||
		CodeSource.match(s, "%=") ||
		CodeSource.match(s, "&=") ||
		CodeSource.match(s, "|=") ||
		CodeSource.match(s, "?=") ||
		CodeSource.match(s, "<") ||
		CodeSource.match(s, ">") ||
		CodeSource.match(s, "+") ||
		CodeSource.match(s, "-") ||
		CodeSource.match(s, "*") ||
		CodeSource.match(s, "/") ||
		CodeSource.match(s, "%") ||
		CodeSource.match(s, "^") ||
		CodeSource.match(s, "&") ||
		CodeSource.match(s, "|") ||
		CodeSource.match(s, "?") ||
		CodeSource.match(s, "!")
	) {
		return tokenHere(s, TokenType.Op);
	}
	if (CodeSource.match(s, "0b")) {
		return nextIntLiteral(s, Digits.bin, "0b");
	}
	if (CodeSource.match(s, "0o")) {
		return nextIntLiteral(s, Digits.oct, "0o");
	}
	if (CodeSource.match(s, "0x")) {
		return nextIntLiteral(s, Digits.hex, "0x");
	}
	const c = CodeSource.peek(s) ?? "\0";
	if (c === '"') {
		return nextStrLiteral(s);
	}
	if (isDigit(c)) {
		return nextNumberLiteral(s);
	}
	if (isAlpha(c)) {
		return nextIdentifier(s);
	}
	if (isWhitespace(c)) {
		CodeSource.consume(s);
		return nextToken(s);
	}
	CodeSource.consume(s);
	return errorHere(s, "Unexpected character!");
}

function nextIntLiteral(s: CodeSource, digits: string, prefix: string): Token {
	let image = prefix;
	let c = CodeSource.peek(s);
	while (c !== undefined) {
		if (isDigit(c, digits)) {
			image += c;
		} else if (c !== "_") {
			break;
		}
		c = CodeSource.consumeAndPeek(s);
	}
	if (image.length === 0) {
		return errorHere(s, "Integer prefix with no integer value!");
	}
	return tokenHere(s, TokenType.Lit, BigInt(image));
}

function nextStrLiteral(s: CodeSource): Token {
	CodeSource.consume(s);
	let validEscapes = true;
	let image = "";
	let c = CodeSource.consume(s);
	while (c !== undefined && c !== '"') {
		if (c === "\\") {
			const escaped = CodeSource.consume(s) as string;
			validEscapes &&= escaped in Escapes;
			image += Escapes[escaped];
		} else {
			image += c;
		}
		c = CodeSource.consume(s);
	}
	if (c !== '"') {
		return errorHere(s, "Unclosed Str literal!");
	}
	if (!validEscapes) {
		return errorHere(s, "Invalid escape sequence!");
	}
	return tokenHere(s, TokenType.Lit, image);
}

function nextNumberLiteral(s: CodeSource): Token {
	let image = "";
	let int = true;
	let c = CodeSource.peek(s);
	while (c !== undefined) {
		if (isDigit(c)) {
			image += c;
		} else if (c !== "_") {
			break;
		}
		c = CodeSource.consumeAndPeek(s);
	}
	if (c === ".") {
		int = false;
		image += CodeSource.consume(s);
		c = CodeSource.peek(s);
		while (c !== undefined) {
			if (isDigit(c)) {
				image += c;
			} else if (c !== "_") {
				break;
			}
			c = CodeSource.consumeAndPeek(s);
		}
	}
	if (CodeSource.match(s, "e")) {
		int = false;
		image += "e";
		if (CodeSource.match(s, "-")) {
			image += "-";
		}
		c = CodeSource.peek(s);
		while (c !== undefined) {
			if (isDigit(c)) {
				image += c;
			} else if (c !== "_") {
				break;
			}
			c = CodeSource.consumeAndPeek(s);
		}
	}
	return tokenHere(s, TokenType.Lit, int ? BigInt(image) : parseFloat(image));
}

function nextIdentifier(s: CodeSource): Token {
	let c = CodeSource.peek(s);
	while (c !== undefined) {
		if (!isAlpha(c) && !isDigit(c)) {
			break;
		}
		c = CodeSource.consumeAndPeek(s);
	}
	const image = CodeSource.getScan(s);
	if (image === "true" || image === "false") {
		return tokenHere(s, TokenType.Lit, image === "true");
	}
	if (Keywords.has(image)) {
		return tokenHere(s, TokenType.Keyword);
	}
	return tokenHere(s, TokenType.Id);
}

function tokenHere(s: CodeSource, type: TokenType, value?: unknown): Token {
	const image = CodeSource.getScan(s);
	const { start, end } = CodeSource.getSpan(s);
	return { type, image, value, start, end };
}

function errorHere(s: CodeSource, note: string): Token {
	const image = CodeSource.getScan(s);
	const { start, end } = CodeSource.getSpan(s);
	return { type: TokenType.Error, image, note, start, end };
}

function isDigit(c: string, digits: string = Digits.dec): boolean {
	return digits.indexOf(c) !== -1;
}

function isAlpha(c: string) {
	return ("a" <= c && c <= "z") || ("A" <= c && c <= "Z") || c === "_";
}

function isWhitespace(c: string) {
	return c === "\n" || c === "\r" || c === "\t" || c === " ";
}
