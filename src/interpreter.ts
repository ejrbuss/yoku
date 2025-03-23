import {
	AssertStmt,
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
	LoopStmt,
	Module,
	print,
	Proc,
	ProcDecl,
	ProcExpr,
	ProcType,
	Repl,
	ReturnStmt,
	TestDecl,
	Tuple,
	TupleExpr,
	TupleType,
	Type,
	UnaryExpr,
	UnaryOp,
	VarDecl,
	WhileStmt,
} from "./core.ts";
import { Resolver } from "./resolver.ts";
import { TypeChecker } from "./typechecker.ts";
import { structurallyEq, Todo, Unreachable } from "./utils.ts";

export class RuntimeError {
	constructor(
		readonly note: string,
		readonly start?: number,
		readonly end?: number
	) {}
}

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
	// TODO this should probably be something like global > module > local
	globals: unknown[];
	closure: unknown[];
	locals: unknown[];
	test: boolean;
};

export const Interpreter = { create, interperate };

export const Builtins = {
	print: Proc.create("print", Type.proc([Type.Any], Type.Unit), (args) => {
		console.log(print(args[0]));
		return null;
	}),
	clock: Proc.create("clock", Type.proc([], Type.Int), () => {
		return BigInt(Date.now());
	}),
	cat: Proc.create("cat", Type.proc([Type.Any, Type.Any], Type.Str), (args) => {
		return args.map(print).join("");
	}),
	print_type: Proc.create(
		"print_type",
		Type.proc([Type.Any], Type.Str),
		(args) => {
			return Type.print(Type.of(args[0]));
		}
	),
	// TODO can be removed once we have throw
	explode: Proc.create("explode", Type.proc([], Type.Never), () => {
		throw new RuntimeError("Explode!");
	}),
};

function create(r: Resolver, t: TypeChecker, test: boolean): Interpreter {
	const globals = [];
	for (const [id, builtin] of Object.entries(Builtins)) {
		const resolvedId = Resolver.declareGlobal(r, id);
		TypeChecker.declareGlobal(t, resolvedId, Type.of(builtin));
		globals[resolvedId] = builtin;
	}
	return { inGlobalScope: true, globals, locals: [], closure: [], test };
}

function storeValue(i: Interpreter, pattern: Ast, value: unknown): void {
	if (pattern.type === AstType.BinaryExpr) {
		if (pattern.op !== BinaryOp.As) {
			throw new Unreachable();
		}
		storeValue(i, pattern.left, value);
		storeValue(i, pattern.right, value);
		return;
	}
	if (pattern.type === AstType.TupleExpr) {
		for (let j = 0; j < pattern.items.length; j++) {
			storeValue(i, pattern.items[j], (value as Tuple).items[j]);
		}
		return;
	}
	if (pattern.type === AstType.WildCardExpr) {
		return;
	}
	if (pattern.type === AstType.IdExpr) {
		const memory = i.inGlobalScope ? i.globals : i.locals;
		memory[resolveId(pattern)] = value;
		return;
	}
	if (pattern.type === AstType.LitExpr) {
		if (pattern.value !== value) {
			const expected = print(pattern.value);
			const actual = print(value);
			throw new RuntimeError(
				`Expected ${expected} but found ${actual}!`,
				pattern.start,
				pattern.end
			);
		}
		return;
	}
	throw new Unreachable();
}

function interperate(i: Interpreter, ast: Ast): unknown {
	switch (ast.type) {
		case AstType.Module:
			return interperateModule(i, ast);
		case AstType.Repl:
			return interperateRepl(i, ast);
		case AstType.VarDecl:
			return interperateVarDecl(i, ast);
		case AstType.ProcDecl:
			return interperateProcDecl(i, ast);
		case AstType.TestDecl:
			return interperateTestDecl(i, ast);
		case AstType.BreakStmt:
			return interperateBreakStmt(i, ast);
		case AstType.ContinueStmt:
			return interperateContinueStmt(i, ast);
		case AstType.ReturnStmt:
			return interperateReturnStmt(i, ast);
		case AstType.AssertStmt:
			return interperateAssertStmt(i, ast);
		case AstType.LoopStmt:
			return interperateLoopStmt(i, ast);
		case AstType.WhileStmt:
			return interperateWhileStmt(i, ast);
		case AstType.AssignStmt:
			return interperateAssignStmt(i, ast);
		case AstType.ExprStmt:
			return interperateExprStmt(i, ast);
		case AstType.BlockExpr:
			return interperateBlockExpr(i, ast);
		case AstType.TupleExpr:
			return interperateTupleExpr(i, ast);
		case AstType.GroupExpr:
			return interperateGroupExpr(i, ast);
		case AstType.IfExpr:
			return interperateIfExpr(i, ast);
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
	throw new Unreachable();
}

function interperateModule(i: Interpreter, m: Module): unknown {
	for (const decl of m.decls) {
		interperate(i, decl);
	}
	return null;
}

function interperateRepl(i: Interpreter, r: Repl): unknown {
	let acc: unknown = null;
	for (const line of r.lines) {
		acc = interperate(i, line);
	}
	return acc;
}

function interperateVarDecl(i: Interpreter, d: VarDecl): unknown {
	const value = interperate(i, d.initExpr);
	if (
		d.assert &&
		!TypeChecker.assignable(Type.of(value), d.resolvedType as Type)
	) {
		const expected = Type.print(d.resolvedType as Type);
		const actual = print(value);
		throw new RuntimeError(
			`Expected type ${expected} but found ${actual}!`,
			d.initExpr.start,
			d.initExpr.end
		);
	}
	storeValue(i, d.pattern, value);
	return null;
}

function interperateProcDecl(i: Interpreter, p: ProcDecl): unknown {
	storeValue(i, p.id, interperate(i, p.initExpr));
	return null;
}

function interperateTestDecl(i: Interpreter, t: TestDecl): unknown {
	if (i.test) {
		try {
			interperate(i, t.thenExpr);
			console.log(`${t.name} ... %cOk`, "color: green");
		} catch (error) {
			console.log(`${t.name} ... %cError`, "color: red");
			throw error;
		}
	}
	return null;
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

function interperateAssertStmt(i: Interpreter, a: AssertStmt): unknown {
	const value = interperate(i, a.testExpr);
	if (!value) {
		if (a.testExpr.type === AstType.BinaryExpr) {
			const b = a.testExpr;
			const l = interperate(i, b.left);
			const r = interperate(i, b.right);
			throw new RuntimeError(
				`Expected ${print(l)} ${b.op} ${print(r)}!`,
				a.start,
				a.end
			);
		}
		throw new RuntimeError(`Expected true!`, a.start, a.end);
	}
	return null;
}

function interperateLoopStmt(i: Interpreter, l: LoopStmt): unknown {
	for (;;) {
		try {
			interperate(i, l.thenExpr);
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
				return null;
			}
			throw e;
		}
	}
}

function interperateWhileStmt(i: Interpreter, w: WhileStmt): unknown {
	while (interperate(i, w.testExpr)) {
		try {
			interperate(i, w.thenExpr);
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
	return null;
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

function interperateExprStmt(i: Interpreter, e: ExprStmt): unknown {
	return interperate(i, e.expr);
}

function interperateBlockExpr(i: Interpreter, b: BlockExpr): unknown {
	const localsLength = i.locals.length;
	try {
		let acc: unknown = null;
		for (const stmt of b.stmts) {
			acc = interperate(i, stmt);
		}
		return acc;
	} finally {
		i.locals.length = localsLength;
	}
}

function interperateTupleExpr(i: Interpreter, t: TupleExpr): unknown {
	if (t.items.length === 0) {
		return null;
	}
	return Tuple.create(
		t.resolvedType as TupleType,
		t.items.map((item) => interperate(i, item))
	);
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

function interperateProcExpr(i: Interpreter, p: ProcExpr): unknown {
	const closure = [...i.locals];
	return Proc.create(undefined, p.resolvedType as ProcType, (args) => {
		const localsSave = i.locals;
		const closureSave = i.closure;
		const inGlobalScopeSave = i.inGlobalScope;
		i.locals = [];
		i.closure = closure;
		i.inGlobalScope = false;
		try {
			for (let j = 0; j < p.params.length; j++) {
				storeValue(i, p.params[j].pattern, args[j] ?? null);
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
			const left = interperate(i, b.left);
			const right = interperate(i, b.right);
			return (left as Tuple).items[Number(right as bigint)];
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
