import { Builtins, BuiltinTypes } from "./builtins.ts";
import { Enum, Module, print, Proc, Struct, Tuple, Unit } from "./core.ts";
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
	AstRoot,
	ProcExpr,
	AstReturnStmt,
	AstStructDecl,
	AstConstructorExpr,
	ThrowExpr,
	TupleExpr,
	AstAssignFieldStmt,
	AstVarDecl,
	AstTypeDecl,
	AstTestDecl,
	AstProcDecl,
	AstEnumDecl,
	AstPattern,
	AstDecl,
	AstStmt,
	AstExpr,
	AstTypeExpr,
	AstLit,
	AstId,
	UnaryExpr,
	Ast,
	AstWhileStmt,
	AstModuleDecl,
	AstImplDecl,
} from "./ast.ts";
import { BinaryOp, UnaryOp } from "./ops.ts";
import { Scopes } from "./scopes.ts";
import { Kind, TupleType, Type, VariantType } from "./types.ts";
import { NonNull, enumerate, structurallyEq, zip } from "./utils.ts";
import { unreachable } from "@std/assert/unreachable";
import { assert } from "@std/assert/assert";
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
			value: Module.for(Type.moduleOf(builtinType)),
		});
	}
	return { scopes, test };
}

function unify(
	i: Interpreter,
	p: AstPattern,
	value: unknown,
	throwOnFailure: boolean,
	typeAnnotation?: Type
): boolean {
	if (typeAnnotation !== undefined) {
		const from = Type.of(value);
		const into = typeAnnotation;
		if (!Type.assignable(from, into)) {
			if (throwOnFailure) {
				const i = Type.print(into);
				const f = print(from);
				throw new RuntimeError(
					`Expected type ${i} but found ${f}`,
					p.start,
					p.end
				);
			} else {
				return false;
			}
		}
	}
	switch (p.tag) {
		case AstTag.Wildcard: {
			return true;
		}
		case AstTag.Lit: {
			if (!structurallyEq(p.value, value)) {
				if (throwOnFailure) {
					const expected = print(p.value);
					const actual = print(value);
					throw new RuntimeError(
						`Expected ${expected} but found ${actual}!`,
						p.start,
						p.end
					);
				} else {
					return false;
				}
			}
			return true;
		}
		case AstTag.Id: {
			i.scopes.declareLocal(p.value, {
				mutable: true,
				allowShadow: true,
				value,
			});
			return true;
		}
		case AstTag.AsPattern: {
			return (
				unify(i, p.left, value, throwOnFailure) &&
				unify(i, p.right, value, throwOnFailure)
			);
		}
		case AstTag.TuplePattern: {
			const tuple = value as Tuple;
			for (const [pi, vi] of zip(p.items, tuple.items)) {
				if (!unify(i, pi, vi, throwOnFailure)) {
					return false;
				}
			}
			return true;
		}
		case AstTag.ConstructorPattern: {
			if (Struct.is(value)) {
				for (const f of p.fieldPatterns) {
					if (!unify(i, f.pattern ?? f.id, value[f.id.value], throwOnFailure)) {
						return false;
					}
				}
				return true;
			}
			if (Enum.is(value)) {
				const actualVariant = value.$type as VariantType;
				const expectedVariant = p.resolvedType as VariantType;
				if (actualVariant !== expectedVariant) {
					if (throwOnFailure) {
						const e = Type.print(expectedVariant);
						const a = Type.print(actualVariant);
						throw new RuntimeError(
							`Expected ${e} but found ${a}!`,
							p.start,
							p.end
						);
					}
					return false;
				}
				for (const f of p.fieldPatterns) {
					if (!unify(i, f.pattern ?? f.id, value[f.id.value], throwOnFailure)) {
						return false;
					}
				}
				return true;
			}
			return unreachable(print(value));
		}
	}
	return unreachable(`${p}`);
}

function interperate(
	i: Interpreter,
	ast: AstRoot | AstDecl | AstStmt | AstExpr
): unknown {
	switch (ast.tag) {
		case AstTag.Root:
			return interperateRoot(i, ast);
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
		case AstTag.ModuleDecl:
			return interperateModuleDecl(i, ast);
		case AstTag.ImplDecl:
			return interperateImplDecl(i, ast);
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
		case AstTag.WhileStmt:
			return interperateWhileStmt(i, ast);
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
		case AstTag.ConstructorExpr:
			return interperateConstructorExpr(i, ast);
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
		case AstTag.Lit:
			return interperateLit(i, ast);
		case AstTag.Id:
			return interperateId(i, ast);
	}
	unreachable(`${Ast.print(ast)}`);
}

function interperateRoot(i: Interpreter, m: AstRoot): unknown {
	let result: unknown = Unit;
	for (const decl of m.children) {
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
	assert(t.moduleType);
	const module = Module.for(t.moduleType);
	unify(i, t.id, module, true);
	return Unit;
}

function interperateStructDecl(i: Interpreter, s: AstStructDecl): unknown {
	assert(s.moduleType);
	const module = Module.for(s.moduleType);
	unify(i, s.id, module, true);
	return Unit;
}

function interperateEnumDecl(i: Interpreter, e: AstEnumDecl): unknown {
	assert(e.moduleType);
	const module = Module.for(e.moduleType);
	unify(i, e.id, module, true);
	assert(e.moduleType.associatedType?.kind == Kind.Enum);
	for (const variant of e.moduleType.associatedType.variants) {
		if (variant.constant) {
			module[variant.name] = Enum.create(variant, {});
		} else {
			module[variant.name] = Module.for(Type.moduleOf(variant));
		}
	}
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

function interperateModuleDecl(i: Interpreter, m: AstModuleDecl): unknown {
	assert(m.moduleType);
	const module = Module.for(m.moduleType);
	i.scopes.openScope();
	for (const decl of m.decls) {
		interperate(i, decl);
	}
	const values = i.scopes.dropScope();
	for (const [name, decl] of Object.entries(values)) {
		module[name] = decl.value;
	}
	unify(i, m.id, module, true);
	return Unit;
}

function interperateImplDecl(i: Interpreter, d: AstImplDecl): unknown {
	assert(d.moduleType);
	const module = Module.for(d.moduleType);
	i.scopes.openScope();
	for (const decl of d.decls) {
		interperate(i, decl);
	}
	const values = i.scopes.dropScope();
	for (const [name, decl] of Object.entries(values)) {
		module[name] = decl.value;
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

function interperateWhileStmt(i: Interpreter, w: AstWhileStmt): unknown {
	while (interperate(i, w.testExpr)) {
		try {
			interperate(i, w.thenExpr);
		} catch (e) {
			if (e instanceof Continue && e.label === undefined) {
				continue;
			}
			if (e instanceof Break && e.label === undefined) {
				return Unit;
			}
			throw e;
		}
	}
	return Unit;
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

function interperateConstructorExpr(
	i: Interpreter,
	s: AstConstructorExpr
): unknown {
	const type = s.resolvedType;
	assert(type);
	const values: Record<string, unknown> = {};
	if (s.spreadInit !== undefined) {
		const spread = interperate(i, s.spreadInit) as Struct;
		for (const [i, field] of enumerate(type.fields)) {
			values[field.name ?? i] = spread[field.name ?? i];
		}
	}
	for (const fieldInit of s.fieldInits) {
		values[fieldInit.id.value] = interperate(i, fieldInit.expr ?? fieldInit.id);
	}
	if (type.kind === Kind.Struct) {
		return Struct.create(type, values);
	}
	if (type.kind === Kind.Variant) {
		return Enum.create(type, values);
	}
	unreachable(`${Type.print(type)}`);
}

function interperateGroupExpr(i: Interpreter, g: GroupExpr): unknown {
	return interperate(i, g.expr);
}

function interperateIfExpr(i: Interpreter, f: IfExpr): unknown {
	if (f.pattern !== undefined) {
		const value = interperate(i, f.testExpr);
		if (unify(i, f.pattern, value, false, f.resolvedDeclType)) {
			console.log("was true!");
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
	const procType = p.resolvedType;
	assert(procType?.kind === Kind.Proc);
	return Proc.create(undefined, procType, (args) => {
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

function interperateTypeExpr(_i: Interpreter, t: AstTypeExpr): unknown {
	const type = t.resolvedType;
	assert(type);
	return type;
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
			if (b.moduleType !== undefined) {
				const module = Module.for(b.moduleType);
				const unbound = module[(b.right as AstId).value];
				assert(Proc.is(unbound));
				const bound = Proc.create(
					unbound.name,
					Type.withoutThisArg(unbound.$type),
					(args) => unbound.impl([left, ...args])
				);
				return bound;
			}
			if (type.kind === Kind.Tuple) {
				return (left as Tuple).items[
					(b.right as AstLit).value as unknown as number
				];
			}
			if (
				type.kind === Kind.Struct ||
				type.kind === Kind.Variant ||
				type.kind === Kind.Module
			) {
				return (left as NonNull)[`${(b.right as AstId).value}`];
			}
			unreachable();
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
	const type = Type.of(proc);
	if (type.kind === Kind.Module) {
		assert(type.associatedType);
		if (type.associatedType.kind === Kind.Struct) {
			return Struct.create(type.associatedType, { ...args });
		}
		if (type.associatedType.kind === Kind.Variant) {
			return Enum.create(type.associatedType, { ...args });
		}
	}
	return (proc as Proc).impl(args);
}

function interperateLit(_i: Interpreter, l: AstLit): unknown {
	return l.value;
}

function interperateId(i: Interpreter, id: AstId): unknown {
	return i.scopes.get(id.value);
}
