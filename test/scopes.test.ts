import { assert } from "@std/assert/assert";
import { Decl, Scopes } from "../src/scopes.ts";
import { assertEquals } from "@std/assert/equals";

function decl(partial: Partial<Decl<unknown>>): Decl<unknown> {
	return {
		mutable: true,
		allowShadow: true,
		value: undefined,
		...partial,
	};
}

Deno.test("Scopes basics", () => {
	const scopes = new Scopes();

	const decl1 = decl({ value: 1 });
	const decl2 = decl({ mutable: false, allowShadow: false, value: 2 });

	// declare and get
	assert(scopes.declareGlobal("x", decl1));
	assertEquals(scopes.getDecl("x"), decl1);
	assertEquals(scopes.get("x"), 1);

	// mutate
	scopes.set("x", 3);
	assertEquals(scopes.get("x"), 3);

	// shadow in lower scope
	scopes.openScope();
	assert(scopes.declareLocal("x", decl2));
	assertEquals(scopes.getDecl("x"), decl2);
	assertEquals(scopes.get("x"), 2);
	scopes.dropScope();
	assertEquals(scopes.getDecl("x"), decl1);
	assertEquals(scopes.get("x"), 3);

	// shadow in same scope
	assert(scopes.declareLocal("x", decl2));
	assertEquals(scopes.getDecl("x"), decl2);
	assertEquals(scopes.get("x"), 2);
	assert(!scopes.declareLocal("x", decl1));
});

Deno.test("Scopes captures", () => {
	const original = new Scopes();
	assert(original.declareGlobal("global", decl({ value: 1 })));
	original.openScope();
	assert(original.declareLocal("captured", decl({ value: [] })));

	const capture = original.capture();
	capture.openScope();
	assert(capture.declareLocal("local", decl({ value: 2 })));
	original.openScope();
	assert(original.declareLocal("local", decl({ value: 4 })));

	// Global mutations should be visible to capture
	original.set("global", 5);
	assertEquals(capture.get("global"), 5);

	// Mutations to values themselves should be visible to capture
	(original.get("captured") as unknown[]).push(6);
	assertEquals(capture.get("captured"), [6]);

	// Captured mutations should not be visible to capture
	original.set("captured", 7);
	assertEquals(capture.get("captured"), [6]);

	// Mutations to locals should not be visible to capture
	assertEquals(capture.get("local"), 2);
	assertEquals(original.get("local"), 4);
	original.set("local", 7);
	assertEquals(capture.get("local"), 2);
	assertEquals(original.get("local"), 7);
	capture.set("local", 8);
	assertEquals(capture.get("local"), 8);
	assertEquals(original.get("local"), 7);
});
