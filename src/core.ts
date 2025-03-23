import { Span, Unreachable, sexpr } from "./utils.ts";

type YokuObject = {
	$type: Type;
};

export enum Kind {
	Primitive = "Primitive",
	Spread = "Spread",
	Proc = "Proc",
	Tuple = "Tuple",
}

export type PrimitiveType = {
	kind: Kind.Primitive;
	name: string;
} & YokuObject;

export type SpreadType = {
	kind: Kind.Spread;
	spreading: Type;
} & YokuObject;

export type ProcType = {
	kind: Kind.Proc;
	params: Type[];
	returns: Type;
} & YokuObject;

export type TupleType = {
	kind: Kind.Tuple;
	items: Type[];
} & YokuObject;

export type Type = PrimitiveType | SpreadType | ProcType | TupleType;

const TypeType: Type = {
	$type: undefined as unknown as Type,
	kind: Kind.Primitive,
	name: "Type",
};
TypeType.$type = TypeType;

export const Type = {
	primitive: primitiveType,
	spread: spreadType,
	proc: procType,
	tuple: tupleType,
	Type: TypeType,
	Unit: tupleType([]),
	Bool: primitiveType("Bool"),
	Int: primitiveType("Int"),
	Float: primitiveType("Float"),
	Str: primitiveType("Str"),
	Any: primitiveType("Any"),
	Never: primitiveType("Never"),
	print: printType,
	of: typeOf,
};

function primitiveType(name: string): PrimitiveType {
	return { $type: TypeType, kind: Kind.Primitive, name };
}

function spreadType(spreading: Type): SpreadType {
	return { $type: TypeType, kind: Kind.Spread, spreading };
}

function procType(params: Type[], returns: Type): ProcType {
	return { $type: TypeType, kind: Kind.Proc, params, returns };
}

function tupleType(items: Type[]): TupleType {
	return { $type: TypeType, kind: Kind.Tuple, items };
}

function printType(t: Type): string {
	switch (t.kind) {
		case Kind.Primitive:
			return t.name;
		case Kind.Spread:
			return `...${printType(t.spreading)}`;
		case Kind.Proc:
			return `proc (${t.params.map(printType).join(", ")}) -> ${printType(
				t.returns
			)}`;
		case Kind.Tuple:
			return t.items.length === 1
				? `(${printType(t.items[0])},)`
				: `(${t.items.map(printType).join(", ")})`;
	}
}

function typeOf(v: unknown): Type {
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
	const type = (v as YokuObject).$type;
	if (type !== undefined) {
		return type;
	}
	throw new Error(`Cannot find type! ${v}`);
}

export type Proc = {
	name?: string;
	impl: (args: unknown[]) => unknown;
} & YokuObject;

export const Proc = { create: createProc };

function createProc(
	name: string | undefined,
	type: ProcType,
	impl: (args: unknown[]) => unknown
): Proc {
	return { $type: type, name, impl };
}

export type Tuple = {
	items: unknown[];
} & YokuObject;

export const Tuple = { create: createTuple };

function createTuple(type: TupleType, items: unknown[]): Tuple {
	return { $type: type, items };
}

export function print(v: unknown): string {
	const type = typeOf(v);
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
		return `Type[${printType(v as Type)}]`;
	}
	if (type.kind === Kind.Proc) {
		const type = Type.print((v as Proc).$type);
		const name = (v as Proc).name;
		if (name !== undefined) {
			return type.replace("proc ", `proc ${name}`);
		}
		return type;
	}
	if (type.kind === Kind.Tuple) {
		return (v as Tuple).items.length === 1
			? `(${print((v as Tuple).items[0])},)`
			: `(${(v as Tuple).items.map(print).join(", ")})`;
	}
	throw new Unreachable();
}

export enum BinaryOp {
	Add = "+",
	Sub = "-",
	Mul = "*",
	Div = "/",
	Rem = "%",
	Pow = "^",
	And = "&",
	Or = "|",
	Lt = "<",
	Lte = "<=",
	Gt = ">",
	Gte = ">=",
	Eq = "==",
	NotEq = "!=",
	Id = "===",
	NotId = "!==",
	Default = "?",
	Member = ".",
	As = "as",
}

export enum UnaryOp {
	Not = "!",
	Neg = "-",
}

export enum Access {
	Var = "Var",
	Const = "Const",
}

export enum AstType {
	Module = "Module",
	Repl = "Repl",
	VarDecl = "VarDecl",
	ProcDecl = "ProcDecl",
	TypeDecl = "TypeDecl",
	TestDecl = "TestDecl",
	BreakStmt = "BreakStmt",
	ContinueStmt = "ContinueStmt",
	ReturnStmt = "ReturnStmt",
	AssertStmt = "AssertStmt",
	LoopStmt = "LoopStmt",
	WhileStmt = "WhileStmt",
	AssignStmt = "AssignStmt",
	ExprStmt = "ExprStmt",
	BlockExpr = "BlockExpr",
	TupleExpr = "TupleExpr",
	GroupExpr = "GroupExpr",
	IfExpr = "IfExpr",
	ProcExpr = "ProcExpr",
	BinaryExpr = "BinaryExpr",
	UnaryExpr = "UnaryExpr",
	CallExpr = "CallExpr",
	LitExpr = "LitExpr",
	IdExpr = "IdExpr",
	SpreadExpr = "SpreadExpr",
	ProcTypeExpr = "ProcTypeExpr",
	WildCardExpr = "WildCardExpr",
}

export type Module = {
	type: AstType.Module;
	id: string;
	decls: Ast[];
} & Span;

export type Repl = {
	type: AstType.Repl;
	lines: Ast[];
} & Span;

export type VarDecl = {
	type: AstType.VarDecl;
	access: Access;
	assert: boolean;
	declType?: Ast;
	pattern: Ast;
	initExpr: Ast;
	resolvedType?: Type;
} & Span;

export type ProcDecl = {
	type: AstType.ProcDecl;
	id: IdExpr;
	initExpr: ProcExpr;
} & Span;

export type TypeDecl = {
	type: AstType.TypeDecl;
	id: IdExpr;
	typeExpr: Ast;
} & Span;

export type TestDecl = {
	type: AstType.TestDecl;
	name: string;
	thenExpr: Ast;
} & Span;

export type BreakStmt = {
	type: AstType.BreakStmt;
	label?: IdExpr;
} & Span;

export type ContinueStmt = {
	type: AstType.ContinueStmt;
	label?: IdExpr;
} & Span;

export type ReturnStmt = {
	type: AstType.ReturnStmt;
	expr?: Ast;
} & Span;

export type AssertStmt = {
	type: AstType.AssertStmt;
	testExpr: Ast;
} & Span;

export type LoopStmt = {
	type: AstType.LoopStmt;
	label?: IdExpr;
	thenExpr: BlockExpr;
} & Span;

export type WhileStmt = {
	type: AstType.WhileStmt;
	testExpr: Ast;
	thenExpr: BlockExpr;
} & Span;

export type AssignStmt = {
	type: AstType.AssignStmt;
	id: IdExpr;
	expr: Ast;
} & Span;

export type ExprStmt = {
	type: AstType.ExprStmt;
	expr: Ast;
} & Span;

export type BlockExpr = {
	type: AstType.BlockExpr;
	stmts: Ast[];
} & Span;

export type TupleExpr = {
	type: AstType.TupleExpr;
	items: Ast[];
	resolvedType?: TupleType;
} & Span;

export type GroupExpr = {
	type: AstType.GroupExpr;
	expr: Ast;
} & Span;

export type IfExpr = {
	type: AstType.IfExpr;
	testExpr: Ast;
	thenExpr: Ast;
	elseExpr?: Ast;
} & Span;

export type ProcParam = {
	pattern: Ast;
	type: Ast;
};

export type ProcExpr = {
	type: AstType.ProcExpr;
	params: ProcParam[];
	returnType: Ast;
	implExpr: BlockExpr;
	resolvedType?: ProcType;
} & Span;

export type BinaryExpr = {
	type: AstType.BinaryExpr;
	op: BinaryOp;
	left: Ast;
	right: Ast;
} & Span;

export type UnaryExpr = {
	type: AstType.UnaryExpr;
	op: UnaryOp;
	right: Ast;
} & Span;

export type CallExpr = {
	type: AstType.CallExpr;
	proc: Ast;
	args: Ast[];
} & Span;

export type LitExpr = {
	type: AstType.LitExpr;
	value: unknown;
} & Span;

export type IdExpr = {
	type: AstType.IdExpr;
	value: string;
	resolvedId?: number;
} & Span;

export type SpreadExpr = {
	type: AstType.SpreadExpr;
	spreading: Ast;
	resolvedType?: Type;
} & Span;

export type ProcTypeExpr = {
	type: AstType.ProcTypeExpr;
	params: Ast[];
	returnType: Ast;
} & Span;

export type WildCardExpr = {
	type: AstType.WildCardExpr;
} & Span;

export type Ast =
	| Module
	| Repl
	| VarDecl
	| ProcDecl
	| TypeDecl
	| TestDecl
	| BreakStmt
	| ContinueStmt
	| ReturnStmt
	| AssertStmt
	| AssignStmt
	| LoopStmt
	| WhileStmt
	| ExprStmt
	| BlockExpr
	| TupleExpr
	| GroupExpr
	| IfExpr
	| ProcExpr
	| BinaryExpr
	| UnaryExpr
	| CallExpr
	| LitExpr
	| IdExpr
	| SpreadExpr
	| ProcTypeExpr
	| WildCardExpr;

export const Ast = { print: printAst };

function printAst(ast: Ast): string {
	return sexpr(ast, ["start", "end"]);
}
