import { Span, Unreachable, sexpr } from "./utils.ts";

export enum Kind {
	Primitive = "Primitive",
	Proc = "Proc",
}

export type PrimitiveType = {
	$type: Type;
	kind: Kind.Primitive;
	name: string;
};

export type ProcType = {
	$type: Type;
	kind: Kind.Proc;
	params: Type[];
	returns: Type;
};

export type Type = PrimitiveType | ProcType;

const TypeType: Type = {
	$type: undefined as unknown as Type,
	kind: Kind.Primitive,
	name: "Type",
};
TypeType.$type = TypeType;

export const Type = {
	primitive: primitiveType,
	proc: procType,
	Type: TypeType,
	Unit: primitiveType("Unit"),
	Bool: primitiveType("Bool"),
	Int: primitiveType("Int"),
	Float: primitiveType("Float"),
	Str: primitiveType("Str"),
	Any: primitiveType("Any"),
	print: printType,
	of: typeOf,
};

function primitiveType(name: string): PrimitiveType {
	return { $type: TypeType, kind: Kind.Primitive, name };
}

function procType(params: Type[], returns: Type): ProcType {
	return { $type: TypeType, kind: Kind.Proc, params, returns };
}

function printType(t: Type): string {
	switch (t.kind) {
		case Kind.Primitive:
			return t.name;
		case Kind.Proc:
			return `proc (${t.params.map(printType).join(", ")}) -> ${printType(
				t.returns
			)}`;
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
	const type = (v as Record<string, Type | undefined>).$type;
	if (type !== undefined) {
		return type;
	}
	throw new Error(`Cannot find type! ${v}`);
}

export type Proc = {
	$type: ProcType;
	name?: string;
	impl: (args: unknown[]) => unknown;
};

export const Proc = { create: createProc };

function createProc(
	name: string | undefined,
	params: Type[],
	returns: Type,
	impl: (args: unknown[]) => unknown
): Proc {
	return { $type: Type.proc(params, returns), name, impl };
}

export function print(v: unknown): string {
	const type = typeOf(v);
	if (type === Type.Unit) {
		return "()";
	}
	if (type === Type.Bool) {
		return (v as boolean) ? "True" : "False";
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
		return `proc ${(v as Proc).name ?? ""}`;
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
}

export enum UnaryOp {
	Not = "!",
	Neg = "-",
	Spread = "...",
}

export enum Access {
	Var = "Var",
	Const = "Const",
}

export enum AstType {
	Module = "Module",
	VarDecl = "VarDecl",
	ProcDecl = "ProcDecl",
	BreakStmt = "BreakStmt",
	ContinueStmt = "ContinueStmt",
	ReturnStmt = "ReturnStmt",
	AssignStmt = "AssignStmt",
	ExprStmt = "ExprStmt",
	BlockExpr = "BlockExpr",
	GroupExpr = "GroupExpr",
	IfExpr = "IfExpr",
	LoopExpr = "LoopExpr",
	WhileExpr = "WhileExpr",
	ProcExpr = "ProcExpr",
	BinaryExpr = "BinaryExpr",
	UnaryExpr = "UnaryExpr",
	CallExpr = "CallExpr",
	LitExpr = "LitExpr",
	IdExpr = "IdExpr",
	ProcTypeExpr = "ProcTypeExpr",
}

export type Module = {
	type: AstType.Module;
	id: string;
	decls: Ast[];
} & Span;

export type VarDecl = {
	type: AstType.VarDecl;
	access: Access;
	declType?: Ast;
	id: IdExpr;
	initExpr: Ast;
} & Span;

export type ProcDecl = {
	type: AstType.ProcDecl;
	id: IdExpr;
	initExpr: ProcExpr;
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

export type LoopExpr = {
	type: AstType.LoopExpr;
	label?: IdExpr;
	thenExpr: BlockExpr;
} & Span;

export type WhileExpr = {
	type: AstType.WhileExpr;
	testExpr: Ast;
	thenExpr: BlockExpr;
} & Span;

export type ProcParam = {
	id: IdExpr;
	type: Ast;
};

export type ProcExpr = {
	type: AstType.ProcExpr;
	params: ProcParam[];
	returnType: Ast;
	implExpr: BlockExpr;
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

export type ProcTypeExpr = {
	type: AstType.ProcTypeExpr;
	params: Ast[];
	returnType: Ast;
} & Span;

export type Ast =
	| Module
	| VarDecl
	| ProcDecl
	| BreakStmt
	| ContinueStmt
	| ReturnStmt
	| AssignStmt
	| ExprStmt
	| BlockExpr
	| GroupExpr
	| IfExpr
	| LoopExpr
	| WhileExpr
	| ProcExpr
	| BinaryExpr
	| UnaryExpr
	| CallExpr
	| LitExpr
	| IdExpr
	| ProcTypeExpr;

export const Ast = { print: printAst };

function printAst(ast: Ast): string {
	return sexpr(ast, ["start", "end"]);
}
