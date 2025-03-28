import { Unreachable, zip } from "./utils.ts";

export type Typed = { $type: Type };

export enum Kind {
	Wildcard = "Wildcard",
	Primitive = "Primitive",
	Proc = "Proc",
	Tuple = "Tuple",
	Struct = "Struct",
	TupleStruct = "TupleStruct",
	Module = "Module",
}

export type Type =
	| PrimitiveType
	| ProcType
	| TupleType
	| StructType
	| TupleStructType;

export type TypePattern =
	| Type
	| WildcardType
	| ProcTypePattern
	| TupleTypePattern;

export type WildcardType = {
	kind: Kind.Wildcard;
} & Typed;

export type PrimitiveType = {
	kind: Kind.Primitive;
	name: string;
} & Typed;

export type ProcType = {
	kind: Kind.Proc;
	params: Type[];
	returns: Type;
} & Typed;

export type ProcTypePattern = {
	kind: Kind.Proc;
	params: TypePattern[];
	returns: TypePattern;
} & Typed;

export type TupleType = {
	kind: Kind.Tuple;
	items: Type[];
} & Typed;

export type TupleTypePattern = {
	kind: Kind.Tuple;
	items: TypePattern[];
} & Typed;

export type StructField = {
	mutable: boolean;
	name: string;
	type: Type;
	// This is a really gross hack
	defaultExpr?: unknown;
};

export type StructType = {
	kind: Kind.Struct;
	name: string;
	fields: StructField[];
} & Typed;

export type TupleStructType = {
	kind: Kind.TupleStruct;
	name: string;
	items: Type[];
} & Typed;

const Meta = {
	kind: Kind.Primitive,
	name: "Type",
} as PrimitiveType;
Meta.$type = Meta;

const Wildcard: WildcardType = {
	$type: Meta,
	kind: Kind.Wildcard,
};

export const Type = {
	primitive,
	proc,
	tuple,
	struct,
	tupleStruct,
	Type: Meta, // TODO Type[T]
	_: Wildcard,
	Any: primitive("Any"),
	Never: primitive("Never"),
	Unit: tuple([] as Type[]),
	Bool: primitive("Bool"),
	Int: primitive("Int"),
	Float: primitive("Float"),
	Str: primitive("Str"),
	Module: primitive("Module"), // TODO Module[T]
	of,
	print,
	assignable,
	assertable,
};

function primitive(name: string): PrimitiveType {
	return { $type: Meta, kind: Kind.Primitive, name };
}

function proc<P extends Type | TypePattern, R extends Type | TypePattern>(
	params: P[],
	returns: R
): P extends Type
	? R extends Type
		? ProcType
		: ProcTypePattern
	: ProcTypePattern {
	return { $type: Meta, kind: Kind.Proc, params, returns } as ProcType;
}

function tuple<T extends Type | TypePattern>(
	items: T[]
): T extends Type ? TupleType : TupleTypePattern {
	return { $type: Meta, kind: Kind.Tuple, items } as TupleType;
}

function struct(name: string, fields: StructField[]): StructType {
	return { $type: Meta, kind: Kind.Struct, name, fields };
}

function tupleStruct(name: string, items: Type[]): TupleStructType {
	return { $type: Meta, kind: Kind.TupleStruct, name, items };
}

function of(v: unknown): Type {
	switch (typeof v) {
		case "boolean":
			return Type.Bool;
		case "bigint":
			return Type.Int;
		case "number":
			return Type.Float;
		case "string":
			return Type.Str;
	}
	if (v === null) {
		return Type.Unit;
	}
	if (typeof v !== "object") {
		throw new Error(`Cannot find type! ${v}`);
	}
	const type = (v as Typed).$type;
	if (type !== undefined) {
		return type;
	}
	throw new Error(`Cannot find type! ${v}`);
}

function print(t: TypePattern): string {
	switch (t.kind) {
		case Kind.Wildcard: {
			return "_";
		}
		case Kind.Primitive: {
			return t.name;
		}
		case Kind.Proc: {
			const params: string[] = [];
			for (const param of t.params) {
				params.push(print(param));
			}
			const returns = print(t.returns);
			return `proc (${params.join(", ")}) -> ${returns}`;
		}
		case Kind.Tuple: {
			const items: string[] = [];
			for (const item of t.items) {
				items.push(print(item));
			}
			return `(${items.join(", ")})`;
		}
		case Kind.Struct: {
			return t.name;
		}
		case Kind.TupleStruct: {
			const items: string[] = [];
			for (const item of t.items) {
				items.push(print(item));
			}
			return `${t.name}(${items.join(", ")})`;
		}
	}
}

function assignable(from: TypePattern, into: TypePattern): Type | undefined {
	if (into === Type.Any || from === Type.Never) {
		return reconcile(into, into);
	}
	return reconcile(from, into);
}

function assertable(from: TypePattern, into: TypePattern): Type | undefined {
	if (from === Type.Any) {
		return reconcile(into, into);
	}
	return assignable(from, into);
}

function reconcile(from: TypePattern, into: TypePattern): Type | undefined {
	const fromStack: TypePattern[] = [];
	const intoStack: TypePattern[] = [];
	const resultStack: Type[] = [];

	function recurse(from: TypePattern, into: TypePattern): Type | undefined {
		// Recursive base case, we've been here, return our previously pushed
		// result
		const i = fromStack.indexOf(from);
		if (i !== -1) {
			if (intoStack[i] === into) {
				return resultStack[i];
			}
			return undefined;
		}
		// If both types are wildcards the type is ambiguous and cannot
		// reconciled
		if (from === Type._ && into === Type._) {
			return undefined;
		}
		// Otherwise resolve the wildcards by passing the other type
		// next to itself
		if (from === Type._) {
			return reconcile(into, into);
		}
		if (into === Type._) {
			return reconcile(from, from);
		}
		// Kinds must match
		if (from.kind !== into.kind) {
			return undefined;
		}
		// Primitives must be identical
		if (from.kind === Kind.Primitive && into.kind === Kind.Primitive) {
			if (into !== from) {
				return undefined;
			}
			return into;
		}
		// Procs are reconcilable if their params and return types are
		if (from.kind === Kind.Proc && into.kind === Kind.Proc) {
			if (from.params.length !== into.params.length) {
				return undefined;
			}
			const result = proc([] as Type[], Type.Never);
			fromStack.push(from);
			intoStack.push(into);
			resultStack.push(result);

			for (const [f, t] of zip(from.params, into.params)) {
				const param = recurse(f, t);
				if (param === undefined) {
					return undefined;
				}
				result.params.push(param);
			}
			const returns = recurse(from.returns, into.returns);
			if (returns === undefined) {
				return undefined;
			}
			result.returns = returns;
			return result;
		}
		// Tuples are reconcilable if their items are reconcilable
		if (from.kind === Kind.Tuple && into.kind === Kind.Tuple) {
			if (from.items.length !== into.items.length) {
				return undefined;
			}
			const result = tuple([] as Type[]);
			fromStack.push(from);
			intoStack.push(into);
			resultStack.push(result);

			for (const [f, t] of zip(from.items, into.items)) {
				const item = recurse(f, t);
				if (item === undefined) {
					return undefined;
				}
				result.items.push(item);
			}
			return result;
		}
		// Structs are nominal, and so must be identical
		if (from.kind === Kind.Struct && into.kind === Kind.Struct) {
			if (from !== into) {
				return undefined;
			}
			return into;
		}
		if (from.kind === Kind.TupleStruct && into.kind === Kind.TupleStruct) {
			if (from !== into) {
				return undefined;
			}
			return into;
		}
		throw new Unreachable();
	}
	return recurse(from, into);
}
