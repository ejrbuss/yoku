import { assert } from "@std/assert/assert";
import { Builtins, BuiltinTypes } from "./builtins.ts";
import {
	AstAssertStmt,
	AstAssignVarStmt,
	Ast,
	AstTag,
	BinaryExpr,
	BlockExpr,
	AstBreakStmt,
	CallExpr,
	AstContinueStmt,
	AstExprStmt,
	GroupExpr,
	IdExpr,
	IfExpr,
	LitExpr,
	AstLoopStmt,
	MatchExpr,
	AstModule,
	ProcExpr,
	AstReturnStmt,
	AstStructDecl,
	StructExpr,
	ThrowExpr,
	TupleExpr,
	TypeExpr,
	UnaryExpr,
	AstAssignFieldStmt,
	AstTypeDecl,
	AstVarDecl,
	AstTestDecl,
	AstProcDecl,
	AstEnumDecl,
} from "./ast.ts";
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
	EnumType,
} from "./types.ts";
import { Span, Todo, Unreachable, zip, zipLeft } from "./utils.ts";
import { Struct } from "./core.ts";
import { kMaxLength } from "node:buffer";

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
	if (pattern.tag === AstTag.BinaryExpr) {
		if (pattern.op !== BinaryOp.As) {
			throw new Unreachable();
		}
		storeTypes(t, pattern.left, type, mutable, assert);
		storeTypes(t, pattern.right, type, mutable, assert);
		return;
	}
	if (pattern.tag === AstTag.TupleExpr) {
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
	if (pattern.tag === AstTag.StructExpr) {
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
	if (pattern.tag === AstTag.CallExpr) {
		const constructor = reifyType(t, pattern.proc, true);
		assertAssignable(type, constructor, pattern);
		if (type.kind !== Kind.Struct) {
			throw new Unreachable();
		}
		assertCardinality(type.fields, pattern.args, pattern, "fields");
		for (const [pf, tf] of zip(pattern.args, type.fields)) {
			storeTypes(t, pf, tf.type, mutable, assert);
		}
		return;
	}
	if (pattern.tag === AstTag.WildCardExpr) {
		return;
	}
	if (pattern.tag === AstTag.LitExpr) {
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
	if (pattern.tag === AstTag.IdExpr) {
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
	switch (ast.tag) {
		case AstTag.Module:
			return checkModule(t, ast, d);
		case AstTag.VarDecl:
			return checkVarDecl(t, ast, d);
		case AstTag.ProcDecl:
			return checkProcDecl(t, ast, d);
		case AstTag.TypeDecl:
			return checkTypeDecl(t, ast, d);
		case AstTag.StructDecl:
			return checkStructDecl(t, ast, d);
		case AstTag.EnumDecl:
			return checkEnumDecl(t, ast, d);
		case AstTag.TestDecl:
			return checkTestDecl(t, ast, d);
		case AstTag.BreakStmt:
			return checkBreakStmt(t, ast, d);
		case AstTag.ContinueStmt:
			return checkContinueStmt(t, ast, d);
		case AstTag.ReturnStmt:
			return checkReturnStmt(t, ast, d);
		case AstTag.AssertStmt:
			return checkAssertStmt(t, ast, d);
		case AstTag.AssignVarStmt:
			return checkAssignVarStmt(t, ast, d);
		case AstTag.AssignFieldStmt:
			return checkAssignFieldStmt(t, ast, d);
		case AstTag.LoopStmt:
			return checkLoopStmt(t, ast, d);
		case AstTag.ExprStmt:
			return checkExprStmt(t, ast, d);
		case AstTag.BlockExpr:
			return checkBlockExpr(t, ast, d);
		case AstTag.TupleExpr:
			return checkTupleExpr(t, ast, d);
		case AstTag.StructExpr:
			return checkStructExpr(t, ast, d);
		case AstTag.GroupExpr:
			return checkGroupExpr(t, ast, d);
		case AstTag.IfExpr:
			return checkIfExpr(t, ast, d);
		case AstTag.MatchExpr:
			return checkMatchExpr(t, ast, d);
		case AstTag.ThrowExpr:
			return checkThrowExpr(t, ast, d);
		case AstTag.ProcExpr:
			return checkProcExpr(t, ast, d);
		case AstTag.TypeExpr:
			return checkTypeExpr(t, ast, d);
		case AstTag.BinaryExpr:
			return checkBinaryExpr(t, ast, d);
		case AstTag.UnaryExpr:
			return checkUnaryExpr(t, ast, d);
		case AstTag.CallExpr:
			return checkCallExpr(t, ast, d);
		case AstTag.LitExpr:
			return checkLitExpr(t, ast, d);
		case AstTag.IdExpr:
			return checkIdExpr(t, ast, d);
		case AstTag.ProcTypeExpr:
			throw new Unreachable();
		case AstTag.WildCardExpr:
			throw new Unreachable();
	}
}

function checkModule(t: TypeChecker, m: AstModule, _d?: TypePattern): Type {
	let result: Type = Type.Unit;
	for (const decl of m.decls) {
		result = check(t, decl);
	}
	return m.replMode ? result : Type.Any;
}

function checkVarDecl(t: TypeChecker, d: AstVarDecl, _d?: TypePattern): Type {
	let resolvedType: Type;
	let declType: undefined | TypePattern;
	if (d.typeAnnotation !== undefined) {
		declType = reifyType(t, d.typeAnnotation, false);
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

function checkProcDecl(t: TypeChecker, p: AstProcDecl, _d?: TypePattern): Type {
	const params: Type[] = [];
	for (const param of p.initExpr.params) {
		if (param.declType === undefined) {
			throw new TypeError(
				"Top level proc params require type annotations!",
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
	const type = Type.proc(params, returns);
	storeTypes(t, p.id, type, false, false);
	check(t, p.initExpr);
	return type;
}

function checkTypeDecl(t: TypeChecker, d: AstTypeDecl, _d?: TypePattern): Type {
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
	s: AstStructDecl,
	_d?: TypePattern
): Type {
	if (!t.values.inGlobalScope) {
		throw new Unreachable();
	}
	const type = reifyType(t, s, true);
	declareType(t, s.id, type);
	s.resolvedType = type;
	return Type.Any;
}

function checkEnumDecl(t: TypeChecker, e: AstEnumDecl, _d?: TypePattern): Type {
	if (!t.values.inGlobalScope) {
		throw new Unreachable();
	}
	const variants: StructType[] = [];
	for (const variant of e.variants) {
		const type = reifyType(t, variant, true);
		assert(type.kind === Kind.Struct);
		variants.push(type);
	}
	const type = Type.enum(e.id.value, variants);
	declareType(t, e.id, type);
	e.resolvedType = type;
	return Type.Any;
}

function checkTestDecl(t: TypeChecker, d: AstTestDecl, _d?: TypePattern): Type {
	if (!t.values.inGlobalScope) {
		throw new Unreachable();
	}
	check(t, d.thenExpr);
	return Type.Any;
}

function checkBreakStmt(
	t: TypeChecker,
	b: AstBreakStmt,
	_d?: TypePattern
): Type {
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
	c: AstContinueStmt,
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

function checkReturnStmt(
	t: TypeChecker,
	r: AstReturnStmt,
	d?: TypePattern
): Type {
	if (t.values.inGlobalScope) {
		throw new TypeError("Cannot return outside a proc!", r.start, r.end);
	}
	const type = r.expr !== undefined ? check(t, r.expr, d) : Type.Unit;
	t.returns.push(type);
	return type;
}

function checkAssertStmt(
	t: TypeChecker,
	a: AstAssertStmt,
	_d?: TypePattern
): Type {
	check(t, a.testExpr);
	return Type.Unit;
}

function checkAssignVarStmt(
	t: TypeChecker,
	a: AstAssignVarStmt,
	_d?: TypePattern
): Type {
	const decl = t.values.getDecl(a.target.value);
	if (decl === undefined) {
		throw new TypeError("Undeclared variable!", a.target.start, a.target.end);
	}
	if (!decl.mutable) {
		throw new TypeError(
			"Cannot assign to a const!",
			a.target.start,
			a.target.end
		);
	}
	const into = check(t, a.target);
	const from = check(t, a.expr, into);
	assertAssignable(from, into, a.target);
	return Type.Any;
}

function checkAssignFieldStmt(
	t: TypeChecker,
	a: AstAssignFieldStmt,
	_d?: TypePattern
): Type {
	const targetType = check(t, a.target);
	if (targetType.kind === Kind.Struct) {
		const field = assertField(targetType, a.field);
		if (!field.mutable) {
			throw new TypeError(
				"Cannot assign to a const!",
				a.field.start,
				a.field.end
			);
		}
		const into = field.type;
		const from = check(t, a.expr, into);
		assertAssignable(from, into, a.field);
	} else {
		const f = Type.print(targetType);
		throw new TypeError(
			`Expected a struct or enum, found ${f}!`,
			a.target.start,
			a.target.end
		);
	}
	return Type.Any;
}

function checkLoopStmt(t: TypeChecker, l: AstLoopStmt, _d?: TypePattern): Type {
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

function checkExprStmt(t: TypeChecker, e: AstExprStmt, d?: TypePattern): Type {
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
	for (const [ui, ti] of zipLeft(u.items, closestTuple(d).items)) {
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
		assertCardinality(type.fields, initialized, s, "fields");
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
			(c.pattern.tag === AstTag.WildCardExpr ||
				c.pattern.tag === AstTag.IdExpr) &&
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
	for (const [param, dParam] of zipLeft(p.params, destination.params)) {
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
			if (l.kind === Kind.Tuple) {
				if (
					b.right.tag !== AstTag.LitExpr ||
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
				if (
					b.right.tag !== AstTag.IdExpr &&
					(b.right.tag !== AstTag.LitExpr || typeof b.right.value !== "bigint")
				) {
					const lp = Type.print(l);
					const rp = Type.print(check(t, b.right));
					throw new TypeError(
						`Operator . cannot be applied to ${lp} and ${rp}!`,
						b.start,
						b.end
					);
				}
				const field = assertField(l, b.right);
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
			if (l === Type.Module && b.left.tag === AstTag.IdExpr) {
				const enumType = t.types.get(b.left.value);
				if (enumType?.kind === Kind.Enum) {
					if (b.right.tag !== AstTag.IdExpr) {
						const lp = Type.print(enumType);
						const rp = Type.print(check(t, b.right));
						throw new TypeError(
							`Operator . cannot be applied to ${lp} and ${rp}!`,
							b.start,
							b.end
						);
					}
					const variant = assertVariant(enumType, b.right);
					if (variant.fields.length !== 0) {
						const e = enumType.name;
						const v = variant.name;
						throw new TypeError(
							`${e}.${v} cannot be constructed without fields!`,
							b.start,
							b.end
						);
					}
					b.resolvedType = enumType;
					return enumType;
				}
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
	if (callee === Type.Module && c.proc.tag === AstTag.IdExpr) {
		const type = t.types.get(c.proc.value);
		if (type !== undefined && type.kind === Kind.Struct) {
			assertCardinality(c.args, type.fields, c, "fields");
			for (const [arg, field] of zip(c.args, type.fields)) {
				const argType = check(t, arg, field.type);
				assertAssignable(argType, field.type, arg);
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
	if (ast.tag === AstTag.TypeExpr) {
		return reifyType(t, ast.expr, strict);
	}
	if (ast.tag === AstTag.StructDecl) {
		const fields: StructField[] = [];
		for (const field of ast.fields) {
			fields.push({
				mutable: field.mutable,
				name: field.id?.value,
				type: reifyType(t, field.typeAnnotation, true),
			});
		}
		return Type.struct(ast.id.value, fields);
	}
	if (ast.tag === AstTag.TupleExpr) {
		const items: TypePattern[] = [];
		for (const item of ast.items) {
			items.push(reifyType(t, item, strict));
		}
		return Type.tuple(items) as Type;
	}
	if (ast.tag === AstTag.ProcTypeExpr) {
		const params: TypePattern[] = [];
		for (const param of ast.params) {
			params.push(reifyType(t, param, strict));
		}
		const returns = reifyType(t, ast.returnType, strict);
		return Type.proc(params, returns) as Type;
	}
	if (ast.tag === AstTag.WildCardExpr) {
		if (strict) {
			throw new TypeError(
				"Cannot use a wildcard type here!",
				ast.start,
				ast.end
			);
		}
		return Type._ as unknown as Type;
	}
	if (ast.tag === AstTag.IdExpr) {
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

// TODO should this be `name: TokId | TokIntLit` ?
function assertField(type: StructType, name: IdExpr | LitExpr): StructField {
	// TODO git rid of this type assertion
	const field = Type.findField(type, name.value as string | bigint);
	if (field === undefined) {
		const f = name.value;
		const s = Type.print(type);
		throw new TypeError(`No field ${f} on type ${s}!`, name.start, name.end);
	}
	return field;
}

function assertVariant(type: EnumType, name: IdExpr): StructType {
	const variant = Type.findVariant(type, name.value);
	if (variant === undefined) {
		const f = name.value;
		const e = Type.print(type);
		throw new TypeError(`No variant ${f} on type ${e}!`, name.start, name.end);
	}
	return variant;
}

function closestTuple(type?: TypePattern): TupleTypePattern {
	if (type === undefined || type.kind !== Kind.Tuple) {
		return Type.Unit;
	}
	return type;
}

const EmptyProcType = Type.proc([], Type.Unit);

function closestProc(type?: TypePattern): ProcTypePattern {
	if (type === undefined || type.kind !== Kind.Proc) {
		return EmptyProcType;
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
