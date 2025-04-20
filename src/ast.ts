import { BinaryOp, UnaryOp } from "./ops.ts";
import {
	Type,
	TupleType,
	StructType,
	ProcType,
	EnumType,
	ModuleType,
} from "./types.ts";
import { Span, sexpr } from "./utils.ts";

export enum AstTag {
	Module = "Module",
	Wildcard = "Wildcard",
	Lit = "Lit",
	Id = "Id",
	// Declarations
	VarDecl = "VarDecl",
	ProcDecl = "ProcDecl",
	TypeDecl = "TypeDecl",
	StructDecl = "StructDecl",
	EnumDecl = "EnumDecl",
	TestDecl = "TestDecl",
	// Statements
	BreakStmt = "BreakStmt",
	ContinueStmt = "ContinueStmt",
	ReturnStmt = "ReturnStmt",
	AssertStmt = "AssertStmt",
	LoopStmt = "LoopStmt",
	WhileStmt = "WhileStmt",
	AssignVarStmt = "AssignVarStmt",
	AssignFieldStmt = "AssignFieldStmt",
	ExprStmt = "ExprStmt",
	// Expressions
	BlockExpr = "BlockExpr",
	TupleExpr = "TupleExpr",
	StructExpr = "StructExpr",
	EnumExpr = "EnumExpr",
	GroupExpr = "GroupExpr",
	IfExpr = "IfExpr",
	MatchExpr = "MatchExpr",
	ThrowExpr = "ThrowExpr",
	ProcExpr = "ProcExpr",
	TypeExpr = "TypeExpr",
	BinaryExpr = "BinaryExpr",
	UnaryExpr = "UnaryExpr",
	CallExpr = "CallExpr",
	// Patterns
	AsPattern = "AsPattern",
	TuplePattern = "TuplePattern",
	StructPattern = "StructPattern",
	EnumPattern = "EnumPattern",
	LitPattern = "LitPattern",
	WildcardPattern = "WildcardPattern",
	// Types
	ProcType = "ProcType",
	TupleType = "TupleType",
}

export type AstModule = {
	tag: AstTag.Module;
	id: string;
	replMode: boolean;
	decls: (AstDecl | AstStmt)[];
} & Span;

export type AstWildcard = {
	tag: AstTag.Wildcard;
} & Span;

export type AstLit = {
	tag: AstTag.Lit;
	value: unknown;
} & Span;

export type AstId = {
	tag: AstTag.Id;
	value: string;
} & Span;

export type AstVarDecl = {
	tag: AstTag.VarDecl;
	mutable: boolean;
	assert: boolean;
	typeAnnotation?: AstType;
	pattern: AstPattern;
	initExpr: AstExpr;
	resolvedType?: Type;
} & Span;

export type AstProcDecl = {
	tag: AstTag.ProcDecl;
	id: AstId;
	initExpr: ProcExpr;
	resolvedType?: Type;
} & Span;

export type AstTypeDecl = {
	tag: AstTag.TypeDecl;
	id: AstId;
	typeExpr: AstType;
	moduleType?: ModuleType;
} & Span;

export type AstStructField = {
	mutable: boolean;
	id: AstId;
	typeAnnotation: AstType;
};

export type AstStructDecl = {
	tag: AstTag.StructDecl;
	id: AstId;
	tuple: boolean;
	fields: AstStructField[];
	moduleType?: ModuleType;
} & Span;

export type AstEnumVariant = {
	id: AstId;
	constant: boolean;
	tuple: boolean;
	fields: AstStructField[];
};

export type AstEnumDecl = {
	tag: AstTag.EnumDecl;
	id: AstId;
	variants: AstEnumVariant[];
	moduleType?: ModuleType;
} & Span;

export type AstTestDecl = {
	tag: AstTag.TestDecl;
	name: AstLit;
	thenExpr: AstExpr;
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
	label?: AstId;
} & Span;

export type AstContinueStmt = {
	tag: AstTag.ContinueStmt;
	label?: AstId;
} & Span;

export type AstReturnStmt = {
	tag: AstTag.ReturnStmt;
	expr?: AstExpr;
} & Span;

export type AstAssertStmt = {
	tag: AstTag.AssertStmt;
	testExpr: AstExpr;
} & Span;

export type AstLoopStmt = {
	tag: AstTag.LoopStmt;
	label?: AstId;
	thenExpr: AstExpr;
} & Span;

export type AstWhileStmt = {
	tag: AstTag.WhileStmt;
	testExpr: AstExpr;
	thenExpr: AstExpr;
} & Span;

export type AstAssignVarStmt = {
	tag: AstTag.AssignVarStmt;
	target: AstId;
	expr: AstExpr;
} & Span;

export type AstAssignFieldStmt = {
	tag: AstTag.AssignFieldStmt;
	target: AstExpr;
	field: AstId;
	expr: AstExpr;
} & Span;

export type AstExprStmt = {
	tag: AstTag.ExprStmt;
	expr: AstExpr;
} & Span;

export type AstStmt =
	| AstVarDecl
	| AstBreakStmt
	| AstContinueStmt
	| AstReturnStmt
	| AstLoopStmt
	| AstWhileStmt
	| AstAssertStmt
	| AstAssignVarStmt
	| AstAssignFieldStmt
	| AstExprStmt;

export type BlockExpr = {
	tag: AstTag.BlockExpr;
	stmts: AstStmt[];
} & Span;

export type TupleExpr = {
	tag: AstTag.TupleExpr;
	items: AstExpr[];
	resolvedType?: TupleType;
} & Span;

export type AstStructExpr = {
	tag: AstTag.StructExpr;
	id: AstId;
	fieldInits: AstStructFieldInit[];
	spreadInit?: AstExpr;
	resolvedType?: StructType;
} & Span;

export type AstEnumExpr = {
	tag: AstTag.EnumExpr;
	id: AstId;
	structExpr: AstStructExpr;
	resolvedType?: EnumType;
} & Span;

export type AstStructFieldInit = {
	id: AstId;
	expr?: AstExpr;
};

export type GroupExpr = {
	tag: AstTag.GroupExpr;
	expr: AstExpr;
} & Span;

export type IfExpr = {
	tag: AstTag.IfExpr;
	mutable: boolean;
	pattern?: AstPattern;
	assertedType?: AstType;
	testExpr: AstExpr;
	thenExpr: AstExpr;
	elseExpr?: AstExpr;
	resolvedDeclType?: Type;
} & Span;

export type MatchExpr = {
	tag: AstTag.MatchExpr;
	testExpr?: AstExpr;
	cases: Case[];
} & Span;

export type Case = {
	pattern?: AstPattern;
	assertedType?: AstType;
	testExpr?: AstExpr;
	thenExpr: AstExpr;
	resolvedDeclType?: Type;
};

export type ThrowExpr = {
	tag: AstTag.ThrowExpr;
	expr: AstExpr;
} & Span;

export type ProcExpr = {
	tag: AstTag.ProcExpr;
	params: ProcExprParam[];
	returnType?: AstType;
	implExpr: BlockExpr;
	resolvedType?: ProcType;
	discardReturn?: boolean;
} & Span;

export type ProcExprParam = {
	pattern: AstPattern;
	typeAnnotation?: AstType;
};

export type AstTypeExpr = {
	tag: AstTag.TypeExpr;
	type: AstType;
	resolvedType?: Type;
} & Span;

export type BinaryExpr = {
	tag: AstTag.BinaryExpr;
	op: BinaryOp;
	left: AstExpr;
	right: AstExpr;
} & Span;

export type UnaryExpr = {
	tag: AstTag.UnaryExpr;
	op: UnaryOp;
	right: AstExpr;
} & Span;

export type CallExpr = {
	tag: AstTag.CallExpr;
	proc: AstExpr;
	args: AstExpr[];
} & Span;

export type AstExpr =
	| BlockExpr
	| TupleExpr
	| AstStructExpr
	| AstEnumExpr
	| GroupExpr
	| IfExpr
	| MatchExpr
	| ThrowExpr
	| ProcExpr
	| AstTypeExpr
	| BinaryExpr
	| UnaryExpr
	| CallExpr
	| AstLit
	| AstId;

export type AstAsPattern = {
	tag: AstTag.AsPattern;
	left: AstPattern;
	right: AstPattern;
} & Span;

export type AstTuplePattern = {
	tag: AstTag.TuplePattern;
	items: AstPattern[];
} & Span;

export type AstStructFieldPattern = {
	id: AstId;
	pattern: AstPattern;
};

export type AstStructPattern = {
	tag: AstTag.StructPattern;
	id: AstId;
	tuple: boolean;
	fieldPatterns: AstStructFieldPattern[];
} & Span;

export type AstEnumVariantPattern = {
	id: AstId;
	constant: boolean;
	tuple: boolean;
	fieldPatterns: AstStructFieldPattern[];
};

export type AstEnumPattern = {
	tag: AstTag.EnumPattern;
	id: AstId;
	variant: AstEnumVariantPattern;
} & Span;

export type AstPattern =
	| AstAsPattern
	| AstTuplePattern
	| AstStructPattern
	| AstEnumPattern
	| AstWildcard
	| AstLit
	| AstId;

export type AstProcType = {
	tag: AstTag.ProcType;
	params: AstType[];
	returnType: AstType;
} & Span;

export type AstTupleType = {
	tag: AstTag.TupleType;
	items: AstType[];
} & Span;

export type AstType = AstProcType | AstTupleType | AstWildcard | AstId;

export type Ast = AstModule | AstDecl | AstStmt | AstExpr | AstPattern;

export const Ast = { print: printAst };

function printAst(ast: Ast): string {
	return sexpr(ast, ["start", "end"]);
}
