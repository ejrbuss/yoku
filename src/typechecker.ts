import { assert } from "@std/assert/assert";
import { Builtins, BuiltinTypes } from "./builtins.ts";
import {
	AssertStmt,
	AssignStmt,
	Ast,
	AstType,
	BinaryExpr,
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
	MatchExpr,
	ModuleDecls,
	ProcDecl,
	ProcExpr,
	ReplExprs,
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
import { Scopes } from "./scopes.ts";
import {
	Kind,
	Type,
	TypePattern,
	TupleTypePattern,
	ProcTypePattern,
	StructField,
	StructType,
} from "./types.ts";
import { Span, Unreachable, zip } from "./utils.ts";

export type TypeChecker = {
	types: Scopes<Type>;
	values: Scopes<Type>;
	loops: Scopes<true>;
	returns: Type[]; // TODO probably want to include source info
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
	check: checkExternal,
};

function create(): TypeChecker {
	const values = new Scopes<Type>();
	const types = new Scopes<Type>();
	const loops = new Scopes<true>();
	for (const [id, builtin] of Object.entries(Builtins)) {
		assert(
			values.declareGlobal(id, {
				mutable: false,
				allowShadow: false,
				value: Type.of(builtin),
			})
		);
	}
	for (const [id, builtinType] of Object.entries(BuiltinTypes)) {
		assert(
			types.declareGlobal(id, {
				mutable: false,
				allowShadow: false,
				value: builtinType,
			})
		);
		assert(
			values.declareGlobal(id, {
				mutable: false,
				allowShadow: false,
				value: Type.Module,
			})
		);
	}
	return { types, values, loops, returns: [] };
}

function checkExternal(t: TypeChecker, a: Ast): Type {
	const typesSaved = t.types.copy();
	const valuesSaved = t.values.copy();
	try {
		return check(t, a);
	} catch (error) {
		t.types = typesSaved;
		t.values = valuesSaved;
		throw error;
	}
}

function declareType(t: TypeChecker, id: IdExpr, type: Type): void {
	if (
		!t.types.declareLocal(id.value, {
			mutable: false,
			allowShadow: false,
			value: type,
		}) ||
		!t.values.declareLocal(id.value, {
			mutable: false,
			allowShadow: false,
			value: Type.Module,
		})
	) {
		// TODO link original decl
		throw new TypeError("Cannot redeclare type!", id.start, id.end);
	}
}

function storeTypes(
	t: TypeChecker,
	pattern: Ast,
	type: Type,
	mutable: boolean,
	assert: boolean
): void {
	if (pattern.type === AstType.BinaryExpr) {
		if (pattern.op !== BinaryOp.As) {
			throw new Unreachable();
		}
		storeTypes(t, pattern.left, type, mutable, assert);
		storeTypes(t, pattern.right, type, mutable, assert);
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
		assertCardinality(type.items, pattern.items, pattern, "items");
		for (const [pi, ti] of zip(pattern.items, type.items)) {
			storeTypes(t, pi, ti, mutable, assert);
		}
		return;
	}
	if (pattern.type === AstType.StructExpr) {
		const constructor = reifyType(t, pattern.id, true);
		assertAssignable(type, constructor, pattern);
		if (type.kind !== Kind.Struct) {
			throw new Unreachable();
		}
		for (const pf of pattern.fieldInits) {
			const sf = assertField(type, pf.id);
			storeTypes(t, pf.expr ?? pf.id, sf.type, mutable, assert);
		}
		return;
	}
	if (pattern.type === AstType.CallExpr) {
		const constructor = reifyType(t, pattern.proc, true);
		assertAssignable(type, constructor, pattern);
		if (type.kind !== Kind.TupleStruct) {
			throw new Unreachable();
		}
		assertCardinality(type.items, pattern.args, pattern, "items");
		for (const [pi, ti] of zip(pattern.args, type.items)) {
			storeTypes(t, pi, ti, mutable, assert);
		}
		return;
	}
	if (pattern.type === AstType.WildCardExpr) {
		return;
	}
	if (pattern.type === AstType.LitExpr) {
		if (!assert) {
			throw new TypeError(
				"Cannot use literals outside an assert pattern!",
				pattern.start,
				pattern.end
			);
		}
		assertAssignable(type, Type.of(pattern.value), pattern);
		return;
	}
	if (pattern.type === AstType.IdExpr) {
		if (
			!t.values.declareLocal(pattern.value, {
				mutable,
				allowShadow: true,
				value: type,
			})
		) {
			throw new TypeError("Cannot shadow builtin!", pattern.start, pattern.end);
		}
		return;
	}
	throw new Unreachable(Ast.print(pattern));
}

function check(t: TypeChecker, ast: Ast, d?: TypePattern): Type {
	switch (ast.type) {
		case AstType.ModuleDecls:
			return checkModule(t, ast, d);
		case AstType.ReplExprs:
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

function checkModule(t: TypeChecker, m: ModuleDecls, _d?: TypePattern): Type {
	for (const decl of m.decls) {
		check(t, decl);
	}
	return Type.Any;
}

function checkRepl(t: TypeChecker, r: ReplExprs, d?: TypePattern): Type {
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
	storeTypes(t, d.pattern, resolvedType, d.mutable, d.assert);
	return Type.Any;
}

function checkProcDecl(t: TypeChecker, p: ProcDecl, _d?: TypePattern): Type {
	if (!t.values.inGlobalScope) {
		console.log(t.values);
		console.log(Ast.print(p));
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
		params.push(paramType);
	}
	let returns: Type = Type.Unit;
	if (p.initExpr.returnType !== undefined) {
		returns = reifyType(t, p.initExpr.returnType, true);
	}
	storeTypes(t, p.id, Type.proc(params, returns), false, false);
	check(t, p.initExpr, returns);
	return Type.Any;
}

function checkTypeDecl(t: TypeChecker, d: TypeDecl, _d?: TypePattern): Type {
	if (!t.values.inGlobalScope) {
		throw new Unreachable();
	}
	const type = assertReconciled(reifyType(t, d.typeExpr, true), d.id);
	declareType(t, d.id, type);
	d.resolvedType = type;
	return Type.Any;
}

function checkStructDecl(
	t: TypeChecker,
	s: StructDecl,
	_d?: TypePattern
): Type {
	if (!t.values.inGlobalScope) {
		throw new Unreachable();
	}
	if (s.fields !== undefined) {
		const fields: StructField[] = [];
		for (const field of s.fields) {
			if (field.expr) {
				const declType =
					field.typeDecl === undefined
						? Type._
						: reifyType(t, field.typeDecl, false);
				const initType = check(t, field.expr);
				const fieldType = assertAssignable(initType, declType, field.id);
				fields.push({
					mutable: field.mutable,
					name: field.id.value,
					type: fieldType,
					defaultExpr: field.expr,
				});
			} else {
				if (field.typeDecl === undefined) {
					throw new TypeError(
						"Field requires a type or initializer!",
						field.id.start,
						field.id.end
					);
				}
				fields.push({
					mutable: field.mutable,
					name: field.id.value,
					type: reifyType(t, field.typeDecl, true),
				});
			}
		}
		const type = Type.struct(s.id.value, fields);
		declareType(t, s.id, type);
		s.resolvedType = type;
	} else if (s.tupleExpr !== undefined) {
		const items: Type[] = [];
		for (const item of s.tupleExpr.items) {
			items.push(reifyType(t, item, true));
		}
		const type = Type.tupleStruct(s.id.value, items);
		s.resolvedType = type;
		declareType(t, s.id, type);
	} else {
		throw new Unreachable();
	}
	return Type.Any;
}

function checkTestDecl(t: TypeChecker, d: TestDecl, _d?: TypePattern): Type {
	if (!t.values.inGlobalScope) {
		throw new Unreachable();
	}
	check(t, d.thenExpr);
	return Type.Any;
}

function checkBreakStmt(t: TypeChecker, b: BreakStmt, _d?: TypePattern): Type {
	if (t.loops.inGlobalScope) {
		throw new TypeError("Cannot break outside a loop!", b.start, b.end);
	}
	if (b.label !== undefined && t.loops.get(b.label.value) === undefined) {
		throw new TypeError("Undeclared label!", b.start, b.end);
	}
	return Type.Unit;
}

function checkContinueStmt(
	t: TypeChecker,
	c: ContinueStmt,
	_d?: TypePattern
): Type {
	if (t.loops.inGlobalScope) {
		throw new TypeError("Cannot break continue a loop!", c.start, c.end);
	}
	if (c.label !== undefined && t.loops.get(c.label.value) === undefined) {
		throw new TypeError("Undeclared label!", c.start, c.end);
	}
	return Type.Unit;
}

function checkReturnStmt(t: TypeChecker, r: ReturnStmt, d?: TypePattern): Type {
	if (t.values.inGlobalScope) {
		throw new TypeError("Cannot return outside a proc!", r.start, r.end);
	}
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
	if (a.target === undefined) {
		const decl = t.values.getDecl(a.id.value);
		if (decl === undefined) {
			throw new TypeError("Undeclared variable!", a.id.start, a.id.end);
		}
		if (!decl.mutable) {
			throw new TypeError("Cannot assign to a const!", a.id.start, a.id.end);
		}
		const into = check(t, a.id);
		const from = check(t, a.expr, into);
		assertAssignable(from, into, a.id);
	} else {
		const targetType = check(t, a.target);
		if (targetType.kind === Kind.Struct) {
			const field = assertField(targetType, a.id);
			if (!field.mutable) {
				throw new TypeError("Cannot assign to a const!", a.id.start, a.id.end);
			}
			const into = field.type;
			const from = check(t, a.expr, into);
			assertAssignable(from, into, a.id);
		} else {
			const f = Type.print(targetType);
			throw new TypeError(
				`Expected a struct or enum, found ${f}!`,
				a.target.start,
				a.target.end
			);
		}
	}
	return Type.Unit;
}

function checkLoopStmt(t: TypeChecker, l: LoopStmt, _d?: TypePattern): Type {
	t.loops.openScope();
	if (l.label !== undefined) {
		t.loops.declareLocal(l.label.value, {
			mutable: false,
			allowShadow: true,
			value: true,
		});
	}
	check(t, l.thenExpr);
	t.loops.dropScope();
	return Type.Unit;
}

function checkWhileStmt(t: TypeChecker, w: WhileStmt, _d?: TypePattern): Type {
	const from = check(t, w.testExpr, Type.Bool);
	assertAssignable(from, Type.Bool, w.testExpr);
	t.loops.openScope();
	check(t, w.thenExpr);
	t.loops.dropScope();
	return Type.Any;
}

function checkExprStmt(t: TypeChecker, e: ExprStmt, d?: TypePattern): Type {
	return check(t, e.expr, d);
}

function checkBlockExpr(t: TypeChecker, b: BlockExpr, d?: TypePattern): Type {
	let type: Type = Type.Unit;
	t.values.openScope();
	for (const stmt of b.stmts) {
		check(t, stmt);
	}
	if (b.stmts.length > 0) {
		type = check(t, b.stmts[b.stmts.length - 1], d);
	}
	t.values.dropScope();
	return type;
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
	const initialized: string[] = [];
	for (const fieldInit of s.fieldInits) {
		if (initialized.includes(fieldInit.id.value)) {
			throw new TypeError(
				`Duplicate field initializer!`,
				fieldInit.id.start,
				fieldInit.id.end
			);
		}
		const field = assertField(type, fieldInit.id);
		initialized.push(fieldInit.id.value);
		const fieldType = check(t, fieldInit.expr ?? fieldInit.id, field.type);
		assertAssignable(fieldType, field.type, fieldInit.expr ?? fieldInit.id);
	}

	if (s.spreadInit !== undefined) {
		const spreadType = check(t, s.spreadInit, type);
		assertAssignable(spreadType, type, s.spreadInit);
	} else {
		const unintialized: string[] = [];
		for (const field of type.fields) {
			if (!field.defaultExpr) {
				unintialized.push(field.name);
			}
		}
		for (const field of unintialized) {
			if (!initialized.includes(field)) {
				throw new TypeError(
					`Missing initializer for ${field}!`,
					s.start,
					s.end
				);
			}
		}
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
		storeTypes(t, i.pattern, from, i.mutable, true);
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
			storeTypes(t, c.pattern, from, false, true);
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
	t.values.openScope();
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
		storeTypes(t, param.pattern, type, false, false);
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
	t.values.dropScope();
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
			if (l.kind === Kind.Tuple || l.kind === Kind.TupleStruct) {
				if (
					b.right.type !== AstType.LitExpr ||
					typeof b.right.value !== "bigint"
				) {
					const lp = Type.print(l);
					const rp = Type.print(check(t, b.right));
					throw new TypeError(
						`Operator . cannot be applied to ${lp} and ${rp}!`,
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
			if (l.kind === Kind.Struct) {
				if (b.right.type !== AstType.IdExpr) {
					const lp = Type.print(l);
					const rp = Type.print(check(t, b.right));
					throw new TypeError(
						`Operator . cannot be applied to ${lp} and ${rp}!`,
						b.start,
						b.end
					);
				}
				const field = l.fields.find(
					(f) => f.name === (b.right as IdExpr).value
				);
				if (field === undefined) {
					const struct = l.name;
					const field = b.right.value;
					throw new TypeError(
						`Struct ${struct} has no field ${field}!`,
						b.start,
						b.end
					);
				}
				return field.type;
			}
			return checkBinaryExprHelper(t, b, []);
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
	const callee = check(t, c.proc);
	if (callee.kind === Kind.Proc) {
		assertCardinality(callee.params, c.args, c, "arguments");
		for (const [arg, param] of zip(c.args, callee.params)) {
			const argType = check(t, arg, param);
			assertAssignable(argType, param, arg);
		}
		c.resolvedType = callee.returns;
		return callee.returns;
	}
	if (callee === Type.Module && c.proc.type === AstType.IdExpr) {
		const type = t.types.get(c.proc.value);
		if (type !== undefined && type.kind === Kind.TupleStruct) {
			for (const [arg, item] of zip(c.args, type.items)) {
				const argType = check(t, arg, item);
				assertAssignable(argType, item, arg);
			}
			c.resolvedType = type;
			return type;
		}
	}
	const found = Type.print(callee);
	throw new TypeError(`Cannot call type ${found}!`, c.proc.start, c.proc.end);
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
	const type = t.values.get(i.value);
	if (type === undefined) {
		throw new TypeError("Undeclared variable!", i.start, i.end);
	}
	return type;
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
		const type = t.types.get(ast.value);
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
			`Type ${f} is not assignable to ${t}!`,
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
			`Type ${f} cannot be asserted into ${t}!`,
			span.start,
			span.end
		);
	}
	return reconciled;
}

function assertCardinality(
	expected: unknown[],
	found: unknown[],
	span: Span,
	subject: string
): void {
	if (expected.length !== found.length) {
		const e = expected.length;
		const f = found.length;
		throw new TypeError(
			`Expected ${e} ${subject}, found ${f}!`,
			span.start,
			span.end
		);
	}
}

function assertField(type: StructType, id: IdExpr): StructField {
	for (const field of type.fields) {
		if (field.name === id.value) {
			return field;
		}
	}
	const f = id.value;
	const s = Type.print(type);
	throw new TypeError(`No field ${f} on type ${s}!`, id.start, id.end);
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
