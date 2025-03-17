import {
	AssignStmt,
	Ast,
	AstType,
	BinaryExpr,
	BinaryOp,
	BlockExpr,
	BreakStmt,
	CallExpr,
	ContinueStmt,
	ExprStmt,
	GroupExpr,
	Id,
	IfExpr,
	LitExpr,
	LoopExpr,
	Module,
	ProcDecl,
	ProcExpr,
	ReturnStmt,
	RtBool,
	RtNum,
	RtProc,
	RtValue,
	UnaryExpr,
	UnaryOp,
	VarDecl,
	WhileExpr,
} from "./core.ts";
import { Resolver } from "./resolver.ts";

class Break {
	constructor(readonly label?: string) {}
}

class Continue {
	constructor(readonly label?: string) {}
}

class Return {
	constructor(readonly value: RtValue) {}
}

export type Interpreter = {
	inGlobalScope: boolean;
	// TODO this should probably be soemthing like global > module > local
	globals: RtValue[];
	closure: RtValue[];
	locals: RtValue[];
};

export const Interpreter = { create, interperate };

function create(r: Resolver): Interpreter {
	const globals: RtValue[] = [];
	globals[Resolver.declareGlobal(r, "True")] = RtValue.True;
	globals[Resolver.declareGlobal(r, "False")] = RtValue.False;
	globals[Resolver.declareGlobal(r, "print")] = RtValue.proc((args) => {
		console.log(RtValue.print(args[0]));
		return RtValue.Unit;
	});
	globals[Resolver.declareGlobal(r, "clock")] = RtValue.proc((_args) => {
		return RtValue.num(Date.now() / 1000);
	});
	globals[Resolver.declareGlobal(r, "cat")] = RtValue.proc((args) => {
		return RtValue.str(args.map(RtValue.print).join(""));
	});
	return { inGlobalScope: true, globals, locals: [], closure: [] };
}

function interperate(i: Interpreter, ast: Ast): RtValue {
	switch (ast.type) {
		case AstType.Module:
			return interperateModule(i, ast);
		case AstType.VarDecl:
			return interperateVarDecl(i, ast);
		case AstType.ProcDecl:
			return interperateProcDecl(i, ast);
		case AstType.BreakStmt:
			return interperateBreakStmt(i, ast);
		case AstType.ContinueStmt:
			return interperateContinueStmt(i, ast);
		case AstType.ReturnStmt:
			return interperateReturnStmt(i, ast);
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
		case AstType.ProcExpr:
			return interperateProcExpr(i, ast);
		case AstType.BinaryExpr:
			return interperateBinaryExpr(i, ast);
		case AstType.UnaryExpr:
			return interperateUnaryExpr(i, ast);
		case AstType.CallExpr:
			return interperateCallExpr(i, ast);
		case AstType.LitExpr:
			return interperateLitExpr(i, ast);
		case AstType.Id:
			return interperateId(i, ast);
	}
}

function interperateModule(i: Interpreter, m: Module): RtValue {
	let acc: RtValue = RtValue.Unit;
	for (const decl of m.decls) {
		acc = interperate(i, decl);
	}
	return acc;
}

function interperateVarDecl(i: Interpreter, d: VarDecl): RtValue {
	const memory = i.inGlobalScope ? i.globals : i.locals;
	memory[resolveId(d.id)] = interperate(i, d.initializer);
	return RtValue.Unit;
}

function interperateProcDecl(i: Interpreter, p: ProcDecl): RtValue {
	const memory = i.inGlobalScope ? i.globals : i.locals;
	memory[resolveId(p.id)] = interperateProcExpr(i, p.expr);
	return RtValue.Unit;
}

function interperateBreakStmt(_i: Interpreter, b: BreakStmt): RtValue {
	throw new Break(b.label?.value);
}

function interperateContinueStmt(_i: Interpreter, c: ContinueStmt): RtValue {
	throw new Continue(c.label?.value);
}

function interperateReturnStmt(i: Interpreter, r: ReturnStmt): RtValue {
	throw new Return(
		r.expr !== undefined ? interperate(i, r.expr) : RtValue.Unit
	);
}

function interperateAssignStmt(i: Interpreter, a: AssignStmt): RtValue {
	const resolvedId = resolveId(a.id);
	const localValue = i.locals[resolvedId];
	if (localValue !== undefined) {
		return (i.locals[resolvedId] = interperate(i, a.value));
	}
	const closureValue = i.closure[resolvedId];
	if (closureValue !== undefined) {
		return (i.closure[resolvedId] = interperate(i, a.value));
	}
	return (i.globals[resolvedId] = interperate(i, a.value));
}

function interperateExprStmt(i: Interpreter, a: ExprStmt): RtValue {
	return interperate(i, a.expr);
}

function interperateBlockExpr(i: Interpreter, a: BlockExpr): RtValue {
	const localsLength = i.locals.length;
	try {
		let acc: RtValue = RtValue.Unit;
		for (const stmt of a.stmts) {
			acc = interperate(i, stmt);
		}
		return acc;
	} finally {
		i.locals.length = localsLength;
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
				(e.label === undefined || e.label === l.label?.value)
			) {
				continue;
			}
			if (
				e instanceof Break &&
				(e.label === undefined || e.label === l.label?.value)
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

function interperateProcExpr(i: Interpreter, p: ProcExpr): RtValue {
	const closure = [...i.locals];
	return RtValue.proc((args) => {
		const localsSave = i.locals;
		const closureSave = i.closure;
		const inGlobalScopeSave = i.inGlobalScope;
		i.locals = [];
		i.closure = closure;
		i.inGlobalScope = false;
		try {
			for (let j = 0; j < p.params.length; j++) {
				i.locals[resolveId(p.params[j])] = args[j] ?? RtValue.Unit;
			}
			return interperate(i, p.impl);
		} catch (e) {
			if (e instanceof Return) {
				return e.value;
			}
			throw e;
		} finally {
			i.locals = localsSave;
			i.closure = closureSave;
			i.inGlobalScope = inGlobalScopeSave;
		}
	});
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
		case BinaryOp.Pow: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return RtValue.num(RtNum.unwrap(left) ** RtNum.unwrap(right));
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

function interperateCallExpr(i: Interpreter, c: CallExpr): RtValue {
	const proc = interperate(i, c.proc);
	const args: RtValue[] = [];
	for (const arg of c.args) {
		args.push(interperate(i, arg));
	}
	return RtProc.unwrap(proc)(args);
}

function interperateLitExpr(_i: Interpreter, l: LitExpr): RtValue {
	return l.value;
}

function interperateId(i: Interpreter, id: Id): RtValue {
	// TODO the resolver could do this
	const resolvedId = resolveId(id);
	const localValue = i.locals[resolvedId];
	if (localValue !== undefined) {
		return localValue;
	}
	const closureValue = i.closure[resolvedId];
	if (closureValue !== undefined) {
		return closureValue;
	}
	return i.globals[resolvedId];
}

function resolveId(id: Id): number {
	if (id.resolvedId === undefined) {
		throw new Error(`Unresolved id! ${JSON.stringify(id)}`);
	}
	return id.resolvedId;
}
