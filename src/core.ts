export type Span = {
	start: number;
	end: number;
};

export const Span = { lineOf, columnOf, highlight };

function lineOf(span: Span, source: string): number {
	let line = 0;
	for (let i = 0; i < span.start; i++) {
		if (source[i] === "\n") {
			line++;
		}
	}
	return line;
}

function columnOf(span: Span, source: string): number {
	let column = 0;
	for (let i = 0; i < span.start; i++) {
		column++;
		if (source[i] === "\n") {
			column = 0;
		}
	}
	return column;
}

function highlight(span: Span, source: string, note: string = ""): string {
	let column = -1;
	let lineNumber = 1;
	let lineContents = "";
	for (let i = 0; i < source.length; i++) {
		if (source[i] === "\n") {
			if (i >= span.end) {
				break;
			}
			column = -1;
			lineNumber++;
			lineContents = "";
		}
		if (i < span.end) {
			column++;
		}
		lineContents += source[i];
	}
	console.log({
		start: span.start,
		end: span.end,
		column,
		lineNumber,
		lineContents,
		note,
	});
	const prefix = ` ${lineNumber} | `;
	const padding = `${" ".repeat(prefix.length - 2)}| ${" ".repeat(column)}`;
	const spanLength = Math.max(span.end - span.start, 1);
	const highlight = "^".repeat(spanLength);
	if (spanLength > lineContents.length - column) {
		throw new Error("Cannot highlight multiline span!");
	}
	return `${padding}\n${prefix}${lineContents}\n${padding}${highlight}\n${padding}${note}`;
}

export enum BinaryOp {
	Add = "Add",
	Sub = "Sub",
	Mul = "Mul",
	Div = "Div",
	Rem = "Rem",
	And = "And",
	Or = "Or",
	Lt = "Lt",
	Lte = "Lte",
	Gt = "Gt",
	Gte = "Gte",
	Eq = "Eq",
	NotEq = "NotEq",
	Id = "Id",
	NotId = "NotId",
	Default = "Default",
	Member = "Member",
}

export enum UnaryOp {
	Not = "Not",
	Neg = "Neg",
	Spread = "Spread",
}

export type Op = BinaryOp | UnaryOp;

export enum RtType {
	Unit = "Unit",
	Bool = "Bool",
	Num = "Num", // TODO split into numeric types
	Str = "Str",
}

function unwrap<T extends { type: RtType; value: unknown }>(
	type: T["type"]
): (value: RtValue) => T["value"] {
	return (value) => {
		if (value.type !== type) {
			throw new Error(
				`Expected ${RtType[type]} but got ${RtType[value.type]}!`
			);
		}
		return value.value;
	};
}

export type RtUnit = {
	type: RtType.Unit;
	value: undefined;
};

const Unit: RtUnit = { type: RtType.Unit, value: undefined };

export const RtUnit = {
	unwrap: unwrap<RtUnit>(RtType.Unit),
};

export type RtBool = {
	type: RtType.Bool;
	value: boolean;
};

const True: RtBool = { type: RtType.Bool, value: true };
const False: RtBool = { type: RtType.Bool, value: false };

function bool(value: boolean): RtBool {
	return value ? True : False;
}

export const RtBool = {
	unwrap: unwrap<RtBool>(RtType.Bool),
};

export type RtNum = {
	type: RtType.Num;
	value: number;
};

function num(value: number): RtNum {
	return { type: RtType.Num, value };
}

export const RtNum = {
	unwrap: unwrap<RtNum>(RtType.Num),
};

export type RtStr = {
	type: RtType.Str;
	value: string;
};

function str(value: string): RtStr {
	return { type: RtType.Str, value };
}

export const RtStr = {
	unwrap: unwrap<RtStr>(RtType.Str),
};

export type RtValue = RtUnit | RtBool | RtNum | RtStr;

export const RtValue = { Unit, True, False, bool, num, str, eq, id, print };

function eq(a: RtValue, b: RtValue): boolean {
	if (a.type !== b.type) {
		return false;
	}
	switch (a.type) {
		case RtType.Unit:
			return true;
		case RtType.Bool:
		case RtType.Num:
		case RtType.Str:
			return a.value === (b as typeof a).value;
	}
}

function id(a: RtValue, b: RtValue): boolean {
	return eq(a, b);
}

function print(v: RtValue): string {
	switch (v.type) {
		case RtType.Unit:
			return "()";
		case RtType.Bool:
			return v.value ? "True" : "False";
		case RtType.Num:
		case RtType.Str:
			return `${v.value}`;
	}
}

export enum AstType {
	Module = "Module",
	VarStmt = "VarStmt",
	PrintStmt = "PrintStmt",
	BreakStmt = "BreakStmt",
	ContinueStmt = "ContinueStmt",
	AssignStmt = "AssignStmt",
	ExprStmt = "ExprStmt",
	BlockExpr = "BlockExpr",
	GroupExpr = "GroupExpr",
	IfExpr = "IfExpr",
	LoopExpr = "LoopExpr",
	WhileExpr = "WhileExpr",
	BinaryExpr = "BinaryExpr",
	UnaryExpr = "UnaryExpr",
	LitExpr = "LitExpr",
	IdExpr = "IdExpr",
}

export type Module = {
	type: AstType.Module;
	id: string;
	decls: Ast[];
} & Span;

export type VarStmt = {
	type: AstType.VarStmt;
	name: string;
	initializer: Ast;
} & Span;

export type PrintStmt = {
	type: AstType.PrintStmt;
	expr: Ast;
} & Span;

export type BreakStmt = {
	type: AstType.BreakStmt;
	label?: string;
} & Span;

export type ContinueStmt = {
	type: AstType.ContinueStmt;
	label?: string;
} & Span;

export type AssignStmt = {
	type: AstType.AssignStmt;
	name: string;
	op?: BinaryOp;
	value: Ast;
} & Span;

export type ExprStmt = {
	type: AstType.ExprStmt;
	expr: Ast;
} & Span;

export type BlockExpr = {
	type: AstType.BlockExpr;
	label?: string;
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
	label?: string;
	blockExpr: Ast;
} & Span;

export type WhileExpr = {
	type: AstType.WhileExpr;
	testExpr: Ast;
	blockExpr: Ast;
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

export type LitExpr = {
	type: AstType.LitExpr;
	value: RtValue;
} & Span;

export type IdExpr = {
	type: AstType.IdExpr;
	value: string;
} & Span;

export type Ast =
	| Module
	| VarStmt
	| PrintStmt
	| BreakStmt
	| ContinueStmt
	| AssignStmt
	| ExprStmt
	| BlockExpr
	| GroupExpr
	| IfExpr
	| LoopExpr
	| WhileExpr
	| BinaryExpr
	| UnaryExpr
	| LitExpr
	| IdExpr;

export const Ast = { sexpr };

function sexpr(ast: Ast): string {
	function tab(head: string, parts: string[]): string {
		let text = `(${head}`;
		for (const part of parts) {
			text += `\n  ${part.replaceAll("\n", "\n  ")}`;
		}
		text += ")";
		return text;
	}
	switch (ast.type) {
		case AstType.Module:
			return tab(ast.type, ast.decls.map(sexpr));
		case AstType.VarStmt:
			return tab(ast.type, [ast.name, sexpr(ast.initializer)]);
		case AstType.PrintStmt:
			return tab(ast.type, [sexpr(ast.expr)]);
		case AstType.BreakStmt:
			return `(${ast.type} ${ast.label})`;
		case AstType.ContinueStmt:
			return `(${ast.type} ${ast.label})`;
		case AstType.AssignStmt:
			return tab(ast.type, [ast.name, sexpr(ast.value)]);
		case AstType.ExprStmt:
			return tab(ast.type, [sexpr(ast.expr)]);
		case AstType.BlockExpr:
			return tab(ast.type, ast.stmts.map(sexpr));
		case AstType.GroupExpr:
			return tab(ast.type, [sexpr(ast.expr)]);
		case AstType.IfExpr:
			return tab(ast.type, [
				sexpr(ast.testExpr),
				sexpr(ast.thenExpr),
				...(ast.elseExpr === undefined ? [] : [sexpr(ast.elseExpr)]),
			]);
		case AstType.LoopExpr:
			return tab(ast.type, [sexpr(ast.blockExpr)]);
		case AstType.WhileExpr:
			return tab(ast.type, [sexpr(ast.testExpr), sexpr(ast.blockExpr)]);
		case AstType.BinaryExpr:
			return tab(ast.type, [ast.op, sexpr(ast.left), sexpr(ast.right)]);
		case AstType.UnaryExpr:
			return tab(ast.type, [ast.op, sexpr(ast.right)]);
		case AstType.LitExpr:
			return print(ast.value);
		case AstType.IdExpr:
			return ast.value;
	}
}
