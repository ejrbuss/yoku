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
	IdExpr,
	IfExpr,
	LitExpr,
	LoopExpr,
	Module,
	print,
	Proc,
	ProcDecl,
	ProcExpr,
	ReturnStmt,
	Type,
	UnaryExpr,
	UnaryOp,
	VarDecl,
	WhileExpr,
} from "./core.ts";
import { Resolver } from "./resolver.ts";
import { structurallyEq, Todo } from "./utils.ts";

class Break {
	constructor(readonly label?: string) {}
}

class Continue {
	constructor(readonly label?: string) {}
}

class Return {
	constructor(readonly value: unknown) {}
}

export type Interpreter = {
	inGlobalScope: boolean;
	// TODO this should probably be soemthing like global > module > local
	globals: unknown[];
	closure: unknown[];
	locals: unknown[];
};

export const Interpreter = { create, interperate };

export const Builtins = {
	Unit: null,
	True: true,
	False: false,
	print: Proc.create("print", [Type.Any], Type.Unit, (args) => {
		console.log(print(args[0]));
		return null;
	}),
	clock: Proc.create("clock", [], Type.Int, () => {
		return BigInt(Date.now());
	}),
	cat: Proc.create("cat", [Type.Any, Type.Any], Type.Str, (args) => {
		return args.map(print).join("");
	}),
};

function create(r: Resolver): Interpreter {
	const globals = [];
	for (const [id, builtin] of Object.entries(Builtins)) {
		globals[Resolver.declareGlobal(r, id)] = builtin;
	}
	return { inGlobalScope: true, globals, locals: [], closure: [] };
}

function interperate(i: Interpreter, ast: Ast): unknown {
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
		case AstType.IdExpr:
			return interperateIdExpr(i, ast);
	}
}

function interperateModule(i: Interpreter, m: Module): unknown {
	let acc: unknown = null;
	for (const decl of m.decls) {
		acc = interperate(i, decl);
	}
	return acc;
}

function interperateVarDecl(i: Interpreter, d: VarDecl): unknown {
	const memory = i.inGlobalScope ? i.globals : i.locals;
	const value = interperate(i, d.initExpr);
	memory[resolveId(d.id)] = value;
	return value;
}

function interperateProcDecl(i: Interpreter, p: ProcDecl): unknown {
	const memory = i.inGlobalScope ? i.globals : i.locals;
	const value = interperateProcExpr(i, p.initExpr);
	memory[resolveId(p.id)] = value;
	return value;
}

function interperateBreakStmt(_i: Interpreter, b: BreakStmt): unknown {
	throw new Break(b.label?.value);
}

function interperateContinueStmt(_i: Interpreter, c: ContinueStmt): unknown {
	throw new Continue(c.label?.value);
}

function interperateReturnStmt(i: Interpreter, r: ReturnStmt): unknown {
	throw new Return(r.expr !== undefined ? interperate(i, r.expr) : null);
}

function interperateAssignStmt(i: Interpreter, a: AssignStmt): unknown {
	const value = interperate(i, a.expr);
	const resolvedId = resolveId(a.id);
	if (i.locals[resolvedId] !== undefined) {
		i.locals[resolvedId] = value;
		return null;
	}
	if (i.closure[resolvedId] !== undefined) {
		i.closure[resolvedId] = value;
		return null;
	}
	i.globals[resolvedId] = value;
	return null;
}

function interperateExprStmt(i: Interpreter, a: ExprStmt): unknown {
	return interperate(i, a.expr);
}

function interperateBlockExpr(i: Interpreter, a: BlockExpr): unknown {
	const localsLength = i.locals.length;
	try {
		let acc: unknown = null;
		for (const stmt of a.stmts) {
			acc = interperate(i, stmt);
		}
		return acc;
	} finally {
		i.locals.length = localsLength;
	}
}

function interperateGroupExpr(i: Interpreter, g: GroupExpr): unknown {
	return interperate(i, g.expr);
}

function interperateIfExpr(i: Interpreter, f: IfExpr): unknown {
	if (interperate(i, f.testExpr)) {
		return interperate(i, f.thenExpr);
	} else if (f.elseExpr !== undefined) {
		return interperate(i, f.elseExpr);
	} else {
		return null;
	}
}

function interperateLoopExpr(i: Interpreter, l: LoopExpr): unknown {
	let acc: unknown = null;
	for (;;) {
		try {
			acc = interperate(i, l.thenExpr);
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

function interperateWhileExpr(i: Interpreter, w: WhileExpr): unknown {
	let acc: unknown = null;
	while (interperate(i, w.testExpr)) {
		try {
			acc = interperate(i, w.thenExpr);
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

function interperateProcExpr(i: Interpreter, p: ProcExpr): unknown {
	const closure = [...i.locals];
	// TODO type signature is going to have to be resolved on nodes
	return Proc.create(undefined, [], Type.Any, (args) => {
		const localsSave = i.locals;
		const closureSave = i.closure;
		const inGlobalScopeSave = i.inGlobalScope;
		i.locals = [];
		i.closure = closure;
		i.inGlobalScope = false;
		try {
			for (let j = 0; j < p.params.length; j++) {
				i.locals[resolveId(p.params[j].id)] = args[j] ?? null;
			}
			return interperate(i, p.implExpr);
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

function interperateBinaryExpr(i: Interpreter, b: BinaryExpr): unknown {
	switch (b.op) {
		case BinaryOp.Add: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return (left as number) + (right as number);
		}
		case BinaryOp.Sub: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return (left as number) - (right as number);
		}
		case BinaryOp.Mul: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return (left as number) * (right as number);
		}
		case BinaryOp.Div: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return (left as number) / (right as number);
		}
		case BinaryOp.Rem: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return (left as number) % (right as number);
		}
		case BinaryOp.Pow: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return (left as number) ** (right as number);
		}
		case BinaryOp.Gt: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return (left as number) > (right as number);
		}
		case BinaryOp.Gte: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return (left as number) >= (right as number);
		}
		case BinaryOp.Lt: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return (left as number) < (right as number);
		}
		case BinaryOp.Lte: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return (left as number) <= (right as number);
		}
		case BinaryOp.Eq: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return structurallyEq(left, right);
		}
		case BinaryOp.NotEq: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return !structurallyEq(left, right);
		}
		case BinaryOp.And: {
			return interperate(i, b.left) && interperate(i, b.right);
		}
		case BinaryOp.Or: {
			return interperate(i, b.left) || interperate(i, b.right);
		}
		case BinaryOp.Id: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return left === right;
		}
		case BinaryOp.NotId: {
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return left !== right;
		}
		case BinaryOp.Default: {
			throw new Todo();
		}
		case BinaryOp.Member: {
			throw new Todo();
		}
	}
}

function interperateUnaryExpr(i: Interpreter, u: UnaryExpr): unknown {
	switch (u.op) {
		case UnaryOp.Not: {
			const right = interperate(i, u.right);
			return !right;
		}
		case UnaryOp.Neg: {
			const right = interperate(i, u.right);
			return -(right as number);
		}
		case UnaryOp.Spread: {
			throw new Todo();
		}
	}
}

function interperateCallExpr(i: Interpreter, c: CallExpr): unknown {
	const proc = interperate(i, c.proc);
	const args = c.args.map((arg) => interperate(i, arg));
	return (proc as Proc).impl(args);
}

function interperateLitExpr(_i: Interpreter, l: LitExpr): unknown {
	return l.value;
}

function interperateIdExpr(i: Interpreter, id: IdExpr): unknown {
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

function resolveId(id: IdExpr): number {
	if (id.resolvedId === undefined) {
		throw new Error(`Unresolved id! ${JSON.stringify(id)}`);
	}
	return id.resolvedId;
}
