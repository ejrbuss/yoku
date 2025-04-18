import {
	Typed,
	Kind,
	ProcType,
	StructType,
	TupleType,
	Type,
	EnumType,
} from "./types.ts";
import { enumerate } from "./utils.ts";

export const Unit = null;

export type Proc = {
	name?: string;
	impl: (args: unknown[]) => unknown;
} & Typed;

export const Proc = { create: createProc, is: isProc };

function createProc(
	name: string | undefined,
	type: ProcType,
	impl: (args: unknown[]) => unknown
): Proc {
	return { $type: type, name, impl };
}

function isProc(value: unknown): value is Proc {
	return Type.of(value).kind === Kind.Proc;
}

export type Tuple = { items: unknown[] } & Typed;

export const Tuple = { create: createTuple, is: isTuple };

function createTuple(type: TupleType, items: unknown[]): Tuple {
	return { $type: type, items };
}

function isTuple(value: unknown): value is Tuple {
	return Type.of(value).kind === Kind.Tuple;
}

export type Struct = Record<string, unknown> & Typed;

export const Struct = { create: createStruct, is: isStruct };

function createStruct(
	type: StructType,
	values: Record<string, unknown>
): Struct {
	return { $type: type, ...values };
}

function isStruct(value: unknown): value is Struct {
	return Type.of(value).kind === Kind.Struct;
}

export type Enum = Record<string, unknown> &
	Typed & {
		$variant: number;
	};

export const Enum = { create: createEnum, is: isEnum };

function createEnum(
	type: EnumType,
	variant: number,
	values: Record<string, unknown>
): Enum {
	return { $type: type, $variant: variant, ...values };
}

function isEnum(value: unknown): value is Enum {
	return Type.of(value).kind === Kind.Enum;
}

export type Module = { name: string; type?: Type } & Typed;

export const Module = { create: createModule, is: isModule };

function createModule(name: string, type?: Type) {
	return { $type: Type.Module, name, type };
}

function isModule(value: unknown): value is Module {
	return Type.of(value) === Type.Module;
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
		let tupleStruct = false;
		for (const [i, field] of enumerate(type.fields)) {
			if (field.name === undefined) {
				tupleStruct = true;
				fields.push(print(`${print(struct[i])}`));
			} else {
				fields.push(print(`${field.name} = ${print(struct[field.name])}`));
			}
		}
		if (fields.length === 0) {
			return `${type.name}`;
		} else if (tupleStruct) {
			return `${type.name}(${fields.join(", ")})`;
		} else {
			return `${type.name} { ${fields.join(", ")} }`;
		}
	}
	if (type.kind === Kind.Enum) {
		const enum_ = v as Enum;
		const fields: string[] = [];
		const variant = type.variants[enum_.$variant];
		let tupleStruct = false;
		for (const [i, field] of enumerate(variant.fields)) {
			if (field.name === undefined) {
				tupleStruct = true;
				fields.push(print(`${print([enum_[i]])}`));
			} else {
				fields.push(print(`${field.name} = ${print(enum_[field.name])}`));
			}
		}
		if (fields.length === 0) {
			return `${type.name}.${variant.name}`;
		} else if (tupleStruct) {
			return `${type.name}.${variant.name}(${fields.join(", ")})`;
		} else {
			return `${type.name}.${variant.name} { ${fields.join(", ")} }`;
		}
	}
	return `!!! Unknown Value: ${v} !!!`;
}
