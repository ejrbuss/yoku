import { assertEquals } from "jsr:@std/assert/equals";
import { CodeSource } from "../src/codesource.ts";
import { Tokenizer, TokenType } from "../src/tokens.ts";

Deno.test("Comments", () => {
	assertTokens(
		`
		1
		-- This is a single line comment
		2
		---
		This is a multiline comment
		---
		3
		`,
		[TokenType.Lit, "1"],
		[TokenType.Lit, "2"],
		[TokenType.Lit, "3"]
	);
});

Deno.test("Punctuation", () => {
	assertTokens(
		`-> => () [] {} , ; @ :`,
		[TokenType.Punc, "->"],
		[TokenType.Punc, "=>"],
		[TokenType.Punc, "("],
		[TokenType.Punc, ")"],
		[TokenType.Punc, "["],
		[TokenType.Punc, "]"],
		[TokenType.Punc, "{"],
		[TokenType.Punc, "}"],
		[TokenType.Punc, ","],
		[TokenType.Punc, ";"],
		[TokenType.Punc, "@"],
		[TokenType.Punc, ":"]
	);
});

Deno.test("Operators", () => {
	assertTokens(
		`... . !== >= = &= + %`,
		[TokenType.Op, "..."],
		[TokenType.Op, "."],
		[TokenType.Op, "!=="],
		[TokenType.Op, ">="],
		[TokenType.Op, "="],
		[TokenType.Op, "&="],
		[TokenType.Op, "+"],
		[TokenType.Op, "%"]
	);
});

Deno.test("Integer Literals", () => {
	assertTokens(
		`0b10 0o01234567 0x0123456789abcdef 1_234_567_890`,
		[TokenType.Lit, "0b10"],
		[TokenType.Lit, "0o01234567"],
		[TokenType.Lit, "0x0123456789abcdef"],
		[TokenType.Lit, "1_234_567_890"]
	);
});

Deno.test("Float Literals", () => {
	assertTokens(
		`1.2 3e4 5.6e-78`,
		[TokenType.Lit, "1.2"],
		[TokenType.Lit, "3e4"],
		[TokenType.Lit, "5.6e-78"]
	);
});

Deno.test("Bool Literals", () => {
	assertTokens(`true false`, [TokenType.Lit, "true"], [TokenType.Lit, "false"]);
});

Deno.test("Keywords", () => {
	assertTokens(
		`if else match`,
		[TokenType.Keyword, "if"],
		[TokenType.Keyword, "else"],
		[TokenType.Keyword, "match"]
	);
});

Deno.test("Identifiers", () => {
	assertTokens(
		`x y test`,
		[TokenType.Id, "x"],
		[TokenType.Id, "y"],
		[TokenType.Id, "test"]
	);
});

Deno.test("Errors", () => {
	assertTokens(
		`$1~2`,
		[TokenType.Error, "$"],
		[TokenType.Lit, "1"],
		[TokenType.Error, "~"],
		[TokenType.Lit, "2"]
	);
});

Deno.test("Examples", () => {
	assertTokens(
		`var x = f(3 * 4, true); -- ignored`,
		[TokenType.Keyword, "var"],
		[TokenType.Id, "x"],
		[TokenType.Op, "="],
		[TokenType.Id, "f"],
		[TokenType.Punc, "("],
		[TokenType.Lit, "3"],
		[TokenType.Op, "*"],
		[TokenType.Lit, "4"],
		[TokenType.Punc, ","],
		[TokenType.Lit, "true"],
		[TokenType.Punc, ")"],
		[TokenType.Punc, ";"]
	);
});

function assertTokens(
	source: string,
	...expectedTokens: [TokenType, string][]
) {
	const actualTokens: [TokenType, string][] = [];
	const s = CodeSource.fromString(source, "test");
	let t = Tokenizer.nextToken(s);
	while (t !== undefined) {
		actualTokens.push([t.type, t.image]);
		t = Tokenizer.nextToken(s);
	}
	assertEquals(actualTokens, expectedTokens);
}
