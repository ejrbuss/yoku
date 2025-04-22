import {
	Typed,
	Kind,
	ProcType,
	StructType,
	TupleType,
	Type,
	VariantType,
	ModuleType,
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

export type Enum = Record<string, unknown> & Typed;

export const Enum = { create: createEnum, is: isEnum };

function createEnum(type: VariantType, values: Record<string, unknown>): Enum {
	return { $type: type, ...values };
}

function isEnum(value: unknown): value is Enum {
	return Type.of(value).kind === Kind.Variant;
}

export type Module = Record<string, unknown> & Typed;

export const Module = { is: isModule, for: moduleFor };

const ModuleRegistry = new Map<ModuleType, Module>();

function isModule(value: unknown): value is Module {
	return Type.of(value).kind === Kind.Module;
}

function moduleFor(moduleType: ModuleType): Module {
	let module = ModuleRegistry.get(moduleType);
	if (module === undefined) {
		module = { $type: moduleType };
		ModuleRegistry.set(moduleType, module);
	}
	return module;
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
		return `type ${Type.print(v as Type)}`;
	}
	if (type.kind === Kind.Module) {
		return `module ${(v as Module).$name}`;
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
		for (const [i, field] of enumerate(type.fields)) {
			if (type.tuple) {
				fields.push(print(`${print(struct[i])}`));
			} else {
				fields.push(print(`${field.name} = ${print(struct[field.name])}`));
			}
		}
		if (fields.length === 0) {
			return `${type.name}`;
		} else if (type.tuple) {
			return `${type.name}(${fields.join(", ")})`;
		} else {
			return `${type.name} { ${fields.join(", ")} }`;
		}
	}
	if (type.kind === Kind.Variant) {
		const enum_ = v as Enum;
		const fields: string[] = [];
		for (const [i, field] of enumerate(type.fields)) {
			if (type.tuple) {
				fields.push(print(`${print(enum_[i])}`));
			} else {
				fields.push(print(`${field.name} = ${print(enum_[field.name])}`));
			}
		}
		if (type.constant) {
			return `${type.enum.name}.${type.name}`;
		} else if (type.tuple) {
			return `${type.enum.name}.${type.name}(${fields.join(", ")})`;
		} else {
			return `${type.enum.name}.${type.name} { ${fields.join(", ")} }`;
		}
	}
	return `!!! Unknown Value: ${v} !!!`;
}
