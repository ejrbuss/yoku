import { BinaryOp, UnaryOp } from "./ops.ts";
import { Type, TupleType, StructType, ProcType } from "./types.ts";
import { Span, sexpr } from "./utils.ts";

export enum AstTag {
	Module = "Module",
	VarDecl = "VarDecl",
	ProcDecl = "ProcDecl",
	TypeDecl = "TypeDecl",
	StructDecl = "StructDecl",
	EnumDecl = "EnumDecl",
	TestDecl = "TestDecl",
	BreakStmt = "BreakStmt",
	ContinueStmt = "ContinueStmt",
	ReturnStmt = "ReturnStmt",
	AssertStmt = "AssertStmt",
	LoopStmt = "LoopStmt",
	AssignVarStmt = "AssignVarStmt",
	AssignFieldStmt = "AssignFieldStmt",
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

export type AstModule = {
	tag: AstTag.Module;
	id: string;
	replMode: boolean;
	decls: Ast[];
} & Span;

export type AstVarDecl = {
	tag: AstTag.VarDecl;
	mutable: boolean;
	assert: boolean;
	typeAnnotation?: Ast;
	pattern: Ast;
	initExpr: Ast;
	resolvedType?: Type;
} & Span;

export type AstProcDecl = {
	tag: AstTag.ProcDecl;
	id: IdExpr;
	initExpr: ProcExpr;
	resolvedType?: Type;
} & Span;

export type AstTypeDecl = {
	tag: AstTag.TypeDecl;
	id: IdExpr;
	typeExpr: Ast;
	resolvedType?: Type;
} & Span;

export type AstStructDecl = {
	tag: AstTag.StructDecl;
	id: IdExpr;
	fields: AstStructField[];
	resolvedType?: Type;
} & Span;

export type AstStructField = {
	mutable: boolean;
	id?: IdExpr;
	typeAnnotation: Ast;
};

export type AstEnumDecl = {
	tag: AstTag.EnumDecl;
	id: IdExpr;
	variants: AstStructDecl[];
	resolvedType?: Type;
} & Span;

export type AstTestDecl = {
	tag: AstTag.TestDecl;
	name: string;
	thenExpr: Ast;
} & Span;

export type AstDecl =
	| AstVarDecl
	| AstProcDecl
	| AstTypeDecl
	| AstStructDecl
	| AstEnumDecl
	| AstTestDecl;

export type AstBreakStmt = {
	tag: AstTag.BreakStmt;
	label?: IdExpr;
} & Span;

export type AstContinueStmt = {
	tag: AstTag.ContinueStmt;
	label?: IdExpr;
} & Span;

export type AstReturnStmt = {
	tag: AstTag.ReturnStmt;
	expr?: Ast;
} & Span;

export type AstAssertStmt = {
	tag: AstTag.AssertStmt;
	testExpr: Ast;
} & Span;

export type AstLoopStmt = {
	tag: AstTag.LoopStmt;
	label?: IdExpr;
	thenExpr: Ast;
} & Span;

export type AstAssignVarStmt = {
	tag: AstTag.AssignVarStmt;
	target: IdExpr;
	expr: Ast;
} & Span;

export type AstAssignFieldStmt = {
	tag: AstTag.AssignFieldStmt;
	target: Ast;
	field: IdExpr;
	expr: Ast;
} & Span;

export type AstExprStmt = {
	tag: AstTag.ExprStmt;
	expr: Ast;
} & Span;

export type AstStmt =
	| AstBreakStmt
	| AstContinueStmt
	| AstReturnStmt
	| AstLoopStmt
	| AstAssertStmt
	| AstAssignVarStmt
	| AstAssignFieldStmt
	| AstExprStmt;

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
	| AstModule
	| AstDecl
	| AstStmt
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
