import { Builtins } from "./builtins.ts";
import { Enum, Module, print, Proc, Struct, Tuple, Unit } from "./core.ts";
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
	AstVarDecl,
	AstTypeDecl,
	AstTestDecl,
	AstProcDecl,
	AstEnumDecl,
} from "./ast.ts";
import { BinaryOp, UnaryOp } from "./ops.ts";
import { Scopes } from "./scopes.ts";
import {
	EnumType,
	Kind,
	ProcType,
	StructType,
	TupleType,
	Type,
} from "./types.ts";
import { enumerate, structurallyEq, Unreachable, zip } from "./utils.ts";
import { types } from "node:util";

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
	scopes: Scopes<unknown>;
	test: boolean;
};

export const Interpreter = { create, interperate };

const BuiltinTypes = {
	Type: Type.Type,
	Any: Type.Any,
	Never: Type.Never,
	Bool: Type.Bool,
	Int: Type.Int,
	Float: Type.Float,
	Str: Type.Str,
	Module: Type.Module,
};

function create(test: boolean): Interpreter {
	const scopes = new Scopes();
	for (const [id, builtin] of Object.entries(Builtins)) {
		scopes.declareGlobal(id, {
			mutable: false,
			allowShadow: false,
			value: builtin,
		});
	}
	for (const [id, builtinType] of Object.entries(BuiltinTypes)) {
		scopes.declareGlobal(id, {
			mutable: false,
			allowShadow: false,
			value: Module.create(id, builtinType),
		});
	}
	return { scopes, test };
}

function unify(
	i: Interpreter,
	pattern: Ast,
	value: unknown,
	throwOnFailure: boolean,
	declType?: Type
): boolean {
	// we only bother checking the declType at the top level
	if (declType !== undefined) {
		const from = Type.of(value);
		const into = declType;
		if (!Type.assignable(from, into)) {
			if (throwOnFailure) {
				const i = Type.print(into);
				const f = print(from);
				throw new RuntimeError(
					`Expected type ${i} but found ${f}`,
					pattern.start,
					pattern.end
				);
			} else {
				return false;
			}
		}
	}
	// pattern.left as pattern.right = value
	if (pattern.tag === AstTag.BinaryExpr) {
		if (!unify(i, pattern.left, value, throwOnFailure)) {
			return false;
		}
		if (!unify(i, pattern.right, value, throwOnFailure)) {
			return false;
		}
		return true;
	}
	// (pattern.items,) = (value.items,)
	if (pattern.tag === AstTag.TupleExpr) {
		const tuple = value as Tuple;
		for (const [pi, vi] of zip(pattern.items, tuple.items)) {
			if (!unify(i, pi, vi, throwOnFailure)) {
				return false;
			}
		}
		return true;
	}
	// Struct { ... } = value
	if (pattern.tag === AstTag.StructExpr) {
		const struct = value as Struct;
		for (const f of pattern.fieldInits) {
			if (!unify(i, f.expr ?? f.id, struct[f.id.value], throwOnFailure)) {
				return false;
			}
		}
		return true;
	}
	// Struct(...) = value
	if (pattern.tag === AstTag.CallExpr) {
		const struct = value as Struct;
		for (const [j, pj] of enumerate(pattern.args)) {
			if (!unify(i, pj, struct[j], throwOnFailure)) {
				return false;
			}
		}
		return true;
	}
	// _ = value
	if (pattern.tag === AstTag.WildCardExpr) {
		return true;
	}
	// pattern = value
	if (pattern.tag === AstTag.IdExpr) {
		i.scopes.declareLocal(pattern.value, {
			mutable: true,
			allowShadow: true,
			value,
		});
		return true;
	}
	// "literal" = value
	if (pattern.tag === AstTag.LitExpr) {
		if (!structurallyEq(pattern.value, value)) {
			if (throwOnFailure) {
				const expected = print(pattern.value);
				const actual = print(value);
				throw new RuntimeError(
					`Expected ${expected} but found ${actual}!`,
					pattern.start,
					pattern.end
				);
			} else {
				return false;
			}
		}
		return true;
	}
	throw new Unreachable();
}

function interperate(i: Interpreter, ast: Ast): unknown {
	switch (ast.tag) {
		case AstTag.Module:
			return interperateModuleDecls(i, ast);
		case AstTag.VarDecl:
			return interperateVarDecl(i, ast);
		case AstTag.ProcDecl:
			return interperateProcDecl(i, ast);
		case AstTag.TypeDecl:
			return interperateTypeDecl(i, ast);
		case AstTag.StructDecl:
			return interperateStructDecl(i, ast);
		case AstTag.EnumDecl:
			return interperateEnumDecl(i, ast);
		case AstTag.TestDecl:
			return interperateTestDecl(i, ast);
		case AstTag.BreakStmt:
			return interperateBreakStmt(i, ast);
		case AstTag.ContinueStmt:
			return interperateContinueStmt(i, ast);
		case AstTag.ReturnStmt:
			return interperateReturnStmt(i, ast);
		case AstTag.AssertStmt:
			return interperateAssertStmt(i, ast);
		case AstTag.LoopStmt:
			return interperateLoopStmt(i, ast);
		case AstTag.AssignVarStmt:
			return interperateAssignVarStmt(i, ast);
		case AstTag.AssignFieldStmt:
			return interperateAssignFieldStmt(i, ast);
		case AstTag.ExprStmt:
			return interperateExprStmt(i, ast);
		case AstTag.BlockExpr:
			return interperateBlockExpr(i, ast);
		case AstTag.TupleExpr:
			return interperateTupleExpr(i, ast);
		case AstTag.StructExpr:
			return interperateStructExpr(i, ast);
		case AstTag.GroupExpr:
			return interperateGroupExpr(i, ast);
		case AstTag.IfExpr:
			return interperateIfExpr(i, ast);
		case AstTag.MatchExpr:
			return interperateMatchExpr(i, ast);
		case AstTag.ThrowExpr:
			return interperateThrowExpr(i, ast);
		case AstTag.ProcExpr:
			return interperateProcExpr(i, ast);
		case AstTag.TypeExpr:
			return interperateTypeExpr(i, ast);
		case AstTag.BinaryExpr:
			return interperateBinaryExpr(i, ast);
		case AstTag.UnaryExpr:
			return interperateUnaryExpr(i, ast);
		case AstTag.CallExpr:
			return interperateCallExpr(i, ast);
		case AstTag.LitExpr:
			return interperateLitExpr(i, ast);
		case AstTag.IdExpr:
			return interperateIdExpr(i, ast);
		case AstTag.ProcTypeExpr:
			throw new Unreachable();
		case AstTag.WildCardExpr:
			throw new Unreachable();
	}
	throw new Unreachable(ast satisfies never);
}

function interperateModuleDecls(i: Interpreter, m: AstModule): unknown {
	let result: unknown = Unit;
	for (const decl of m.decls) {
		result = interperate(i, decl);
	}
	return result;
}

function interperateVarDecl(i: Interpreter, d: AstVarDecl): unknown {
	const value = interperate(i, d.initExpr);
	unify(i, d.pattern, value, true, d.assert ? d.resolvedType : undefined);
	return Unit;
}

function interperateProcDecl(i: Interpreter, p: AstProcDecl): unknown {
	const value = interperate(i, p.initExpr);
	unify(i, p.id, value, true);
	return Unit;
}

function interperateTypeDecl(i: Interpreter, t: AstTypeDecl): unknown {
	unify(i, t.id, Module.create(t.id.value, t.resolvedType), true);
	return Unit;
}

function interperateStructDecl(i: Interpreter, s: AstStructDecl): unknown {
	unify(i, s.id, Module.create(s.id.value, s.resolvedType), true);
	return Unit;
}

function interperateEnumDecl(i: Interpreter, e: AstEnumDecl): unknown {
	unify(i, e.id, Module.create(e.id.value, e.resolvedType), true);
	return Unit;
}

function interperateTestDecl(i: Interpreter, t: AstTestDecl): unknown {
	if (i.test) {
		try {
			interperate(i, t.thenExpr);
			console.log(`${t.name} ... %cOk`, "color: green");
		} catch (error) {
			console.log(`${t.name} ... %cError`, "color: red");
			throw error;
		}
	}
	return Unit;
}

function interperateBreakStmt(_i: Interpreter, b: AstBreakStmt): unknown {
	throw new Break(b.label?.value);
}

function interperateContinueStmt(_i: Interpreter, c: AstContinueStmt): unknown {
	throw new Continue(c.label?.value);
}

function interperateReturnStmt(i: Interpreter, r: AstReturnStmt): unknown {
	throw new Return(r.expr !== undefined ? interperate(i, r.expr) : Unit);
}

function interperateAssertStmt(i: Interpreter, a: AstAssertStmt): unknown {
	const value = interperate(i, a.testExpr);
	if (!value) {
		if (a.testExpr.tag === AstTag.BinaryExpr) {
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
	return Unit;
}

function interperateLoopStmt(i: Interpreter, l: AstLoopStmt): unknown {
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
				return Unit;
			}
			throw e;
		}
	}
}

function interperateAssignVarStmt(
	i: Interpreter,
	a: AstAssignVarStmt
): unknown {
	const value = interperate(i, a.expr);
	i.scopes.set(a.target.value, value);
	return Unit;
}

function interperateAssignFieldStmt(
	i: Interpreter,
	a: AstAssignFieldStmt
): unknown {
	const target = interperate(i, a.target) as Struct;
	const value = interperate(i, a.expr);
	target[a.field.value] = value;
	return Unit;
}

function interperateExprStmt(i: Interpreter, e: AstExprStmt): unknown {
	return interperate(i, e.expr);
}

function interperateBlockExpr(i: Interpreter, b: BlockExpr): unknown {
	i.scopes.openScope();
	try {
		let acc: unknown = Unit;
		for (const stmt of b.stmts) {
			acc = interperate(i, stmt);
		}
		return acc;
	} finally {
		i.scopes.dropScope();
	}
}

function interperateTupleExpr(i: Interpreter, t: TupleExpr): unknown {
	if (t.items.length === 0) {
		return Unit;
	}
	const items: unknown[] = [];
	for (const item of t.items) {
		items.push(interperate(i, item));
	}
	return Tuple.create(t.resolvedType as TupleType, items);
}

function interperateStructExpr(i: Interpreter, s: StructExpr): unknown {
	const type = s.resolvedType as StructType;
	const fields: Record<string, unknown> = {};
	const initialized: string[] = [];
	if (s.spreadInit !== undefined) {
		const spread = interperate(i, s.spreadInit) as Struct;
		for (const [i, field] of enumerate(type.fields)) {
			fields[field.name ?? i] = spread[field.name ?? i];
			if (field.name) {
				initialized.push(field.name);
			}
		}
	}
	for (const fieldInit of s.fieldInits) {
		fields[fieldInit.id.value] = interperate(i, fieldInit.expr ?? fieldInit.id);
		initialized.push(fieldInit.id.value);
	}
	return Struct.create(type, fields);
}

function interperateGroupExpr(i: Interpreter, g: GroupExpr): unknown {
	return interperate(i, g.expr);
}

function interperateIfExpr(i: Interpreter, f: IfExpr): unknown {
	if (f.pattern !== undefined) {
		const value = interperate(i, f.testExpr);
		if (unify(i, f.pattern, value, false, f.resolvedDeclType)) {
			return interperate(i, f.thenExpr);
		} else if (f.elseExpr !== undefined) {
			return interperate(i, f.elseExpr);
		} else {
			return Unit;
		}
	} else {
		if (interperate(i, f.testExpr)) {
			return interperate(i, f.thenExpr);
		} else if (f.elseExpr !== undefined) {
			return interperate(i, f.elseExpr);
		} else {
			return Unit;
		}
	}
}

function interperateMatchExpr(i: Interpreter, m: MatchExpr): unknown {
	let value: unknown = Unit;
	if (m.testExpr !== undefined) {
		value = interperate(i, m.testExpr);
	}
	for (const c of m.cases) {
		if (c.pattern !== undefined) {
			if (!unify(i, c.pattern, value, false, c.resolvedDeclType)) {
				continue;
			}
		}
		if (c.testExpr !== undefined) {
			if (!interperate(i, c.testExpr)) {
				continue;
			}
		}
		return interperate(i, c.thenExpr);
	}
	return Unit;
}

function interperateThrowExpr(i: Interpreter, t: ThrowExpr): unknown {
	const value = interperate(i, t.expr);
	throw new RuntimeError(print(value), t.start, t.end);
}

function interperateProcExpr(i: Interpreter, p: ProcExpr): unknown {
	const capture = i.scopes.capture();
	return Proc.create(undefined, p.resolvedType as ProcType, (args) => {
		const scopesSave = i.scopes;
		i.scopes = capture;
		capture.openScope();
		try {
			for (const [param, arg] of zip(p.params, args)) {
				unify(i, param.pattern, arg, true);
			}
			const value = interperate(i, p.implExpr);
			return p.discardReturn ? Unit : value;
		} catch (e) {
			if (e instanceof Return) {
				return p.discardReturn ? Unit : e.value;
			}
			throw e;
		} finally {
			capture.dropScope();
			i.scopes = scopesSave;
		}
	});
}

function interperateTypeExpr(_i: Interpreter, t: TypeExpr): unknown {
	return t.resolvedType as Type;
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
		case BinaryOp.Member: {
			const left = interperate(i, b.left);
			const type = Type.of(left);
			if (type.kind === Kind.Tuple) {
				return (left as Tuple).items[
					Number((b.right as LitExpr).value as bigint)
				];
			}
			if (type.kind === Kind.Struct) {
				return (left as Struct)[(b.right as IdExpr).value];
			}
			if (type === Type.Module) {
				const enumType = b.resolvedType as EnumType;
				const variant = enumType.variants.findIndex(
					(variant) => variant.name === (b.right as IdExpr).value
				);
				let constant = enumType.constants[variant];
				if (constant === undefined) {
					constant = Enum.create(enumType, variant, {});
					enumType.constants[variant] = constant;
				}
				return constant;
			}
			throw new Unreachable();
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
	}
}

function interperateCallExpr(i: Interpreter, c: CallExpr): unknown {
	const proc = interperate(i, c.proc);
	const args: unknown[] = [];
	for (const arg of c.args) {
		args.push(interperate(i, arg));
	}
	if (Type.of(proc) === Type.Module) {
		return Struct.create(c.resolvedType as StructType, { ...args });
	}
	return (proc as Proc).impl(args);
}

function interperateLitExpr(_i: Interpreter, l: LitExpr): unknown {
	return l.value;
}

function interperateIdExpr(i: Interpreter, id: IdExpr): unknown {
	return i.scopes.get(id.value);
}
