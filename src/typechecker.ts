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
	Kind,
	LitExpr,
	LoopStmt,
	Module,
	ProcDecl,
	ProcExpr,
	Repl,
	ReturnStmt,
	TestDecl,
	TupleExpr,
	Type,
	UnaryExpr,
	UnaryOp,
	VarDecl,
	WhileStmt,
} from "./core.ts";
import { structurallyEq, Todo, Unreachable } from "./utils.ts";

export type TypeChecker = {
	inGlobalScope: boolean;
	// TODO this should probably be soemthing like global > module > local
	types: Record<string, Type>;
	values: Type[];
	returns: Type[];
};

export class TypeError extends Error {
	constructor(
		readonly note: string,
		readonly start: number,
		readonly end: number
	) {
		super(note);
	}
}

export const TypeChecker = { create, check, declareGlobal };

function create(): TypeChecker {
	const t: TypeChecker = {
		inGlobalScope: true,
		types: {},
		values: [],
		returns: [],
	};
	declareType(t, "Unit", Type.Unit);
	declareType(t, "Bool", Type.Bool);
	declareType(t, "Int", Type.Int);
	declareType(t, "Float", Type.Float);
	declareType(t, "Str", Type.Str);
	declareType(t, "Any", Type.Any);
	declareType(t, "Type", Type.Type);
	return t;
}

function declareGlobal(t: TypeChecker, id: number, type: Type): void {
	t.values[id] = type;
}

function declareType(t: TypeChecker, name: string, type: Type): void {
	t.types[name] = type;
}

function storeTypes(t: TypeChecker, pattern: Ast, type: Type): void {
	if (pattern.type === AstType.TupleExpr) {
		if (type.kind !== Kind.Tuple) {
			const pt = Type.print(type);
			throw new TypeError(
				`Cannot assign ${pt} to a tuple pattern!`,
				pattern.start,
				pattern.end
			);
		}
		if (pattern.items.length !== type.items.length) {
			const fl = type.items.length;
			const dl = pattern.items.length;
			throw new TypeError(
				`Cannot assign a tuple of size ${fl} to a tuple of size ${dl}!`,
				pattern.start,
				pattern.end
			);
		}
		for (let i = 0; i < pattern.items.length; i++) {
			storeTypes(t, pattern.items[i], type.items[i]);
		}
		return;
	}
	if (pattern.type === AstType.WildCardExpr) {
		return;
	}
	if (pattern.type === AstType.IdExpr) {
		t.values[resolveId(pattern)] = type;
		return;
	}
	throw new Unreachable();
}

function check(t: TypeChecker, ast: Ast, d?: Type): Type {
	switch (ast.type) {
		case AstType.Module:
			return checkModule(t, ast, d);
		case AstType.Repl:
			return checkRepl(t, ast, d);
		case AstType.VarDecl:
			return checkVarDecl(t, ast, d);
		case AstType.ProcDecl:
			return checkProcDecl(t, ast, d);
		case AstType.TestDecl:
			return checkTestDecl(t, ast, d);
		case AstType.BreakStmt:
			return checkBreakStmt(t, ast, d);
		case AstType.ContinueStmt:
			return checkContinueStmt(t, ast, d);
		case AstType.ReturnStmt:
			return checkReturnStmt(t, ast, d);
		case AstType.AssertStmt:
			return checkAssertStmt(t, ast, d);
		case AstType.AssignStmt:
			return checkAssignStmt(t, ast, d);
		case AstType.LoopStmt:
			return checkLoopStmt(t, ast, d);
		case AstType.WhileStmt:
			return checkWhileStmt(t, ast, d);
		case AstType.ExprStmt:
			return checkExprStmt(t, ast, d);
		case AstType.BlockExpr:
			return checkBlockExpr(t, ast, d);
		case AstType.TupleExpr:
			return checkTupleExpr(t, ast, d);
		case AstType.GroupExpr:
			return checkGroupExpr(t, ast, d);
		case AstType.IfExpr:
			return checkIfExpr(t, ast, d);
		case AstType.ProcExpr:
			return checkProcExpr(t, ast, d);
		case AstType.BinaryExpr:
			return checkBinaryExpr(t, ast, d);
		case AstType.UnaryExpr:
			return checkUnaryExpr(t, ast, d);
		case AstType.CallExpr:
			return checkCallExpr(t, ast, d);
		case AstType.LitExpr:
			return checkLitExpr(t, ast, d);
		case AstType.IdExpr:
			return checkIdExpr(t, ast, d);
		case AstType.ProcTypeExpr:
			throw new Unreachable();
		case AstType.WildCardExpr:
			throw new Unreachable();
	}
}

function checkModule(t: TypeChecker, m: Module, _d?: Type): Type {
	for (const decl of m.decls) {
		check(t, decl);
	}
	return Type.Unit;
}

function checkRepl(t: TypeChecker, r: Repl, d?: Type): Type {
	let acc: Type = Type.Unit;
	for (const line of r.lines) {
		acc = check(t, line, d);
	}
	return acc;
}

function checkVarDecl(t: TypeChecker, d: VarDecl, _d?: Type): Type {
	const declType =
		d.declType !== undefined ? reifyType(t, d.declType) : undefined;
	const type = check(t, d.initExpr, declType);
	if (declType !== undefined) {
		if (!assignable(type, declType)) {
			const declared = Type.print(declType);
			const found = Type.print(type);
			throw new TypeError(
				`Type ${found} is not assignable to type ${declared}!`,
				d.pattern.start,
				d.pattern.end
			);
		}
	}
	storeTypes(t, d.pattern, type);
	return Type.Unit;
}

function checkProcDecl(t: TypeChecker, p: ProcDecl, _d?: Type): Type {
	const params: Type[] = [];
	for (const param of p.initExpr.params) {
		const paramType = reifyType(t, param.type);
		t.values[resolveId(param.id)] = paramType;
		params.push(paramType);
	}
	const returns = reifyType(t, p.initExpr.returnType);
	t.values[resolveId(p.id)] = Type.proc(params, returns);
	check(t, p.initExpr, returns);
	return Type.Unit;
}

function checkTestDecl(t: TypeChecker, d: TestDecl, _d?: Type): Type {
	check(t, d.thenExpr);
	return Type.Unit;
}

function checkBreakStmt(_t: TypeChecker, _b: BreakStmt, _d?: Type): Type {
	return Type.Unit;
}

function checkContinueStmt(_t: TypeChecker, _c: ContinueStmt, _d?: Type): Type {
	return Type.Unit;
}

function checkReturnStmt(t: TypeChecker, r: ReturnStmt, d?: Type): Type {
	const type = r.expr !== undefined ? check(t, r.expr, d) : Type.Unit;
	t.returns.push(type);
	return type;
}

function checkAssertStmt(t: TypeChecker, a: AssertStmt, _d?: Type): Type {
	check(t, a.testExpr);
	return Type.Unit;
}

function checkAssignStmt(t: TypeChecker, a: AssignStmt, _d?: Type): Type {
	const resolvedId = resolveId(a.id);
	const targetType = t.values[resolvedId];
	const valueType = check(t, a.expr, targetType);
	if (!assignable(valueType, targetType)) {
		const found = Type.print(valueType);
		const declared = Type.print(targetType);
		throw new TypeError(
			`Type ${found} is not assignable to type ${declared}!`,
			a.id.start,
			a.id.end
		);
	}
	return Type.Unit;
}

function checkLoopStmt(t: TypeChecker, l: LoopStmt, _d?: Type): Type {
	check(t, l.thenExpr);
	return Type.Unit;
}

function checkWhileStmt(t: TypeChecker, w: WhileStmt, _d?: Type): Type {
	const testType = check(t, w.testExpr, Type.Bool);
	if (!assignable(testType, Type.Bool)) {
		const found = Type.print(testType);
		throw new TypeError(
			`Type ${found} cannot be used as condition!`,
			w.testExpr.start,
			w.testExpr.end
		);
	}
	check(t, w.thenExpr);
	return Type.Unit;
}

function checkExprStmt(t: TypeChecker, e: ExprStmt, d?: Type): Type {
	return check(t, e.expr, d);
}

function checkBlockExpr(t: TypeChecker, b: BlockExpr, d?: Type): Type {
	for (const stmt of b.stmts) {
		check(t, stmt);
	}
	if (b.stmts.length > 0) {
		return check(t, b.stmts[b.stmts.length - 1], d);
	}
	return Type.Unit;
}

function checkTupleExpr(t: TypeChecker, u: TupleExpr, d?: Type): Type {
	const items: Type[] = [];
	for (let i = 0; i < u.items.length; i++) {
		if (d?.kind === Kind.Tuple) {
			items.push(check(t, u.items[i], d.items[i]));
		} else {
			items.push(check(t, u.items[i]));
		}
	}
	const type = Type.tuple(items);
	u.resolvedType = type;
	return type;
}

function checkGroupExpr(t: TypeChecker, g: GroupExpr, d?: Type): Type {
	return check(t, g.expr, d);
}

function checkIfExpr(t: TypeChecker, i: IfExpr, d?: Type): Type {
	const testType = check(t, i.testExpr, Type.Bool);
	if (!assignable(testType, Type.Bool)) {
		const found = Type.print(testType);
		throw new TypeError(
			`Type ${found} cannot be used as condition!`,
			i.testExpr.start,
			i.testExpr.end
		);
	}
	const thenType = check(t, i.thenExpr, d);
	if (i.elseExpr !== undefined) {
		const elseType = check(t, i.elseExpr, d);
		if (assignable(thenType, elseType)) {
			return elseType;
		}
		if (assignable(elseType, thenType)) {
			return thenType;
		}
	}
	return Type.Unit;
}

function checkProcExpr(t: TypeChecker, p: ProcExpr, _d?: Type): Type {
	const params: Type[] = [];
	for (const param of p.params) {
		const paramType = reifyType(t, param.type);
		t.values[resolveId(param.id)] = paramType;
		params.push(paramType);
	}
	const returns = reifyType(t, p.returnType);
	const returnsSave = t.returns;
	t.returns = [];
	const implicitReturn = check(t, p.implExpr, returns);
	if (implicitReturn !== undefined) {
		t.returns.push(implicitReturn);
	}
	for (const r of t.returns) {
		if (!assignable(r, returns)) {
			const expected = Type.print(returns);
			const found = Type.print(r);
			throw new TypeError(
				`Expected type ${expected} but proc returns type ${found}!`,
				p.returnType.start,
				p.returnType.end
			);
		}
	}
	const type = Type.proc(params, returns);
	t.returns = returnsSave;
	p.resolvedType = type;
	return type;
}

function checkBinaryExpr(t: TypeChecker, b: BinaryExpr, d?: Type): Type {
	switch (b.op) {
		case BinaryOp.Add:
		case BinaryOp.Sub:
		case BinaryOp.Mul:
		case BinaryOp.Div:
		case BinaryOp.Pow:
			return checkBinaryExprHelper(t, b, [Type.Int, Type.Float], d);
		case BinaryOp.Rem:
			return checkBinaryExprHelper(t, b, [Type.Int], d);
		case BinaryOp.Lt:
		case BinaryOp.Lte:
		case BinaryOp.Gt:
		case BinaryOp.Gte:
			checkBinaryExprHelper(t, b, [Type.Int, Type.Float]);
			return Type.Bool;
		case BinaryOp.And:
			return checkBinaryExprHelper(t, b, [Type.Bool]);
		case BinaryOp.Or:
			return checkBinaryExprHelper(t, b, [Type.Bool]);
		case BinaryOp.Eq:
		case BinaryOp.NotEq:
		case BinaryOp.Id:
		case BinaryOp.NotId: {
			checkBinaryExprHelper(t, b, [check(t, b.left)]);
			return Type.Bool;
		}
		case BinaryOp.Default:
		case BinaryOp.Member: {
			const l = check(t, b.left);
			if (l.kind !== Kind.Tuple) {
				const lp = Type.print(l);
				throw new TypeError(
					`Operator . cannot be applied to non Tuple ${lp}!`,
					b.start,
					b.end
				);
			}
			if (
				b.right.type !== AstType.LitExpr ||
				typeof b.right.value !== "bigint"
			) {
				const rp = Type.print(Type.Int);
				throw new TypeError(
					`Operator . cannot be applied to Tuple and ${rp}!`,
					b.start,
					b.end
				);
			}
			if (b.right.value >= l.items.length) {
				throw new TypeError(
					`Tuple of length ${l.items.length} has no item ${b.right.value}!`,
					b.start,
					b.end
				);
			}
			return l.items[Number(b.right.value)];
		}
	}
}

function checkBinaryExprHelper(
	t: TypeChecker,
	b: BinaryExpr,
	v: Type[],
	d?: Type
): Type {
	if (d !== undefined && v.includes(d)) {
		const l = check(t, b.left, d);
		const r = check(t, b.right, d);
		if (assignable(l, d) && assignable(r, d)) {
			return d;
		}
	}
	for (const vt of v) {
		const l = check(t, b.left, vt);
		const r = check(t, b.right, vt);
		if (assignable(l, vt) && assignable(r, vt)) {
			return vt;
		}
	}
	const op = b.op;
	const lp = Type.print(check(t, b.left));
	const rp = Type.print(check(t, b.right));
	throw new TypeError(
		`Operator ${op} cannot be applied to ${lp} and ${rp}!`,
		b.start,
		b.end
	);
}

function checkUnaryExpr(t: TypeChecker, u: UnaryExpr, d?: Type): Type {
	switch (u.op) {
		case UnaryOp.Not:
			return checkUnaryExprHelper(t, u, [Type.Bool]);
		case UnaryOp.Neg:
			return checkUnaryExprHelper(t, u, [Type.Int, Type.Float], d);
		case UnaryOp.Spread:
			throw new Todo();
	}
}

function checkUnaryExprHelper(
	t: TypeChecker,
	u: UnaryExpr,
	v: Type[],
	d?: Type
): Type {
	if (d !== undefined && v.includes(d)) {
		const r = check(t, u.right, d);
		if (assignable(r, d)) {
			return d;
		}
	}
	for (const vt of v) {
		const r = check(t, u.right, vt);
		if (assignable(r, vt)) {
			return vt;
		}
	}
	const op = u.op;
	const rp = Type.print(check(t, u.right));
	throw new TypeError(
		`Operator ${op} cannot be applied to ${rp}!`,
		u.start,
		u.end
	);
}

function checkCallExpr(t: TypeChecker, c: CallExpr, _d?: Type): Type {
	const procType = check(t, c.proc);
	if (procType.kind !== Kind.Proc) {
		const found = Type.print(procType);
		throw new TypeError(`Cannot call type ${found}!`, c.proc.start, c.proc.end);
	}
	if (procType.params.length !== c.args.length) {
		const expected = procType.params.length;
		const found = c.args.length;
		throw new TypeError(
			`Expected ${expected} arguments, but got ${found}!`,
			c.start,
			c.end
		);
	}
	for (let i = 0; i < procType.params.length; i++) {
		const paramType = procType.params[i];
		const argType = check(t, c.args[i], paramType);
		if (!assignable(argType, paramType)) {
			const found = Type.print(argType);
			const declared = Type.print(paramType);
			throw new TypeError(
				`Type ${found} is not assignable to type ${declared}!`,
				c.args[i].start,
				c.args[i].end
			);
		}
	}
	return procType.returns;
}

function checkLitExpr(_t: TypeChecker, l: LitExpr, d?: Type): Type {
	// Check for allowed implicit casts of numeric literals
	if (
		d === Type.Float &&
		typeof l.value === "bigint" &&
		l.value < Number.MAX_SAFE_INTEGER
	) {
		l.value = Number(l.value);
	}
	return Type.of(l.value);
}

function checkIdExpr(t: TypeChecker, i: IdExpr, _d?: Type): Type {
	return t.values[resolveId(i)];
}

function resolveId(id: IdExpr): number {
	if (id.resolvedId === undefined) {
		throw new Error(`Unresolved id! ${JSON.stringify(id)}`);
	}
	return id.resolvedId;
}

function reifyType(t: TypeChecker, ast: Ast): Type {
	switch (ast.type) {
		case AstType.IdExpr: {
			const type = t.types[ast.value];
			if (type === undefined) {
				throw new TypeError("Undefined type!", ast.start, ast.end);
			}
			return type;
		}
		case AstType.ProcTypeExpr: {
			const params = ast.params.map((p) => reifyType(t, p));
			const returns = reifyType(t, ast.returnType);
			return Type.proc(params, returns);
		}
		case AstType.TupleExpr: {
			const items = ast.items.map((i) => reifyType(t, i));
			return Type.tuple(items);
		}
	}
	throw new Unreachable();
}

function assignable(from: Type, into: Type): boolean {
	return into === Type.Any || from === Type.Never || structurallyEq(from, into);
}
