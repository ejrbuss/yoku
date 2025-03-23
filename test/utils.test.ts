import { assertEquals } from "jsr:@std/assert/equals";
import { ArrayIter, structurallyEq } from "../src/utils.ts";
import { assert } from "jsr:@std/assert/assert";

Deno.test("structurallyEq", () => {
	assert(structurallyEq(null, null));
	assert(structurallyEq(undefined, undefined));
	assert(structurallyEq(true, true));
	assert(structurallyEq(42, 42));
	assert(structurallyEq("test", "test"));
	assert(structurallyEq([1, 2, 3], [1, 2, 3]));
	assert(structurallyEq({ x: 1, y: {} }, { x: 1, y: {} }));

	assert(!structurallyEq(null, undefined));
	assert(!structurallyEq(true, false));
	assert(!structurallyEq(42, 42n));
	assert(!structurallyEq("test", "testing"));
	assert(!structurallyEq([1, 2, 3], [1, 2, 3, 4]));
	assert(!structurallyEq({ x: 1, y: {} }, { x: 1, y: {}, z: 3 }));
});

Deno.test("ArrayIter - hasNext, next", () => {
	const xs = [1, 2, 3, 4];
	const ys: number[] = [];
	const iter = new ArrayIter(xs);
	while (iter.hasNext) {
		ys.push(iter.next());
	}
	assertEquals(ys, xs);
});

Deno.test("ArrayIter - take", () => {
	const xs = [1, 2, 3, 4, 5, 6];
	const iter = new ArrayIter(xs);
	assertEquals(iter.next(), 1);
	assertEquals(iter.take(3), [2, 3, 4]);
	assertEquals(iter.next(), 5);
	assertEquals(iter.take(4), [6]);
});

Deno.test("ArrayIter - rest", () => {
	const xs = [1, 2, 3, 4];
	const iter = new ArrayIter(xs);
	assertEquals(iter.rest(), xs);
	iter.next();
	assertEquals(iter.rest(), [2, 3, 4]);
	iter.take(3);
	assertEquals(iter.rest(), []);
});

Deno.test("ArrayIter - skip", () => {
	const xs = [1, 2, 3, 4];
	const iter = new ArrayIter(xs);
	iter.skip(2);
	assertEquals(iter.rest(), [3, 4]);
	iter.skip(5);
	assertEquals(iter.rest(), []);
});
