import { assertEquals } from "jsr:@std/assert/equals";
import { enumerate, structurallyEq, zip } from "../src/utils.ts";
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

Deno.test("zip", () => {
	assertEquals(zip([1, 2, 3], ["a", "b", "c"]), [
		[1, "a"],
		[2, "b"],
		[3, "c"],
	]);
	assertEquals(zip([1, 2], ["a", "b", "c"]), [
		[1, "a"],
		[2, "b"],
	]);
	assertEquals(zip([1, 2, 3], ["a", "b"]), [
		[1, "a"],
		[2, "b"],
	]);
});

Deno.test("enumerate", () => {
	assertEquals(enumerate(["a", "b", "c"]), [
		[0, "a"],
		[1, "b"],
		[2, "c"],
	]);
});
