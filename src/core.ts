import {
	Typed,
	Kind,
	ProcType,
	StructType,
	TupleType,
	Type,
	TupleStructType,
} from "./types.ts";
import { Unreachable } from "./utils.ts";

export const Unit = null;

export type Proc = {
	name?: string;
	impl: (args: unknown[]) => unknown;
} & Typed;

export const Proc = { create: createProc };

function createProc(
	name: string | undefined,
	type: ProcType,
	impl: (args: unknown[]) => unknown
): Proc {
	return { $type: type, name, impl };
}

export type Tuple = { items: unknown[] } & Typed;

export const Tuple = { create: createTuple };

function createTuple(type: TupleType, items: unknown[]): Tuple {
	return { $type: type, items };
}

export type Struct = Record<string, unknown> & Typed;

export const Struct = { create: createStruct };

function createStruct(
	type: StructType,
	values: Record<string, unknown>
): Struct {
	return { $type: type, ...values };
}

export type TupleStruct = { items: unknown[] } & Typed;

export const TupleStruct = { create: createTupleStruct };

function createTupleStruct(
	type: TupleStructType,
	items: unknown[]
): TupleStruct {
	return { $type: type, items };
}

export type Module = { name: string; type?: Type } & Typed;

export const Module = { create: createModule };

function createModule(name: string, type?: Type) {
	return { $type: Type.Module, name, type };
}

export function print(v: unknown): string {
	const type = Type.of(v);
	if (type === Type.Unit) {
		return "()";
	}
	if (type === Type.Bool) {
		return (v as boolean).toString();
	}
	if (type === Type.Int) {
		return (v as bigint).toString();
	}
	if (type === Type.Float) {
		return (v as number).toString();
	}
	if (type === Type.Str) {
		return v as string;
	}
	if (type === Type.Type) {
		return `Type[${Type.print(v as Type)}]`;
	}
	if (type === Type.Module) {
		const module = v as Module;
		const name = module.type ? Type.print(module.type) : module.name;
		return `Module[${name}]`;
	}
	if (type.kind === Kind.Proc) {
		const proc = v as Proc;
		const type = Type.print(proc.$type);
		const name = proc.name;
		if (name !== undefined) {
			return type.replace("proc ", `proc ${name}`);
		} else {
			return type;
		}
	}
	if (type.kind === Kind.Tuple) {
		const tuple = v as Tuple;
		const items: string[] = [];
		for (const item of tuple.items) {
			items.push(print(item));
		}
		return `(${items.join(", ")}${items.length === 1 ? "," : ""})`;
	}
	if (type.kind === Kind.Struct) {
		const struct = v as Struct;
		const fields: string[] = [];
		for (const field of type.fields) {
			fields.push(print(`${field.name} = ${print(struct[field.name])}`));
		}
		return `${type.name} { ${fields.join(", ")} }`;
	}
	if (type.kind === Kind.TupleStruct) {
		const tupleStruct = v as TupleStruct;
		const items: string[] = [];
		for (const item of tupleStruct.items) {
			items.push(print(item));
		}
		return `${type.name}(${items.join(", ")})`;
	}
	throw new Unreachable();
}
