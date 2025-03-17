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
	let column = 0;
	let lineNumber = 1;
	let lineContents = "";
	for (let i = 0; i < source.length; i++) {
		if (source[i] === "\n") {
			if (i >= span.end) {
				break;
			}
			column = 0;
			lineNumber++;
			lineContents = "";
			continue;
		} else {
			if (i < span.start) {
				column++;
			}
			lineContents += source[i];
		}
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

export type Op = BinaryOp | UnaryOp;

export enum RtType {
	Unit = "Unit",
	Bool = "Bool",
	Num = "Num", // TODO split into numeric types
	Str = "Str",
	Proc = "Proc",
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

export type RtProc = {
	type: RtType.Proc;
	value: (args: RtValue[]) => RtValue;
};

function proc(value: (args: RtValue[]) => RtValue): RtProc {
	return { type: RtType.Proc, value };
}

export const RtProc = {
	unwrap: unwrap<RtProc>(RtType.Proc),
};

export type RtValue = RtUnit | RtBool | RtNum | RtStr | RtProc;

export const RtValue = {
	Unit,
	True,
	False,
	bool,
	num,
	str,
	proc,
	eq,
	id,
	print,
};

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
		case RtType.Proc:
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
		case RtType.Proc:
			return "proc";
	}
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
	Id = "Id",
}

export type Module = {
	type: AstType.Module;
	id: string;
	decls: Ast[];
} & Span;

export type VarDecl = {
	type: AstType.VarDecl;
	isConst: boolean;
	id: Id;
	initializer: Ast;
} & Span;

export type ProcDecl = {
	type: AstType.ProcDecl;
	id: Id;
	expr: ProcExpr;
} & Span;

export type BreakStmt = {
	type: AstType.BreakStmt;
	label?: Id;
} & Span;

export type ContinueStmt = {
	type: AstType.ContinueStmt;
	label?: Id;
} & Span;

export type ReturnStmt = {
	type: AstType.ReturnStmt;
	expr?: Ast;
} & Span;

export type AssignStmt = {
	type: AstType.AssignStmt;
	id: Id;
	op?: BinaryOp;
	value: Ast;
} & Span;

export type ExprStmt = {
	type: AstType.ExprStmt;
	expr: Ast;
} & Span;

export type BlockExpr = {
	type: AstType.BlockExpr;
	label?: Id;
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
	label?: Id;
	blockExpr: Ast;
} & Span;

export type WhileExpr = {
	type: AstType.WhileExpr;
	testExpr: Ast;
	blockExpr: Ast;
} & Span;

export type ProcExpr = {
	type: AstType.ProcExpr;
	params: Id[];
	impl: Ast;
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
	value: RtValue;
} & Span;

export type Id = {
	type: AstType.Id;
	value: string;
	resolvedId?: number;
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
	| Id;

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
		case AstType.VarDecl:
			return tab(ast.type, [sexpr(ast.id), sexpr(ast.initializer)]);
		case AstType.ProcDecl:
			return tab(ast.type, [sexpr(ast.id), sexpr(ast.expr)]);
		case AstType.BreakStmt:
			return `(${ast.type}${
				ast.label === undefined ? "" : " " + sexpr(ast.label)
			})`;
		case AstType.ContinueStmt:
			return `(${ast.type}${
				ast.label === undefined ? "" : " " + sexpr(ast.label)
			})`;
		case AstType.ReturnStmt:
			return tab(ast.type, ast.expr === undefined ? [] : [sexpr(ast.expr)]);
		case AstType.AssignStmt:
			return tab(ast.type, [sexpr(ast.id), sexpr(ast.value)]);
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
		case AstType.ProcExpr:
			return tab(ast.type, [`(${ast.params.join(" ")})`, sexpr(ast.impl)]);
		case AstType.BinaryExpr:
			return tab(ast.type, [ast.op, sexpr(ast.left), sexpr(ast.right)]);
		case AstType.UnaryExpr:
			return tab(ast.type, [ast.op, sexpr(ast.right)]);
		case AstType.CallExpr:
			return tab(ast.type, [sexpr(ast.proc), ...ast.args.map(sexpr)]);
		case AstType.LitExpr:
			return print(ast.value);
		case AstType.Id:
			return ast.value;
	}
}
