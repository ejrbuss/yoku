import { assertEquals } from "jsr:@std/assert/equals";
import { CodeSource } from "../src/codesource.ts";

Deno.test("hasMore", () => {
	const s = CodeSource.fromString("123");
	assertEquals(CodeSource.hasMore(s), true);
	assertEquals(CodeSource.consume(s), "1");
	assertEquals(CodeSource.hasMore(s), true);
	assertEquals(CodeSource.consume(s), "2");
	assertEquals(CodeSource.hasMore(s), true);
	assertEquals(CodeSource.consume(s), "3");
	assertEquals(CodeSource.hasMore(s), false);
});

Deno.test("append", () => {
	const s = CodeSource.fromString("");
	assertEquals(CodeSource.hasMore(s), false);
	CodeSource.append(s, "12");
	assertEquals(CodeSource.hasMore(s), true);
	assertEquals(CodeSource.consume(s), "1");
	assertEquals(CodeSource.consume(s), "2");
	assertEquals(CodeSource.hasMore(s), false);
	CodeSource.append(s, "34");
	assertEquals(CodeSource.hasMore(s), true);
	assertEquals(CodeSource.consume(s), "3");
	assertEquals(CodeSource.consume(s), "4");
	assertEquals(CodeSource.hasMore(s), false);
	CodeSource.reset(s);
	assertEquals(CodeSource.match(s, "1234"), true);
});

Deno.test("reset", () => {
	const s = CodeSource.fromString("123");
	assertEquals(CodeSource.consume(s), "1");
	assertEquals(CodeSource.consume(s), "2");
	CodeSource.reset(s);
	assertEquals(CodeSource.consume(s), "1");
});

Deno.test("startScan, getScan, getSpan", () => {
	const s = CodeSource.fromString("12345");
	CodeSource.startScan(s);
	assertEquals(CodeSource.getScan(s), "");
	assertEquals(CodeSource.consume(s), "1");
	assertEquals(CodeSource.getScan(s), "1");
	assertEquals(CodeSource.consume(s), "2");
	assertEquals(CodeSource.getScan(s), "12");
	assertEquals(CodeSource.consume(s), "3");
	assertEquals(CodeSource.getScan(s), "123");
	assertEquals(CodeSource.getSpan(s), { start: 0, end: 3 });
	CodeSource.startScan(s);
	assertEquals(CodeSource.getScan(s), "");
	assertEquals(CodeSource.consume(s), "4");
	assertEquals(CodeSource.getScan(s), "4");
	assertEquals(CodeSource.consume(s), "5");
	assertEquals(CodeSource.getScan(s), "45");
	assertEquals(CodeSource.getSpan(s), { start: 3, end: 5 });
	CodeSource.startScan(s);
	assertEquals(CodeSource.getSpan(s), { start: 5, end: 5 });
});

Deno.test("peek", () => {
	const s = CodeSource.fromString("12");
	assertEquals(CodeSource.peek(s), "1");
	assertEquals(CodeSource.peek(s), "1");
	assertEquals(CodeSource.consume(s), "1");
	assertEquals(CodeSource.peek(s), "2");
	assertEquals(CodeSource.consume(s), "2");
	assertEquals(CodeSource.peek(s), undefined);
});

Deno.test("consume, consumeAndPeek", () => {
	const s = CodeSource.fromString("123");
	assertEquals(CodeSource.consume(s), "1");
	assertEquals(CodeSource.consumeAndPeek(s), "3");
	assertEquals(CodeSource.consume(s), "3");
	assertEquals(CodeSource.consume(s), undefined);
});

Deno.test("match", () => {
	const s = CodeSource.fromString("123");
	assertEquals(CodeSource.match(s, "2"), false);
	assertEquals(CodeSource.match(s, "1"), true);
	assertEquals(CodeSource.match(s, "123"), false);
	assertEquals(CodeSource.match(s, "23"), true);
	assertEquals(CodeSource.hasMore(s), false);
});

Deno.test("checkpoint, restore", () => {
	const s = CodeSource.fromString("1234");
	assertEquals(CodeSource.consume(s), "1");
	const c1 = CodeSource.checkpoint(s);
	assertEquals(CodeSource.consume(s), "2");
	assertEquals(CodeSource.consume(s), "3");
	const c2 = CodeSource.checkpoint(s);
	CodeSource.restore(s, c1);
	assertEquals(CodeSource.consume(s), "2");
	CodeSource.restore(s, c2);
	assertEquals(CodeSource.consume(s), "4");
});
