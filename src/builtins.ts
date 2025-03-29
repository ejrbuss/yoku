import { print, Proc, Unit } from "./core.ts";
import { Type } from "./types.ts";

export const Builtins = {
	print: Proc.create("print", Type.proc([Type.Any], Type.Unit), (args) => {
		console.log(print(args[0]));
		return Unit;
	}),
	clock: Proc.create("clock", Type.proc([], Type.Int), () => {
		return BigInt(Date.now());
	}),
	cat: Proc.create("cat", Type.proc([Type.Any, Type.Any], Type.Str), (args) => {
		return args.map(print).join("");
	}),
	print_type: Proc.create(
		"type_of",
		Type.proc([Type.Any], Type.Str),
		(args) => {
			return Type.print(Type.of(args[0]));
		}
	),
};

export const BuiltinTypes = {
	Type: Type.Type,
	Any: Type.Any,
	Never: Type.Never,
	Bool: Type.Bool,
	Int: Type.Int,
	Float: Type.Float,
	Str: Type.Str,
	Module: Type.Module,
};
