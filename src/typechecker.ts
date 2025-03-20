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
	Kind,
	LitExpr,
	LoopExpr,
	Module,
	ProcDecl,
	ProcExpr,
	ReturnStmt,
	Tuple,
	TupleExpr,
	Type,
	UnaryExpr,
	UnaryOp,
	VarDecl,
	WhileExpr,
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

function check(t: TypeChecker, ast: Ast): Type {
	switch (ast.type) {
		case AstType.Module:
			return checkModule(t, ast);
		case AstType.VarDecl:
			return checkVarDecl(t, ast);
		case AstType.ProcDecl:
			return checkProcDecl(t, ast);
		case AstType.BreakStmt:
			return checkBreakStmt(t, ast);
		case AstType.ContinueStmt:
			return checkContinueStmt(t, ast);
		case AstType.ReturnStmt:
			return checkReturnStmt(t, ast);
		case AstType.AssignStmt:
			return checkAssignStmt(t, ast);
		case AstType.ExprStmt:
			return checkExprStmt(t, ast);
		case AstType.BlockExpr:
			return checkBlockExpr(t, ast);
		case AstType.TupleExpr:
			return checkTupleExpr(t, ast);
		case AstType.GroupExpr:
			return checkGroupExpr(t, ast);
		case AstType.IfExpr:
			return checkIfExpr(t, ast);
		case AstType.LoopExpr:
			return checkLoopExpr(t, ast);
		case AstType.WhileExpr:
			return checkWhileExpr(t, ast);
		case AstType.ProcExpr:
			return checkProcExpr(t, ast);
		case AstType.BinaryExpr:
			return checkBinaryExpr(t, ast);
		case AstType.UnaryExpr:
			return checkUnaryExpr(t, ast);
		case AstType.CallExpr:
			return checkCallExpr(t, ast);
		case AstType.LitExpr:
			return checkLitExpr(t, ast);
		case AstType.IdExpr:
			return checkIdExpr(t, ast);
		case AstType.ProcTypeExpr:
			throw new Unreachable();
	}
}

function checkModule(t: TypeChecker, m: Module): Type {
	let acc: Type = Type.Unit;
	for (const decl of m.decls) {
		acc = check(t, decl);
	}
	return acc;
}

function checkVarDecl(t: TypeChecker, d: VarDecl): Type {
	const type = check(t, d.initExpr);
	if (d.declType !== undefined) {
		const declType = reifyType(t, d.declType);
		if (!assignable(type, declType)) {
			const declared = Type.print(declType);
			const found = Type.print(type);
			throw new TypeError(
				`Type ${found} is not assignable to type ${declared}!`,
				d.id.start,
				d.id.end
			);
		}
	}
	t.values[resolveId(d.id)] = type;
	return Type.Unit;
}

function checkProcDecl(t: TypeChecker, p: ProcDecl): Type {
	const params: Type[] = [];
	for (const param of p.initExpr.params) {
		const paramType = reifyType(t, param.type);
		t.values[resolveId(param.id)] = paramType;
		params.push(paramType);
	}
	const returns = reifyType(t, p.initExpr.returnType);
	t.values[resolveId(p.id)] = Type.proc(params, returns);
	check(t, p.initExpr);
	return Type.Unit;
}

function checkBreakStmt(_t: TypeChecker, _b: BreakStmt): Type {
	return Type.Unit;
}

function checkContinueStmt(_t: TypeChecker, _c: ContinueStmt): Type {
	return Type.Unit;
}

function checkReturnStmt(t: TypeChecker, r: ReturnStmt): Type {
	const type = r.expr !== undefined ? check(t, r.expr) : Type.Unit;
	t.returns.push(type);
	return type;
}

function checkAssignStmt(t: TypeChecker, a: AssignStmt): Type {
	const valueType = check(t, a.expr);
	const resolvedId = resolveId(a.id);
	const targetType = t.values[resolvedId];
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

function checkExprStmt(t: TypeChecker, e: ExprStmt): Type {
	return check(t, e.expr);
}

function checkBlockExpr(t: TypeChecker, b: BlockExpr): Type {
	let acc: Type | undefined = Type.Unit;
	for (const stmt of b.stmts) {
		acc = check(t, stmt);
	}
	return acc;
}

function checkTupleExpr(t: TypeChecker, u: TupleExpr): Type {
	const items: Type[] = [];
	for (const item of u.items) {
		items.push(check(t, item));
	}
	const type = Type.tuple(items);
	u.resolvedType = type;
	return type;
}

function checkGroupExpr(t: TypeChecker, g: GroupExpr): Type {
	return check(t, g.expr);
}

function checkIfExpr(t: TypeChecker, i: IfExpr): Type {
	const testType = check(t, i.testExpr);
	if (testType !== Type.Bool) {
		const found = Type.print(testType);
		throw new TypeError(
			`Type ${found} cannot be used as condition!`,
			i.testExpr.start,
			i.testExpr.end
		);
	}
	const thenType = check(t, i.thenExpr);
	if (i.elseExpr !== undefined) {
		const elseType = check(t, i.elseExpr);
		if (structurallyEq(thenType, elseType)) {
			return thenType;
		}
	}
	return Type.Unit;
}

function checkLoopExpr(t: TypeChecker, l: LoopExpr): Type {
	// TODO loop should really only be allowed as a stmt
	check(t, l.thenExpr);
	return Type.Unit;
}

function checkWhileExpr(t: TypeChecker, w: WhileExpr): Type {
	// TODO support acc
	const testType = check(t, w.testExpr);
	if (testType !== Type.Bool) {
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

function checkProcExpr(t: TypeChecker, p: ProcExpr): Type {
	const params: Type[] = [];
	for (const param of p.params) {
		const paramType = reifyType(t, param.type);
		t.values[resolveId(param.id)] = paramType;
		params.push(paramType);
	}
	const returns = reifyType(t, p.returnType);
	const returnsSave = t.returns;
	t.returns = [];
	const implicitReturn = check(t, p.implExpr);
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

function checkBinaryExpr(t: TypeChecker, b: BinaryExpr): Type {
	const l = check(t, b.left);
	const r = check(t, b.right);
	switch (b.op) {
		case BinaryOp.Add:
		case BinaryOp.Sub:
		case BinaryOp.Mul:
		case BinaryOp.Div:
		case BinaryOp.Rem:
		case BinaryOp.Pow:
			return checkBinaryExprHelper(b, l, r, [Type.Int, Type.Float]);
		case BinaryOp.Lt:
		case BinaryOp.Lte:
		case BinaryOp.Gt:
		case BinaryOp.Gte:
			checkBinaryExprHelper(b, l, r, [Type.Int, Type.Float]);
			return Type.Bool;
		case BinaryOp.And:
			return checkBinaryExprHelper(b, l, r, [Type.Bool]);
		case BinaryOp.Or:
			return checkBinaryExprHelper(b, l, r, [Type.Bool]);
		case BinaryOp.Eq:
		case BinaryOp.NotEq:
		case BinaryOp.Id:
		case BinaryOp.NotId:
			return checkBinaryExprHelper(b, l, r, [l]);
		case BinaryOp.Default:
		case BinaryOp.Member: {
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
				const rp = Type.print(r);
				throw new TypeError(
					`Operator . cannot be applied to Tuple and ${rp}!`,
					b.start,
					b.end
				);
			}
		}
	}
}

function checkBinaryExprHelper(
	b: BinaryExpr,
	l: Type,
	r: Type,
	v: Type[]
): Type {
	if (l !== r || !v.includes(l)) {
		const op = b.op;
		const lp = Type.print(l);
		const rp = Type.print(r);
		throw new TypeError(
			`Operator ${op} cannot be applied to ${lp} and ${rp}!`,
			b.start,
			b.end
		);
	}
	return l;
}

function checkUnaryExpr(t: TypeChecker, u: UnaryExpr): Type {
	const r = check(t, u.right);
	switch (u.op) {
		case UnaryOp.Not:
			return checkUnaryExprHelper(u, r, [Type.Bool]);
		case UnaryOp.Neg:
			return checkUnaryExprHelper(u, r, [Type.Int, Type.Float]);
		case UnaryOp.Spread:
			throw new Todo();
	}
}

function checkUnaryExprHelper(u: UnaryExpr, r: Type, v: Type[]): Type {
	if (!v.includes(r)) {
		const op = u.op;
		const rp = Type.print(r);
		throw new TypeError(
			`Operator ${op} cannot be applied to ${rp}!`,
			u.start,
			u.end
		);
	}
	return r;
}

function checkCallExpr(t: TypeChecker, c: CallExpr): Type {
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
		const argType = check(t, c.args[i]);
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

function checkLitExpr(_t: TypeChecker, l: LitExpr): Type {
	return Type.of(l.value);
}

function checkIdExpr(t: TypeChecker, i: IdExpr): Type {
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
	return into === Type.Any || structurallyEq(from, into);
}
