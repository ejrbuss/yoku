import { zip } from "./utils.ts";
import { assert } from "@std/assert/assert";

export type Typed = { $type: Type };

export enum Kind {
	Wildcard = "Wildcard",
	Primitive = "Primitive",
	Proc = "Proc",
	Tuple = "Tuple",
	Struct = "Struct",
	Enum = "Enum",
	Variant = "Variant",
}

export type Type =
	| PrimitiveType
	| ProcType
	| TupleType
	| StructType
	| EnumType
	| VariantType;

export type UnresolvedType =
	| Type
	| WildcardType
	| UnresolvedProcType
	| UnresolvedTupleType;

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

export type UnresolvedProcType = {
	kind: Kind.Proc;
	params: UnresolvedType[];
	returns: UnresolvedType;
} & Typed;

export type TupleType = {
	kind: Kind.Tuple;
	items: Type[];
} & Typed;

export type UnresolvedTupleType = {
	kind: Kind.Tuple;
	items: UnresolvedType[];
} & Typed;

export type StructField = {
	mutable: boolean;
	name: string;
	type: Type;
};

export type StructType = {
	kind: Kind.Struct;
	name: string;
	tuple: boolean;
	fields: StructField[];
} & Typed;

export type EnumType = {
	kind: Kind.Enum;
	name: string;
	variants: VariantType[];
	constants: unknown[];
} & Typed;

export type VariantType = {
	kind: Kind.Variant;
	name: string;
	constant: boolean;
	tuple: boolean;
	enum: EnumType;
	fields: StructField[];
};

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
	enum: _enum,
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
	findField,
	findVariant,
	of,
	print,
	assignable,
	assertable,
};

function primitive(name: string): PrimitiveType {
	return { $type: Meta, kind: Kind.Primitive, name };
}

function proc<P extends Type | UnresolvedType, R extends Type | UnresolvedType>(
	params: P[],
	returns: R
): P extends Type
	? R extends Type
		? ProcType
		: UnresolvedProcType
	: UnresolvedProcType {
	return { $type: Meta, kind: Kind.Proc, params, returns } as ProcType;
}

function tuple<T extends Type | UnresolvedType>(
	items: T[]
): T extends Type ? TupleType : UnresolvedTupleType {
	return { $type: Meta, kind: Kind.Tuple, items } as TupleType;
}

function struct(
	name: string,
	tuple: boolean,
	fields: StructField[]
): StructType {
	return { $type: Meta, kind: Kind.Struct, name, tuple, fields };
}

function _enum(
	name: string,
	variants: Omit<VariantType, "kind" | "enum">[]
): EnumType {
	const enum_: EnumType = {
		$type: Meta,
		kind: Kind.Enum,
		name,
		variants: [],
		constants: [],
	};
	for (const variant of variants) {
		enum_.variants.push({
			kind: Kind.Variant,
			enum: enum_,
			...variant,
		});
	}
	return enum_;
}

function findField(
	type: StructType | VariantType,
	name: string | bigint
): StructField | undefined {
	if (typeof name === "bigint") {
		return type.fields[Number(name)];
	}
	for (const field of type.fields) {
		if (field.name === name) {
			return field;
		}
	}
	return undefined;
}

function findVariant(type: EnumType, name: string): VariantType | undefined {
	for (const variant of type.variants) {
		if (variant.name === name) {
			return variant;
		}
	}
	return undefined;
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
	console.log({
		v,
		"typeof v": typeof v,
		array: Array.isArray(v),
	});
	throw new Error(`Cannot find type! ${v}`);
}

function print(t: UnresolvedType): string {
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
		case Kind.Enum: {
			return t.name;
		}
		case Kind.Variant:
			return `${t.enum.name}.${t.name}`;
	}
}

function assignable(
	from: UnresolvedType,
	into: UnresolvedType
): Type | undefined {
	if (into === Type.Any || from === Type.Never) {
		return reconcile(into, into);
	}
	return reconcile(from, into);
}

function assertable(
	from: UnresolvedType,
	into: UnresolvedType
): Type | undefined {
	if (from === Type.Any) {
		return reconcile(into, into);
	}
	return assignable(from, into);
}

function reconcile(
	from: UnresolvedType,
	into: UnresolvedType
): Type | undefined {
	const fromStack: UnresolvedType[] = [];
	const intoStack: UnresolvedType[] = [];
	const resultStack: Type[] = [];

	function recurse(
		from: UnresolvedType,
		into: UnresolvedType
	): Type | undefined {
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
		if (from.kind === Kind.Wildcard && into.kind === Kind.Wildcard) {
			return undefined;
		}
		// Otherwise resolve the wildcards by passing the other type
		// next to itself
		if (from.kind === Kind.Wildcard) {
			return reconcile(into, into);
		}
		if (into.kind === Kind.Wildcard) {
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
		if (from.kind === Kind.Proc) {
			assert(into.kind === Kind.Proc);
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
		if (from.kind === Kind.Tuple) {
			assert(into.kind === Kind.Tuple);
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
		// All other types are nominal and so must be identical
		if (from !== into) {
			return undefined;
		}
		return into;
	}
	return recurse(from, into);
}
