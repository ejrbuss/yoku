import { assert } from "@std/assert/assert";
import { Builtins, BuiltinTypes } from "./builtins.ts";
import {
	AstAssertStmt,
	AstAssignVarStmt,
	AstTag,
	BinaryExpr,
	BlockExpr,
	AstBreakStmt,
	CallExpr,
	AstContinueStmt,
	AstExprStmt,
	GroupExpr,
	IfExpr,
	AstLoopStmt,
	MatchExpr,
	AstModule,
	ProcExpr,
	AstReturnStmt,
	AstStructDecl,
	AstStructExpr,
	ThrowExpr,
	TupleExpr,
	UnaryExpr,
	AstAssignFieldStmt,
	AstTypeDecl,
	AstVarDecl,
	AstTestDecl,
	AstProcDecl,
	AstEnumDecl,
	AstDecl,
	AstStmt,
	AstPattern,
	AstLit,
	AstId,
	AstType,
	AstExpr,
	AstWhileStmt,
	AstTypeExpr,
	AstEnumExpr,
	Ast,
} from "./ast.ts";
import { BinaryOp, UnaryOp } from "./ops.ts";
import { Scopes } from "./scopes.ts";
import {
	Kind,
	Type,
	UnresolvedType,
	UnresolvedTupleType,
	UnresolvedProctType,
	StructField,
	StructType,
	EnumType,
	EnumVariant,
} from "./types.ts";
import { Span, zip, zipLeft } from "./utils.ts";
import { unreachable } from "@std/assert/unreachable";

const assert2: typeof assert = assert;

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

function checkExternal(t: TypeChecker, a: AstModule): Type {
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

function declareType(t: TypeChecker, id: AstId, type: Type): void {
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

function check(
	t: TypeChecker,
	ast: AstModule | AstDecl | AstStmt | AstExpr,
	d?: UnresolvedType
): Type {
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
		case AstTag.WhileStmt:
			return checkWhileStmt(t, ast, d);
		case AstTag.ExprStmt:
			return checkExprStmt(t, ast, d);
		case AstTag.BlockExpr:
			return checkBlockExpr(t, ast, d);
		case AstTag.TupleExpr:
			return checkTupleExpr(t, ast, d);
		case AstTag.StructExpr:
			return checkStructExpr(t, ast, d);
		case AstTag.EnumExpr:
			return checkEnumExpr(t, ast, d);
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
		case AstTag.Lit:
			return checkLit(t, ast, d);
		case AstTag.Id:
			return checkId(t, ast, d);
	}
}

function checkModule(t: TypeChecker, m: AstModule, _d?: UnresolvedType): Type {
	let result: Type = Type.Unit;
	for (const decl of m.decls) {
		result = check(t, decl);
	}
	return m.replMode ? result : Type.Any;
}

function checkVarDecl(
	t: TypeChecker,
	d: AstVarDecl,
	_d?: UnresolvedType
): Type {
	let resolvedType: Type;
	let declType: undefined | UnresolvedType;
	if (d.typeAnnotation !== undefined) {
		declType = reifyUnresolvedType(t, d.typeAnnotation);
	}
	const initType = check(t, d.initExpr, declType);
	if (declType !== undefined) {
		if (d.assert) {
			resolvedType = assertAssertable(initType, declType, d.pattern);
		} else {
			resolvedType = assertAssignable(initType, declType, d.pattern);
		}
	} else {
		resolvedType = assertResolved(initType, d.initExpr);
	}
	d.resolvedType = resolvedType;
	unify(t, d.pattern, resolvedType, d.mutable, d.assert);
	return Type.Any;
}

function checkProcDecl(
	t: TypeChecker,
	p: AstProcDecl,
	_d?: UnresolvedType
): Type {
	const params: Type[] = [];
	for (const param of p.initExpr.params) {
		if (param.typeAnnotation === undefined) {
			throw new TypeError(
				"Top level proc params require type annotations!",
				param.pattern.start,
				param.pattern.end
			);
		}
		const paramType = reifyType(t, param.typeAnnotation);
		params.push(paramType);
	}
	let returns: Type = Type.Unit;
	if (p.initExpr.returnType !== undefined) {
		returns = reifyType(t, p.initExpr.returnType);
	}
	const type = Type.proc(params, returns);
	unify(t, p.id, type, false, false);
	check(t, p.initExpr);
	return type;
}

function checkTypeDecl(
	t: TypeChecker,
	d: AstTypeDecl,
	_d?: UnresolvedType
): Type {
	// TODO these global assertions will need to become module level assertions
	// once we have module level scope
	assert(t.values.inGlobalScope);
	const type = reifyType(t, d.typeExpr);
	declareType(t, d.id, type);
	d.resolvedType = type;
	return Type.Any;
}

function checkStructDecl(
	t: TypeChecker,
	s: AstStructDecl,
	_d?: UnresolvedType
): Type {
	assert(t.values.inGlobalScope);
	const fields: StructField[] = [];
	for (const field of s.fields) {
		fields.push({
			mutable: field.mutable,
			name: field.id?.value,
			type: reifyType(t, field.typeAnnotation),
		});
	}
	const type = Type.struct(s.id.value, fields);
	declareType(t, s.id, type);
	s.resolvedType = type;
	return Type.Any;
}

function checkEnumDecl(
	t: TypeChecker,
	e: AstEnumDecl,
	_d?: UnresolvedType
): Type {
	assert(t.values.inGlobalScope);
	const variants: EnumVariant[] = [];
	for (const variant of e.variants) {
		const fields: StructField[] = [];
		for (const field of variant.fields) {
			fields.push({
				mutable: field.mutable,
				name: field.id.value,
				type: reifyType(t, field.typeAnnotation),
			});
		}
		variants.push({
			name: variant.id.value,
			constant: variant.constant,
			fields,
		});
	}
	const type = Type.enum(e.id.value, variants);
	declareType(t, e.id, type);
	e.resolvedType = type;
	return Type.Any;
}

function checkTestDecl(
	t: TypeChecker,
	d: AstTestDecl,
	_d?: UnresolvedType
): Type {
	assert(t.values.inGlobalScope);
	check(t, d.thenExpr);
	return Type.Any;
}

function checkBreakStmt(
	t: TypeChecker,
	b: AstBreakStmt,
	_d?: UnresolvedType
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
	_d?: UnresolvedType
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
	d?: UnresolvedType
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
	_d?: UnresolvedType
): Type {
	check(t, a.testExpr);
	return Type.Unit;
}

function checkAssignVarStmt(
	t: TypeChecker,
	a: AstAssignVarStmt,
	_d?: UnresolvedType
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
	_d?: UnresolvedType
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

function checkLoopStmt(
	t: TypeChecker,
	l: AstLoopStmt,
	_d?: UnresolvedType
): Type {
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

function checkWhileStmt(
	t: TypeChecker,
	w: AstWhileStmt,
	_d?: UnresolvedType
): Type {
	t.loops.openScope();
	assertAssignable(check(t, w.testExpr, Type.Bool), Type.Bool, w.testExpr);
	check(t, w.thenExpr);
	t.loops.dropScope();
	return Type.Unit;
}

function checkExprStmt(
	t: TypeChecker,
	e: AstExprStmt,
	d?: UnresolvedType
): Type {
	return check(t, e.expr, d);
}

function checkBlockExpr(
	t: TypeChecker,
	b: BlockExpr,
	d?: UnresolvedType
): Type {
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

function checkTupleExpr(
	t: TypeChecker,
	u: TupleExpr,
	d?: UnresolvedType
): Type {
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
	s: AstStructExpr,
	_d?: UnresolvedType
): Type {
	const type = reifyType(t, s.id);
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

function checkEnumExpr(
	t: TypeChecker,
	e: AstEnumExpr,
	_d?: UnresolvedType
): Type {
	const type = reifyType(t, e.id);
	if (type.kind !== Kind.Enum) {
		const tp = Type.print(type);
		throw new TypeError(
			`Type ${tp} is not constructable!`,
			e.id.start,
			e.id.end
		);
	}
	const variant = assertVariant(type, e.structExpr.id);
	if (variant.constant) {
		const tp = Type.print(type);
		throw new TypeError(
			`Type ${tp} is a constant with no fields!`,
			e.id.start,
			e.id.end
		);
	}
	const initialized: string[] = [];
	for (const fieldInit of e.structExpr.fieldInits) {
		if (initialized.includes(fieldInit.id.value)) {
			throw new TypeError(
				`Duplicate field initializer!`,
				fieldInit.id.start,
				fieldInit.id.end
			);
		}
		const field = assertVariantField(type, variant, fieldInit.id);
		initialized.push(fieldInit.id.value);
		const fieldType = check(t, fieldInit.expr ?? fieldInit.id, field.type);
		assertAssignable(fieldType, field.type, fieldInit.expr ?? fieldInit.id);
	}
	if (e.structExpr.spreadInit !== undefined) {
		const spreadType = check(t, e.structExpr.spreadInit, type);
		assertAssignable(spreadType, type, e.structExpr.spreadInit);
	} else {
		assertCardinality(variant.fields, initialized, e, "fields");
	}
	e.resolvedType = type;
	return type;
}

function checkGroupExpr(
	t: TypeChecker,
	g: GroupExpr,
	d?: UnresolvedType
): Type {
	return check(t, g.expr, d);
}

function checkIfExpr(t: TypeChecker, i: IfExpr, d?: UnresolvedType): Type {
	if (i.pattern !== undefined) {
		let declType: undefined | UnresolvedType;
		if (i.assertedType !== undefined) {
			declType = reifyUnresolvedType(t, i.assertedType);
		}
		const from = check(t, i.testExpr, declType);
		if (declType !== undefined) {
			i.resolvedDeclType = assertAssertable(from, declType, i.pattern);
		}
		unify(t, i.pattern, from, i.mutable, true);
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

function checkMatchExpr(
	t: TypeChecker,
	m: MatchExpr,
	d?: UnresolvedType
): Type {
	let from: Type = Type.Unit;
	if (m.testExpr !== undefined) {
		from = check(t, m.testExpr, Type.Bool);
	}
	const caseTypes: Type[] = [];
	const variants = new Set<string>();
	let exhausted = false;
	for (const c of m.cases) {
		if (c.pattern !== undefined) {
			unify(t, c.pattern, from, false, true);
			if (c.assertedType !== undefined) {
				const into = reifyUnresolvedType(t, c.assertedType);
				c.resolvedDeclType = assertAssertable(from, into, c.pattern);
			}
			if (c.pattern.tag === AstTag.EnumPattern) {
				variants.add(c.pattern.variant.id.value);
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
			(c.pattern.tag === AstTag.Wildcard || c.pattern.tag === AstTag.Id) &&
			c.testExpr === undefined &&
			(c.assertedType === undefined ||
				Type.assignable(from, reifyUnresolvedType(t, c.assertedType)))
		) {
			exhausted = true;
		}
		caseTypes.push(check(t, c.thenExpr, d));
	}
	// Check if we exhausted all enum cases
	if (from.kind === Kind.Enum && variants.size === from.variants.length) {
		exhausted = true;
	}
	if (!exhausted) {
		caseTypes.push(Type.Unit);
	}
	return union(caseTypes);
}

function checkThrowExpr(
	t: TypeChecker,
	e: ThrowExpr,
	_d?: UnresolvedType
): Type {
	check(t, e.expr);
	return Type.Never;
}

function checkProcExpr(t: TypeChecker, p: ProcExpr, d?: UnresolvedType): Type {
	t.values.openScope();
	const params: Type[] = [];
	const destination = closestProc(d);
	for (const [param, dParam] of zipLeft(p.params, destination.params)) {
		let paramType: undefined | UnresolvedType;
		if (param.typeAnnotation !== undefined) {
			paramType = reifyUnresolvedType(t, param.typeAnnotation);
		}
		paramType ??= dParam;
		if (paramType === undefined) {
			throw new TypeError(
				"Params require type annotations if there is no destination type!",
				param.pattern.start,
				param.pattern.end
			);
		}
		const type = assertResolved(paramType, param.pattern);
		unify(t, param.pattern, type, false, false);
		params.push(type);
	}
	let returns: UnresolvedType = destination.returns;
	if (p.returnType !== undefined) {
		returns = reifyUnresolvedType(t, p.returnType);
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
	const type = Type.proc(params, assertResolved(returns, p));
	t.returns = returnsSave;
	p.resolvedType = type;
	t.values.dropScope();
	return type;
}

function checkTypeExpr(
	t: TypeChecker,
	e: AstTypeExpr,
	_d?: UnresolvedType
): Type {
	e.resolvedType = reifyType(t, e.type);
	// TODO eventually, Type should be a parameterized type Type[T]
	return Type.Type;
}

function checkBinaryExpr(
	t: TypeChecker,
	b: BinaryExpr,
	d?: UnresolvedType
): Type {
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
				if (b.right.tag !== AstTag.Lit || typeof b.right.value !== "bigint") {
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
					b.right.tag !== AstTag.Id &&
					(b.right.tag !== AstTag.Lit || typeof b.right.value !== "bigint")
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
			if (l === Type.Module && b.left.tag === AstTag.Id) {
				const enumType = t.types.get(b.left.value);
				if (enumType?.kind === Kind.Enum) {
					if (b.right.tag !== AstTag.Id) {
						const lp = Type.print(enumType);
						const rp = Type.print(check(t, b.right));
						throw new TypeError(
							`Operator . cannot be applied to ${lp} and ${rp}!`,
							b.start,
							b.end
						);
					}
					const variant = assertVariant(enumType, b.right);
					return variant.constant ? enumType : Type.Module;
				}
			}
			return checkBinaryExprHelper(t, b, []);
		}
		case BinaryOp.As:
			unreachable(`${Ast.print(b)}`);
	}
}

function checkBinaryExprHelper(
	t: TypeChecker,
	b: BinaryExpr,
	v: Type[],
	d?: UnresolvedType
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

function checkUnaryExpr(
	t: TypeChecker,
	u: UnaryExpr,
	d?: UnresolvedType
): Type {
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
	d?: UnresolvedType
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

function checkCallExpr(t: TypeChecker, c: CallExpr, _d?: UnresolvedType): Type {
	const callee = check(t, c.proc);
	if (callee.kind === Kind.Proc) {
		assertCardinality(callee.params, c.args, c, "arguments");
		for (const [arg, param] of zip(c.args, callee.params)) {
			const argType = check(t, arg, param);
			assertAssignable(argType, param, arg);
		}
		return callee.returns;
	}
	if (callee === Type.Module && c.proc.tag === AstTag.Id) {
		const type = t.types.get(c.proc.value);
		if (type !== undefined && type.kind === Kind.Struct) {
			assertCardinality(c.args, type.fields, c, "fields");
			for (const [arg, field] of zip(c.args, type.fields)) {
				const argType = check(t, arg, field.type);
				assertAssignable(argType, field.type, arg);
			}
			return type;
		}
	}
	if (
		callee === Type.Module &&
		c.proc.tag === AstTag.BinaryExpr &&
		c.proc.left.tag === AstTag.Id &&
		c.proc.right.tag === AstTag.Id
	) {
		const type = t.types.get(c.proc.left.value);
		if (type !== undefined && type.kind === Kind.Enum) {
			const variant = assertVariant(type, c.proc.right);
			assertCardinality(c.args, variant.fields, c, "fields");
			for (const [arg, field] of zip(c.args, variant.fields)) {
				const argType = check(t, arg, field.type);
				assertAssignable(argType, field.type, arg);
			}
			return type;
		}
	}
	const found = Type.print(callee);
	throw new TypeError(`Cannot call type ${found}!`, c.proc.start, c.proc.end);
}

function checkLit(_t: TypeChecker, l: AstLit, d?: UnresolvedType): Type {
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

function checkId(t: TypeChecker, i: AstId, _d?: UnresolvedType): Type {
	const type = t.values.get(i.value);
	if (type === undefined) {
		console.log(t.types);
		throw new TypeError("Undeclared variable!", i.start, i.end);
	}
	return type;
}

function unify(
	t: TypeChecker,
	p: AstPattern,
	type: Type,
	mutable: boolean,
	assert: boolean
): void {
	switch (p.tag) {
		case AstTag.Wildcard: {
			return;
		}
		case AstTag.Lit: {
			if (!assert) {
				throw new TypeError(
					"Cannot use a literal in a non-asserted pattern!",
					p.start,
					p.end
				);
			}
			assertAssertable(type, Type.of(p.value), p);
			return;
		}
		case AstTag.Id: {
			if (
				!t.values.declareLocal(p.value, {
					mutable,
					allowShadow: true,
					value: type,
				})
			) {
				throw new TypeError("Cannot shadow builtin!", p.start, p.end);
			}
			return;
		}
		case AstTag.AsPattern: {
			unify(t, p.left, type, mutable, assert);
			unify(t, p.right, type, mutable, assert);
			return;
		}
		case AstTag.TuplePattern: {
			if (type.kind !== Kind.Tuple) {
				const pt = Type.print(type);
				throw new TypeError(
					`Cannot assign ${pt} to a tuple pattern!`,
					p.start,
					p.end
				);
			}
			assertCardinality(type.items, p.items, p, "items");
			for (const [pi, ti] of zip(p.items, type.items)) {
				unify(t, pi, ti, mutable, assert);
			}
			return;
		}
		case AstTag.StructPattern: {
			const constructor = reifyType(t, p.id);
			assertAssignable(type, constructor, p);
			assert2(type.kind === Kind.Struct);
			for (const fp of p.fieldPatterns) {
				const sf = assertField(type, fp.id);
				unify(t, fp.pattern ?? fp.id, sf.type, mutable, assert);
			}
			return;
		}
		case AstTag.EnumPattern: {
			if (!assert) {
				throw new TypeError(
					"Cannot use an enum variant in a non-asserted pattern!",
					p.start,
					p.end
				);
			}
			const constructor = reifyType(t, p.id);
			assertAssignable(type, constructor, p);
			assert2(type.kind === Kind.Enum);
			const variantType = assertVariant(type, p.variant.id);
			for (const fp of p.variant.fieldPatterns) {
				const sf = assertVariantField(type, variantType, fp.id);
				unify(t, fp.pattern ?? fp.id, sf.type, mutable, assert);
			}
			return;
		}
	}
	unreachable(`${p}`);
}

function reifyUnresolvedType(t: TypeChecker, at: AstType): UnresolvedType {
	switch (at.tag) {
		case AstTag.Wildcard: {
			return Type._;
		}
		case AstTag.Id: {
			const type = t.types.get(at.value);
			if (type === undefined) {
				throw new TypeError("Undefined type!", at.start, at.end);
			}
			return type;
		}
		case AstTag.ProcType: {
			const params: UnresolvedType[] = [];
			for (const param of at.params) {
				params.push(reifyUnresolvedType(t, param));
			}
			const returns = reifyUnresolvedType(t, at.returnType);
			return Type.proc(params, returns);
		}
		case AstTag.TupleType: {
			const items: UnresolvedType[] = [];
			for (const item of at.items) {
				items.push(reifyUnresolvedType(t, item));
			}
			return Type.tuple(items);
		}
	}
	unreachable(`${at}`);
}

function reifyType(t: TypeChecker, at: AstType): Type {
	switch (at.tag) {
		case AstTag.Wildcard: {
			throw new TypeError("Cannot use a wildcard type here!", at.start, at.end);
		}
		case AstTag.Id: {
			const type = t.types.get(at.value);
			if (type === undefined) {
				throw new TypeError("Undefined type!", at.start, at.end);
			}
			return type;
		}
		case AstTag.ProcType: {
			const params: Type[] = [];
			for (const param of at.params) {
				params.push(reifyType(t, param));
			}
			const returns = reifyType(t, at.returnType);
			return Type.proc(params, returns);
		}
		case AstTag.TupleType: {
			const items: Type[] = [];
			for (const item of at.items) {
				items.push(reifyType(t, item));
			}
			return Type.tuple(items);
		}
	}
	unreachable(`${at}`);
}

function assertResolved(type: UnresolvedType, span: Span): Type {
	return assertAssignable(type, type, span);
}

function assertAssignable(
	from: UnresolvedType,
	into: UnresolvedType,
	span: Span
): Type {
	const resolved = Type.assignable(from, into);
	if (resolved === undefined) {
		const f = Type.print(from);
		const t = Type.print(into);
		throw new TypeError(
			`Type ${f} is not assignable to ${t}!`,
			span.start,
			span.end
		);
	}
	return resolved;
}

function assertAssertable(
	from: UnresolvedType,
	into: UnresolvedType,
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
function assertField(type: StructType, name: AstId | AstLit): StructField {
	// TODO git rid of this type assertion
	const field = Type.findField(type, name.value as string | bigint);
	if (field === undefined) {
		const f = name.value;
		const s = Type.print(type);
		throw new TypeError(`No field ${f} on type ${s}!`, name.start, name.end);
	}
	return field;
}

function assertVariantField(
	enumType: EnumType,
	variant: EnumVariant,
	name: AstId | AstLit
): StructField {
	// TODO git rid of this type assertion
	const field = Type.findField(variant, name.value as string | bigint);
	if (field === undefined) {
		const f = name.value;
		const s = enumType.name;
		const v = variant.name;
		throw new TypeError(
			`No field ${f} on type ${s}.${v}!`,
			name.start,
			name.end
		);
	}
	return field;
}

function assertVariant(type: EnumType, name: AstId): EnumVariant {
	const variant = Type.findVariant(type, name.value);
	if (variant === undefined) {
		const f = name.value;
		const e = Type.print(type);
		throw new TypeError(`No variant ${f} on type ${e}!`, name.start, name.end);
	}
	return variant;
}

function closestTuple(type?: UnresolvedType): UnresolvedTupleType {
	if (type === undefined || type.kind !== Kind.Tuple) {
		return Type.Unit;
	}
	return type;
}

const EmptyProcType = Type.proc([], Type.Unit);

function closestProc(type?: UnresolvedType): UnresolvedProctType {
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
