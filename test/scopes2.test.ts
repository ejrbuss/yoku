import { assert } from "@std/assert/assert";
import { Scopes } from "../src/scopes2.ts";
import { assertEquals } from "@std/assert/equals";

Deno.test("Scopes basics", () => {
	const scopes = Scopes.create<number>();
	Scopes.declare(scopes, "x", 1);
	assertEquals(Scopes.find(scopes, "x"), 1);
	assert(Scopes.update(scopes, "x", 2));
	assertEquals(Scopes.find(scopes, "x"), 2);
	assert(!Scopes.update(scopes, "y", 3));
	assertEquals(Scopes.find(scopes, "y"), undefined);
});

Deno.test("Scopes shadow", () => {
	const scopes = Scopes.create<number>();
	Scopes.declare(scopes, "x", 1);
	Scopes.openScope(scopes);
	assertEquals(Scopes.find(scopes, "x"), 1);
	Scopes.declare(scopes, "x", 2);
	assertEquals(Scopes.find(scopes, "x"), 2);
	assert(Scopes.update(scopes, "x", 3));
	assertEquals(Scopes.find(scopes, "x"), 3);
	Scopes.dropScope(scopes);
	assertEquals(Scopes.find(scopes, "x"), 1);
	Scopes.openScope(scopes);
	assert(Scopes.update(scopes, "x", 4));
	assertEquals(Scopes.find(scopes, "x"), 4);
	Scopes.dropScope(scopes);
	assertEquals(Scopes.find(scopes, "x"), 4);
});

Deno.test("Scopes copy", () => {
	const scopes = Scopes.create<number>();
	Scopes.declare(scopes, "x", 1);
	const copy = Scopes.copy(scopes);
	assertEquals(Scopes.find(copy, "x"), 1);
	assert(Scopes.update(copy, "x", 2));
	assertEquals(Scopes.find(copy, "x"), 2);
	assertEquals(Scopes.find(scopes, "x"), 1);
});
