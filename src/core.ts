import { BinaryOp, UnaryOp } from "./ops.ts";
import {
	Typed,
	Kind,
	ProcType,
	StructType,
	TupleType,
	Type,
	TupleStructType,
} from "./types.ts";
import { Span, Unreachable, sexpr } from "./utils.ts";

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

export enum AstType {
	ModuleDecls = "ModuleDecls",
	ReplExprs = "ReplExprs",
	VarDecl = "VarDecl",
	ProcDecl = "ProcDecl",
	TypeDecl = "TypeDecl",
	StructDecl = "StructDecl",
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
	StructExpr = "StructExpr",
	GroupExpr = "GroupExpr",
	IfExpr = "IfExpr",
	MatchExpr = "MatchExpr",
	ThrowExpr = "ThrowExpr",
	ProcExpr = "ProcExpr",
	TypeExpr = "TypeExpr",
	BinaryExpr = "BinaryExpr",
	UnaryExpr = "UnaryExpr",
	CallExpr = "CallExpr",
	LitExpr = "LitExpr",
	IdExpr = "IdExpr",
	ProcTypeExpr = "ProcTypeExpr",
	WildCardExpr = "WildCardExpr",
}

export type ModuleDecls = {
	type: AstType.ModuleDecls;
	id: string;
	decls: Ast[];
} & Span;

export type ReplExprs = {
	type: AstType.ReplExprs;
	lines: Ast[];
} & Span;

export type VarDecl = {
	type: AstType.VarDecl;
	mutable: boolean;
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
	resolvedType?: Type;
} & Span;

export type StructDeclField = {
	mutable: boolean;
	id: IdExpr;
	typeDecl: Ast;
};

export type StructDecl = {
	type: AstType.StructDecl;
	id: IdExpr;
	fields?: StructDeclField[];
	tupleExpr?: TupleExpr;
	resolvedType?: Type;
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

export type StructExprFieldInit = {
	id: IdExpr;
	expr?: Ast;
};

export type StructExpr = {
	type: AstType.StructExpr;
	id: IdExpr;
	fieldInits: StructExprFieldInit[];
	resolvedType?: StructType;
} & Span;

export type GroupExpr = {
	type: AstType.GroupExpr;
	expr: Ast;
} & Span;

export type IfExpr = {
	type: AstType.IfExpr;
	pattern?: Ast;
	declType?: Ast;
	testExpr: Ast;
	thenExpr: Ast;
	elseExpr?: Ast;
	resolvedDeclType?: Type;
} & Span;

export type Case = {
	pattern?: Ast;
	declType?: Ast;
	testExpr?: Ast;
	thenExpr: Ast;
	resolvedDeclType?: Type;
};

export type MatchExpr = {
	type: AstType.MatchExpr;
	testExpr?: Ast;
	cases: Case[];
} & Span;

export type ThrowExpr = {
	type: AstType.ThrowExpr;
	expr: Ast;
} & Span;

export type ProcExprParam = {
	pattern: Ast;
	declType?: Ast;
};

export type ProcExpr = {
	type: AstType.ProcExpr;
	params: ProcExprParam[];
	returnType?: Ast;
	implExpr: BlockExpr;
	resolvedType?: ProcType;
	discardReturn?: boolean;
} & Span;

export type TypeExpr = {
	type: AstType.TypeExpr;
	expr: Ast;
	resolvedType?: Type;
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
	resolvedType?: Type;
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

export type WildCardExpr = {
	type: AstType.WildCardExpr;
} & Span;

export type Ast =
	| ModuleDecls
	| ReplExprs
	| VarDecl
	| ProcDecl
	| TypeDecl
	| StructDecl
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
	| StructExpr
	| GroupExpr
	| IfExpr
	| MatchExpr
	| ThrowExpr
	| ProcExpr
	| TypeExpr
	| BinaryExpr
	| UnaryExpr
	| CallExpr
	| LitExpr
	| IdExpr
	| ProcTypeExpr
	| WildCardExpr;

export const Ast = { print: printAst };

function printAst(ast: Ast): string {
	return sexpr(ast, ["start", "end"]);
}
