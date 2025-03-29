import { BinaryOp, UnaryOp } from "./ops.ts";
import { Type, TupleType, StructType, ProcType } from "./types.ts";
import { Span, sexpr } from "./utils.ts";

export enum AstTag {
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
	tag: AstTag.ModuleDecls;
	id: string;
	decls: Ast[];
} & Span;

export type ReplExprs = {
	tag: AstTag.ReplExprs;
	lines: Ast[];
} & Span;

export type VarDecl = {
	tag: AstTag.VarDecl;
	mutable: boolean;
	assert: boolean;
	declType?: Ast;
	pattern: Ast;
	initExpr: Ast;
	resolvedType?: Type;
} & Span;

export type ProcDecl = {
	tag: AstTag.ProcDecl;
	id: IdExpr;
	initExpr: ProcExpr;
} & Span;

export type TypeDecl = {
	tag: AstTag.TypeDecl;
	id: IdExpr;
	typeExpr: Ast;
	resolvedType?: Type;
} & Span;

export type StructDecl = {
	tag: AstTag.StructDecl;
	id: IdExpr;
	fields?: StructDeclField[];
	tupleExpr?: TupleExpr;
	resolvedType?: Type;
} & Span;

export type StructDeclField = {
	mutable: boolean;
	id: IdExpr;
	typeDecl?: Ast;
	expr?: Ast;
};

export type TestDecl = {
	tag: AstTag.TestDecl;
	name: string;
	thenExpr: Ast;
} & Span;

export type BreakStmt = {
	tag: AstTag.BreakStmt;
	label?: IdExpr;
} & Span;

export type ContinueStmt = {
	tag: AstTag.ContinueStmt;
	label?: IdExpr;
} & Span;

export type ReturnStmt = {
	tag: AstTag.ReturnStmt;
	expr?: Ast;
} & Span;

export type AssertStmt = {
	tag: AstTag.AssertStmt;
	testExpr: Ast;
} & Span;

export type LoopStmt = {
	tag: AstTag.LoopStmt;
	label?: IdExpr;
	thenExpr: BlockExpr;
} & Span;

export type WhileStmt = {
	tag: AstTag.WhileStmt;
	testExpr: Ast;
	thenExpr: BlockExpr;
} & Span;

export type AssignStmt = {
	tag: AstTag.AssignStmt;
	target?: Ast;
	id: IdExpr;
	expr: Ast;
} & Span;

export type ExprStmt = {
	tag: AstTag.ExprStmt;
	expr: Ast;
} & Span;

export type BlockExpr = {
	tag: AstTag.BlockExpr;
	stmts: Ast[];
} & Span;

export type TupleExpr = {
	tag: AstTag.TupleExpr;
	items: Ast[];
	resolvedType?: TupleType;
} & Span;

export type StructExpr = {
	tag: AstTag.StructExpr;
	id: IdExpr;
	fieldInits: StructExprFieldInit[];
	spreadInit?: Ast;
	resolvedType?: StructType;
} & Span;

export type StructExprFieldInit = {
	id: IdExpr;
	expr?: Ast;
};

export type GroupExpr = {
	tag: AstTag.GroupExpr;
	expr: Ast;
} & Span;

export type IfExpr = {
	tag: AstTag.IfExpr;
	mutable: boolean;
	pattern?: Ast;
	declType?: Ast;
	testExpr: Ast;
	thenExpr: Ast;
	elseExpr?: Ast;
	resolvedDeclType?: Type;
} & Span;

export type MatchExpr = {
	tag: AstTag.MatchExpr;
	testExpr?: Ast;
	cases: Case[];
} & Span;

export type Case = {
	pattern?: Ast;
	declType?: Ast;
	testExpr?: Ast;
	thenExpr: Ast;
	resolvedDeclType?: Type;
};

export type ThrowExpr = {
	tag: AstTag.ThrowExpr;
	expr: Ast;
} & Span;

export type ProcExpr = {
	tag: AstTag.ProcExpr;
	params: ProcExprParam[];
	returnType?: Ast;
	implExpr: BlockExpr;
	resolvedType?: ProcType;
	discardReturn?: boolean;
} & Span;

export type ProcExprParam = {
	pattern: Ast;
	declType?: Ast;
};

export type TypeExpr = {
	tag: AstTag.TypeExpr;
	expr: Ast;
	resolvedType?: Type;
} & Span;

export type BinaryExpr = {
	tag: AstTag.BinaryExpr;
	op: BinaryOp;
	left: Ast;
	right: Ast;
} & Span;

export type UnaryExpr = {
	tag: AstTag.UnaryExpr;
	op: UnaryOp;
	right: Ast;
} & Span;

export type CallExpr = {
	tag: AstTag.CallExpr;
	proc: Ast;
	args: Ast[];
	resolvedType?: Type;
} & Span;

export type LitExpr = {
	tag: AstTag.LitExpr;
	value: unknown;
} & Span;

export type IdExpr = {
	tag: AstTag.IdExpr;
	value: string;
	resolvedId?: number;
} & Span;

export type ProcTypeExpr = {
	tag: AstTag.ProcTypeExpr;
	params: Ast[];
	returnType: Ast;
} & Span;

export type WildCardExpr = {
	tag: AstTag.WildCardExpr;
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
