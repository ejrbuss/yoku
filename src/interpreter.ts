import {
	AssignStmt,
	Ast,
	AstType,
	BinaryExpr,
	BinaryOp,
	BlockExpr,
	BreakStmt,
	ContinueStmt,
	ExprStmt,
	GroupExpr,
	IdExpr,
	IfExpr,
	LitExpr,
	LoopExpr,
	Module,
	PrintStmt,
	RtBool,
	RtNum,
	RtValue,
	UnaryExpr,
	UnaryOp,
	VarStmt,
	WhileExpr,
} from "./core.ts";

type Scope = Record<string, RtValue | undefined>;

class Break {
	constructor(readonly label?: string) {}
}

class Continue {
	constructor(readonly label?: string) {}
}

export type Interpreter = {
	scopes: Scope[];
};

export const Interpreter = { create, interperate, define, update, get };

function create(): Interpreter {
	return {
		scopes: [
			{
				True: RtValue.True,
				False: RtValue.False,
			},
		],
	};
}

function define(i: Interpreter, name: string, value: RtValue): void {
	if (get(i, name) !== undefined) {
		throw new Error(`'${name}' is already defined!`);
	}
	const scope = i.scopes[i.scopes.length - 1];
	scope[name] = value;
}

function update(i: Interpreter, name: string, value: RtValue): void {
	for (let j = i.scopes.length - 1; j >= 0; j--) {
		const scope = i.scopes[j];
		if (scope[name] !== undefined) {
			scope[name] = value;
			return;
		}
	}
	throw new Error(`'${name}' is undefined!`);
}

function get(i: Interpreter, name: string): RtValue | undefined {
	for (let j = i.scopes.length - 1; j >= 0; j--) {
		const scope = i.scopes[j];
		const value = scope[name];
		if (value !== undefined) {
			return value;
		}
	}
	return undefined;
}

function interperate(i: Interpreter, ast: Ast): RtValue {
	switch (ast.type) {
		case AstType.Module:
			return interperateModule(i, ast);
		case AstType.VarStmt:
			return interperateVarStmt(i, ast);
		case AstType.PrintStmt:
			return interperatePrintStmt(i, ast);
		case AstType.BreakStmt:
			return interperateBreakStmt(i, ast);
		case AstType.ContinueStmt:
			return interperateContinueStmt(i, ast);
		case AstType.AssignStmt:
			return interperateAssignStmt(i, ast);
		case AstType.ExprStmt:
			return interperateExprStmt(i, ast);
		case AstType.BlockExpr:
			return interperateBlockExpr(i, ast);
		case AstType.GroupExpr:
			return interperateGroupExpr(i, ast);
		case AstType.IfExpr:
			return interperateIfExpr(i, ast);
		case AstType.LoopExpr:
			return interperateLoopExpr(i, ast);
		case AstType.WhileExpr:
			return interperateWhileExpr(i, ast);
		case AstType.BinaryExpr:
			return interperateBinaryExpr(i, ast);
		case AstType.UnaryExpr:
			return interperateUnaryExpr(i, ast);
		case AstType.LitExpr:
			return interperateLitExpr(i, ast);
		case AstType.IdExpr:
			return interperateIdExpr(i, ast);
	}
}

function interperateModule(i: Interpreter, m: Module): RtValue {
	for (const decl of m.decls) {
		interperate(i, decl);
	}
	return RtValue.Unit;
}

function interperateVarStmt(i: Interpreter, d: VarStmt): RtValue {
	define(i, d.name, interperate(i, d.initializer));
	return RtValue.Unit;
}

function interperatePrintStmt(i: Interpreter, p: PrintStmt): RtValue {
	const value = interperate(i, p.expr);
	console.log(RtValue.print(value));
	return RtValue.Unit;
}

function interperateBreakStmt(_i: Interpreter, b: BreakStmt): RtValue {
	throw new Break(b.label);
}

function interperateContinueStmt(_i: Interpreter, c: ContinueStmt): RtValue {
	throw new Continue(c.label);
}

function interperateAssignStmt(i: Interpreter, a: AssignStmt): RtValue {
	const value = interperate(i, a.value);
	update(i, a.name, value);
	return RtValue.Unit;
}

function interperateExprStmt(i: Interpreter, a: ExprStmt): RtValue {
	return interperate(i, a.expr);
}

function interperateBlockExpr(i: Interpreter, a: BlockExpr): RtValue {
	i.scopes.push({});
	try {
		let acc: RtValue = RtValue.Unit;
		for (const stmt of a.stmts) {
			acc = interperate(i, stmt);
		}
		return acc;
	} finally {
		i.scopes.pop();
	}
}

function interperateGroupExpr(i: Interpreter, g: GroupExpr): RtValue {
	return interperate(i, g.expr);
}

function interperateIfExpr(i: Interpreter, f: IfExpr): RtValue {
	const test = interperate(i, f.testExpr);
	if (RtBool.unwrap(test)) {
		return interperate(i, f.thenExpr);
	} else if (f.elseExpr !== undefined) {
		return interperate(i, f.elseExpr);
	} else {
		return RtValue.Unit;
	}
}

function interperateLoopExpr(i: Interpreter, l: LoopExpr): RtValue {
	let acc: RtValue = RtValue.Unit;
	for (;;) {
		try {
			acc = interperate(i, l.blockExpr);
		} catch (e) {
			if (
				e instanceof Continue &&
				(e.label === undefined || e.label === l.label)
			) {
				continue;
			}
			if (
				e instanceof Break &&
				(e.label === undefined || e.label === l.label)
			) {
				break;
			}
			throw e;
		}
	}
	return acc;
}

function interperateWhileExpr(i: Interpreter, w: WhileExpr): RtValue {
	let acc: RtValue = RtValue.Unit;
	while (RtBool.unwrap(interperate(i, w.testExpr))) {
		try {
			acc = interperate(i, w.blockExpr);
		} catch (e) {
			if (e instanceof Continue && e.label === undefined) {
				continue;
			}
			if (e instanceof Break && e.label === undefined) {
				break;
			}
			throw e;
		}
	}
	return acc;
}

function interperateBinaryExpr(i: Interpreter, b: BinaryExpr): RtValue {
	switch (b.op) {
		case BinaryOp.Add: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return RtValue.num(RtNum.unwrap(left) + RtNum.unwrap(right));
		}
		case BinaryOp.Sub: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return RtValue.num(RtNum.unwrap(left) - RtNum.unwrap(right));
		}
		case BinaryOp.Mul: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return RtValue.num(RtNum.unwrap(left) * RtNum.unwrap(right));
		}
		case BinaryOp.Div: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return RtValue.num(RtNum.unwrap(left) / RtNum.unwrap(right));
		}
		case BinaryOp.Rem: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return RtValue.num(RtNum.unwrap(left) % RtNum.unwrap(right));
		}
		case BinaryOp.Gt: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return RtValue.bool(RtNum.unwrap(left) > RtNum.unwrap(right));
		}
		case BinaryOp.Gte: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return RtValue.bool(RtNum.unwrap(left) >= RtNum.unwrap(right));
		}
		case BinaryOp.Lt: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return RtValue.bool(RtNum.unwrap(left) < RtNum.unwrap(right));
		}
		case BinaryOp.Lte: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return RtValue.bool(RtNum.unwrap(left) <= RtNum.unwrap(right));
		}
		case BinaryOp.Eq: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return RtValue.bool(RtValue.eq(left, right));
		}
		case BinaryOp.NotEq: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return RtValue.bool(!RtValue.eq(left, right));
		}
		case BinaryOp.And: {
			const left = RtBool.unwrap(interperate(i, b.left));
			if (!left) {
				return RtValue.bool(false);
			}
			return RtValue.bool(RtBool.unwrap(interperate(i, b.right)));
		}
		case BinaryOp.Or: {
			const left = RtBool.unwrap(interperate(i, b.left));
			if (left) {
				return RtValue.bool(true);
			}
			return RtValue.bool(RtBool.unwrap(interperate(i, b.right)));
		}
		case BinaryOp.Id: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return RtValue.bool(RtValue.id(left, right));
		}
		case BinaryOp.NotId: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return RtValue.bool(!RtValue.id(left, right));
		}
		case BinaryOp.Default: {
			throw new Error("Unsupported operator!");
		}
		case BinaryOp.Member: {
			throw new Error("Unsupported operator!");
		}
	}
}

function interperateUnaryExpr(i: Interpreter, u: UnaryExpr): RtValue {
	switch (u.op) {
		case UnaryOp.Not: {
			const right = interperate(i, u.right);
			return RtValue.bool(!RtBool.unwrap(right));
		}
		case UnaryOp.Neg: {
			const right = interperate(i, u.right);
			return RtValue.num(-RtNum.unwrap(right));
		}
		case UnaryOp.Spread: {
			throw new Error("Unsupported operator!");
		}
	}
}

function interperateLitExpr(_i: Interpreter, l: LitExpr): RtValue {
	return l.value;
}

function interperateIdExpr(i: Interpreter, id: IdExpr): RtValue {
	const value = get(i, id.value);
	if (value === undefined) {
		throw new Error(`'${id.value}' is undefined!`);
	}
	return value;
}
