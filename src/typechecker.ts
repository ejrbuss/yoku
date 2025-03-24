import {
	AssertStmt,
	AssignStmt,
	Ast,
	AstType,
	BinaryExpr,
	BlockExpr,
	CallExpr,
	ExprStmt,
	GroupExpr,
	IdExpr,
	IfExpr,
	LitExpr,
	LoopStmt,
	MatchExpr,
	Module,
	ProcDecl,
	ProcExpr,
	Repl,
	ReturnStmt,
	StructDecl,
	StructExpr,
	TestDecl,
	ThrowExpr,
	TupleExpr,
	TypeDecl,
	TypeExpr,
	UnaryExpr,
	VarDecl,
	WhileStmt,
} from "./core.ts";
import { BinaryOp, UnaryOp } from "./ops.ts";
import {
	Kind,
	Type,
	TypePattern,
	TupleTypePattern,
	ProcTypePattern,
} from "./types.ts";
import { Span, Unreachable, zip } from "./utils.ts";

export type TypeChecker = {
	inGlobalScope: boolean;
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

export const TypeChecker = {
	create,
	check,
	declareBuiltinType,
	declareBuiltin,
};

function create(): TypeChecker {
	const t: TypeChecker = {
		inGlobalScope: true,
		types: {},
		values: [],
		returns: [],
	};
	declareBuiltinType(t, "Type", Type.Type);
	declareBuiltinType(t, "Any", Type.Any);
	declareBuiltinType(t, "Never", Type.Never);
	declareBuiltinType(t, "Unit", Type.Unit);
	declareBuiltinType(t, "Bool", Type.Bool);
	declareBuiltinType(t, "Int", Type.Int);
	declareBuiltinType(t, "Float", Type.Float);
	declareBuiltinType(t, "Str", Type.Str);
	return t;
}

function declareBuiltinType(t: TypeChecker, name: string, type: Type) {
	t.types[name] = type as Type;
}

function declareType(
	t: TypeChecker,
	name: string,
	type: Type,
	span: Span
): void {
	if (t.types[name] !== undefined) {
		throw new TypeError(`Cannot redeclare type ${name}!`, span.start, span.end);
	}
	t.types[name] = type;
}

function declareBuiltin(t: TypeChecker, id: number, type: Type): void {
	t.values[id] = type as Type;
}

function storeTypes(t: TypeChecker, pattern: Ast, type: Type): void {
	if (pattern.type === AstType.BinaryExpr) {
		if (pattern.op !== BinaryOp.As) {
			throw new Unreachable();
		}
		storeTypes(t, pattern.left, type);
		storeTypes(t, pattern.right, type);
		return;
	}
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
		for (const [pi, ti] of zip(pattern.items, type.items)) {
			storeTypes(t, pi, ti);
		}
		return;
	}
	if (pattern.type === AstType.WildCardExpr) {
		return;
	}
	if (pattern.type === AstType.LitExpr) {
		assertAssignable(type, Type.of(pattern.value), pattern);
		return;
	}
	if (pattern.type === AstType.IdExpr) {
		t.values[resolveId(pattern)] = assertReconciled(type, pattern);
		return;
	}
	throw new Unreachable();
}

function check(t: TypeChecker, ast: Ast, d?: TypePattern): Type {
	switch (ast.type) {
		case AstType.Module:
			return checkModule(t, ast, d);
		case AstType.Repl:
			return checkRepl(t, ast, d);
		case AstType.VarDecl:
			return checkVarDecl(t, ast, d);
		case AstType.ProcDecl:
			return checkProcDecl(t, ast, d);
		case AstType.TypeDecl:
			return checkTypeDecl(t, ast, d);
		case AstType.StructDecl:
			return checkStructDecl(t, ast, d);
		case AstType.TestDecl:
			return checkTestDecl(t, ast, d);
		case AstType.BreakStmt:
			return Type.Unit;
		case AstType.ContinueStmt:
			return Type.Unit;
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
		case AstType.StructExpr:
			return checkStructExpr(t, ast, d);
		case AstType.GroupExpr:
			return checkGroupExpr(t, ast, d);
		case AstType.IfExpr:
			return checkIfExpr(t, ast, d);
		case AstType.MatchExpr:
			return checkMatchExpr(t, ast, d);
		case AstType.ThrowExpr:
			return checkThrowExpr(t, ast, d);
		case AstType.ProcExpr:
			return checkProcExpr(t, ast, d);
		case AstType.TypeExpr:
			return checkTypeExpr(t, ast, d);
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

function checkModule(t: TypeChecker, m: Module, _d?: TypePattern): Type {
	for (const decl of m.decls) {
		check(t, decl);
	}
	return Type.Any;
}

function checkRepl(t: TypeChecker, r: Repl, d?: TypePattern): Type {
	let acc: Type = Type.Unit;
	for (const line of r.lines) {
		acc = check(t, line, d);
	}
	return acc;
}

function checkVarDecl(t: TypeChecker, d: VarDecl, _d?: TypePattern): Type {
	let resolvedType: Type;
	let declType: undefined | TypePattern;
	if (d.declType !== undefined) {
		declType = reifyType(t, d.declType, false);
	}
	const initType = check(t, d.initExpr, declType);
	if (declType !== undefined) {
		if (d.assert) {
			resolvedType = assertAssertable(initType, declType, d.pattern);
		} else {
			resolvedType = assertAssignable(initType, declType, d.pattern);
		}
	} else {
		resolvedType = assertReconciled(initType, d.initExpr);
	}
	d.resolvedType = resolvedType;
	storeTypes(t, d.pattern, resolvedType);
	return Type.Any;
}

function checkProcDecl(t: TypeChecker, p: ProcDecl, _d?: TypePattern): Type {
	if (!t.inGlobalScope) {
		throw new Unreachable();
	}
	const params: Type[] = [];
	for (const param of p.initExpr.params) {
		if (param.declType === undefined) {
			throw new TypeError(
				"Params in proc declarations require type annotations!",
				param.pattern.start,
				param.pattern.end
			);
		}
		const paramType = reifyType(t, param.declType, true);
		storeTypes(t, param.pattern, paramType);
		params.push(paramType);
	}
	let returns: Type = Type.Unit;
	if (p.initExpr.returnType !== undefined) {
		returns = reifyType(t, p.initExpr.returnType, true);
	}
	storeTypes(t, p.id, Type.proc(params, returns));
	check(t, p.initExpr, returns);
	return Type.Any;
}

function checkTypeDecl(t: TypeChecker, d: TypeDecl, _d?: TypePattern): Type {
	if (!t.inGlobalScope) {
		throw new Unreachable();
	}
	const type = assertReconciled(reifyType(t, d.typeExpr, true), d.id);
	declareType(t, d.id.value, type, d.id);
	return Type.Any;
}

function checkStructDecl(
	t: TypeChecker,
	s: StructDecl,
	_d?: TypePattern
): Type {
	if (!t.inGlobalScope) {
		throw new Unreachable();
	}
	// TODO fixme
	const type = Type.struct(s.id.value, []) as Type;
	declareType(t, s.id.value, type, s.id);
	return Type.Any;
}

function checkTestDecl(t: TypeChecker, d: TestDecl, _d?: TypePattern): Type {
	if (!t.inGlobalScope) {
		throw new Unreachable();
	}
	check(t, d.thenExpr);
	return Type.Any;
}

function checkReturnStmt(t: TypeChecker, r: ReturnStmt, d?: TypePattern): Type {
	const type = r.expr !== undefined ? check(t, r.expr, d) : Type.Unit;
	t.returns.push(type);
	return type;
}

function checkAssertStmt(
	t: TypeChecker,
	a: AssertStmt,
	_d?: TypePattern
): Type {
	check(t, a.testExpr);
	return Type.Unit;
}

function checkAssignStmt(
	t: TypeChecker,
	a: AssignStmt,
	_d?: TypePattern
): Type {
	const resolvedId = resolveId(a.id);
	const into = t.values[resolvedId];
	const from = check(t, a.expr, into);
	assertAssignable(from, into, a.id);
	return Type.Unit;
}

function checkLoopStmt(t: TypeChecker, l: LoopStmt, _d?: TypePattern): Type {
	check(t, l.thenExpr);
	return Type.Unit;
}

function checkWhileStmt(t: TypeChecker, w: WhileStmt, _d?: TypePattern): Type {
	const from = check(t, w.testExpr, Type.Bool);
	assertAssignable(from, Type.Bool, w.testExpr);
	check(t, w.thenExpr);
	return Type.Any;
}

function checkExprStmt(t: TypeChecker, e: ExprStmt, d?: TypePattern): Type {
	return check(t, e.expr, d);
}

function checkBlockExpr(t: TypeChecker, b: BlockExpr, d?: TypePattern): Type {
	for (const stmt of b.stmts) {
		check(t, stmt);
	}
	if (b.stmts.length > 0) {
		return check(t, b.stmts[b.stmts.length - 1], d);
	}
	return Type.Unit;
}

function checkTupleExpr(t: TypeChecker, u: TupleExpr, d?: TypePattern): Type {
	const items: Type[] = [];
	for (const [ui, ti] of zip(u.items, closestTuple(d).items)) {
		items.push(check(t, ui, ti));
	}
	const type = Type.tuple(items);
	u.resolvedType = type;
	return type;
}

function checkStructExpr(
	t: TypeChecker,
	s: StructExpr,
	_d?: TypePattern
): Type {
	const type = reifyType(t, s.id, true);
	if (type.kind !== Kind.Struct) {
		const tp = Type.print(type);
		throw new TypeError(
			`Type ${tp} is not constructable!`,
			s.id.start,
			s.id.end
		);
	}
	s.resolvedType = type;
	return type;
}

function checkGroupExpr(t: TypeChecker, g: GroupExpr, d?: TypePattern): Type {
	return check(t, g.expr, d);
}

function checkIfExpr(t: TypeChecker, i: IfExpr, d?: TypePattern): Type {
	if (i.pattern !== undefined) {
		let declType: undefined | TypePattern;
		if (i.declType !== undefined) {
			declType = reifyType(t, i.declType, false);
		}
		const from = check(t, i.testExpr, declType);
		if (declType !== undefined) {
			i.resolvedDeclType = assertAssertable(from, declType, i.pattern);
		}
		storeTypes(t, i.pattern, from);
	} else {
		const from = check(t, i.testExpr, Type.Bool);
		assertAssignable(from, Type.Bool, i.testExpr);
	}
	const thenType = check(t, i.thenExpr, d);
	if (i.elseExpr !== undefined) {
		const elseType = check(t, i.elseExpr, d);
		return union([thenType, elseType]);
	}
	return union([thenType, Type.Unit]);
}

function checkMatchExpr(t: TypeChecker, m: MatchExpr, d?: TypePattern): Type {
	let from: Type = Type.Unit;
	if (m.testExpr !== undefined) {
		from = check(t, m.testExpr, Type.Bool);
	}
	const caseTypes: Type[] = [];
	let exhausted = false;
	for (const c of m.cases) {
		if (c.pattern !== undefined) {
			storeTypes(t, c.pattern, from);
			if (c.declType !== undefined) {
				const into = reifyType(t, c.declType, false);
				c.resolvedDeclType = assertAssertable(from, into, c.pattern);
			}
		}
		if (c.testExpr !== undefined) {
			const from = check(t, c.testExpr, Type.Bool);
			assertAssignable(from, Type.Bool, c.testExpr);
		}
		// Exhaustive if this is an else case
		if (c.pattern === undefined && c.testExpr === undefined) {
			exhausted = true;
		}
		// Exhaustive if this is a wildcard case with an assignable type
		if (
			c.pattern !== undefined &&
			c.pattern.type === AstType.WildCardExpr &&
			c.testExpr === undefined &&
			(c.declType === undefined ||
				Type.assignable(from, reifyType(t, c.declType, false)))
		) {
			exhausted = true;
		}
		caseTypes.push(check(t, c.thenExpr, d));
	}
	if (!exhausted) {
		caseTypes.push(Type.Unit);
	}
	return union(caseTypes);
}

function checkThrowExpr(t: TypeChecker, e: ThrowExpr, _d?: TypePattern): Type {
	check(t, e.expr);
	return Type.Never;
}

function checkProcExpr(t: TypeChecker, p: ProcExpr, d?: TypePattern): Type {
	const params: Type[] = [];
	const destination = closestProc(d);
	for (const [param, dParam] of zip(p.params, destination.params)) {
		let paramType: undefined | TypePattern;
		if (param.declType !== undefined) {
			paramType = reifyType(t, param.declType, false);
		}
		paramType ??= dParam;
		if (paramType === undefined) {
			throw new TypeError(
				"Params require type annotations if there is no destination type!",
				param.pattern.start,
				param.pattern.end
			);
		}
		const type = assertReconciled(paramType, param.pattern);
		storeTypes(t, param.pattern, type);
		params.push(type);
	}
	let returns: TypePattern = destination.returns;
	if (p.returnType !== undefined) {
		returns = reifyType(t, p.returnType, false);
	}
	const returnsSave = t.returns;
	t.returns = [];
	const implicitReturn = check(t, p.implExpr, returns);
	if (
		t.returns.length === 0 &&
		returns !== Type._ &&
		Type.assignable(returns, Type.Unit)
	) {
		returns = Type.Unit;
		p.discardReturn = true;
	} else {
		if (implicitReturn !== undefined) {
			t.returns.push(implicitReturn);
		}
		if (returns === Type._) {
			returns = union(t.returns);
		}
		for (const r of t.returns) {
			assertAssignable(r, returns, p);
		}
	}
	const type = Type.proc(params, assertReconciled(returns, p));
	t.returns = returnsSave;
	p.resolvedType = type;
	return type;
}

function checkTypeExpr(t: TypeChecker, e: TypeExpr, _d?: TypePattern): Type {
	e.resolvedType = reifyType(t, e, true);
	// TODO eventually, Type should be a parameterized type Type[T]
	return Type.Type;
}

function checkBinaryExpr(t: TypeChecker, b: BinaryExpr, d?: TypePattern): Type {
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
		case BinaryOp.As:
			throw new Unreachable();
	}
}

function checkBinaryExprHelper(
	t: TypeChecker,
	b: BinaryExpr,
	v: Type[],
	d?: TypePattern
): Type {
	if (d !== undefined && v.includes(d as Type)) {
		const l = check(t, b.left, d);
		const r = check(t, b.right, d);
		if (Type.assignable(l, d) && Type.assignable(r, d)) {
			return d as Type;
		}
	}
	for (const vt of v) {
		const l = check(t, b.left, vt);
		const r = check(t, b.right, vt);
		if (Type.assignable(l, vt) && Type.assignable(r, vt)) {
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

function checkUnaryExpr(t: TypeChecker, u: UnaryExpr, d?: TypePattern): Type {
	switch (u.op) {
		case UnaryOp.Not:
			return checkUnaryExprHelper(t, u, [Type.Bool]);
		case UnaryOp.Neg:
			return checkUnaryExprHelper(t, u, [Type.Int, Type.Float], d);
	}
}

function checkUnaryExprHelper(
	t: TypeChecker,
	u: UnaryExpr,
	v: Type[],
	d?: TypePattern
): Type {
	if (d !== undefined && v.includes(d as Type)) {
		const r = check(t, u.right, d);
		if (Type.assignable(r, d)) {
			return d as Type;
		}
	}
	for (const vt of v) {
		const r = check(t, u.right, vt);
		if (Type.assignable(r, vt)) {
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

function checkCallExpr(t: TypeChecker, c: CallExpr, _d?: TypePattern): Type {
	const procType = check(t, c.proc);
	if (procType.kind !== Kind.Proc) {
		const found = Type.print(procType);
		throw new TypeError(`Cannot call type ${found}!`, c.proc.start, c.proc.end);
	}
	if (c.args.length !== procType.params.length) {
		const expected = procType.params.length;
		const found = c.args.length;
		throw new TypeError(
			`Expected ${expected} arguments, but got ${found}!`,
			c.start,
			c.end
		);
	}
	for (const [arg, param] of zip(c.args, procType.params)) {
		const argType = check(t, arg, param);
		assertAssignable(argType, param, arg);
	}
	return procType.returns;
}

function checkLitExpr(_t: TypeChecker, l: LitExpr, d?: TypePattern): Type {
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

function checkIdExpr(t: TypeChecker, i: IdExpr, _d?: TypePattern): Type {
	return t.values[resolveId(i)];
}

function resolveId(id: IdExpr): number {
	if (id.resolvedId === undefined) {
		throw new Error(`Unresolved id! ${Ast.print(id)}`);
	}
	return id.resolvedId;
}

function reifyType<B extends boolean>(
	t: TypeChecker,
	ast: Ast,
	strict: B
): B extends true ? Type : TypePattern {
	if (ast.type === AstType.TypeExpr) {
		return reifyType(t, ast.expr, strict);
	}
	if (ast.type === AstType.TupleExpr) {
		const items: TypePattern[] = [];
		for (const item of ast.items) {
			items.push(reifyType(t, item, strict));
		}
		return Type.tuple(items) as Type;
	}
	if (ast.type === AstType.ProcTypeExpr) {
		const params: TypePattern[] = [];
		for (const param of ast.params) {
			params.push(reifyType(t, param, strict));
		}
		const returns = reifyType(t, ast.returnType, strict);
		return Type.proc(params, returns) as Type;
	}
	if (ast.type === AstType.WildCardExpr) {
		if (strict) {
			throw new TypeError(
				"Cannot use a wildcard type here!",
				ast.start,
				ast.end
			);
		}
		return Type._ as unknown as Type;
	}
	if (ast.type === AstType.IdExpr) {
		const type = t.types[ast.value];
		if (type === undefined) {
			throw new TypeError("Undefined type!", ast.start, ast.end);
		}
		return type;
	}
	throw new Unreachable();
}

function assertReconciled(type: TypePattern, span: Span): Type {
	return assertAssignable(type, type, span);
}

function assertAssignable(
	from: TypePattern,
	into: TypePattern,
	span: Span
): Type {
	const reconciled = Type.assignable(from, into);
	if (reconciled === undefined) {
		const f = Type.print(from);
		const t = Type.print(into);
		throw new TypeError(
			`Type ${f} is not assignable to ${t}`,
			span.start,
			span.end
		);
	}
	return reconciled;
}

function assertAssertable(
	from: TypePattern,
	into: TypePattern,
	span: Span
): Type {
	const reconciled = Type.assertable(from, into);
	if (reconciled === undefined) {
		const f = Type.print(from);
		const t = Type.print(into);
		throw new TypeError(
			`Type ${f} cannot be asserted into ${t}`,
			span.start,
			span.end
		);
	}
	return reconciled;
}

function closestTuple(type?: TypePattern): TupleTypePattern {
	if (type === undefined || type.kind !== Kind.Tuple) {
		return Type.Unit;
	}
	return type;
}

function closestProc(type?: TypePattern): ProcTypePattern {
	if (type === undefined || type.kind !== Kind.Proc) {
		return Type.proc([], Type._);
	}
	return type;
}

function union(types: Type[]): Type {
	outer: for (const target of types) {
		for (const type of types) {
			if (!Type.assignable(type, target)) {
				continue outer;
			}
		}
		return target;
	}
	return Type.Any;
}
