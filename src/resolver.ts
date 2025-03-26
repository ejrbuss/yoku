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
	UnaryExpr,
	VarDecl,
	WhileStmt,
} from "./core.ts";
import { BinaryOp } from "./ops.ts";
import { Unreachable } from "./utils.ts";

type Decl = {
	mutable: boolean;
	builtin: boolean;
	resolvedId: number;
};

type Scope = {
	nextId: number;
	decls: Record<string, Decl>;
};

export class ResolutionError extends Error {
	constructor(
		readonly note: string,
		readonly start: number,
		readonly end: number
	) {
		super(note);
	}
}

export type Resolver = {
	scopes: Scope[];
	loopStack: (string | undefined)[];
	procStack: number;
	allowShadowGlobals: boolean;
};

export const Resolver = {
	create,
	resolve,
	declareBuiltin,
};

function create(): Resolver {
	return {
		scopes: [{ nextId: 0, decls: {} }],
		loopStack: [],
		procStack: 0,
		allowShadowGlobals: false,
	};
}

function declareBuiltin(r: Resolver, id: string): number {
	const globalScope = r.scopes[0];
	const resolvedId = globalScope.nextId++;
	globalScope.decls[id] = { mutable: false, builtin: true, resolvedId };
	return resolvedId;
}

function declarePattern(
	r: Resolver,
	pattern: Ast,
	mutable: boolean,
	assert: boolean
): void {
	if (pattern.type === AstType.BinaryExpr) {
		if (pattern.op !== BinaryOp.As) {
			throw new Unreachable();
		}
		declarePattern(r, pattern.left, mutable, assert);
		declarePattern(r, pattern.right, mutable, assert);
		return;
	}
	if (pattern.type === AstType.TupleExpr) {
		for (const item of pattern.items) {
			declarePattern(r, item, mutable, assert);
		}
		return;
	}
	if (pattern.type === AstType.StructExpr) {
		for (const field of pattern.fieldInits) {
			declarePattern(r, field.expr ?? field.id, mutable, assert);
		}
		return;
	}
	if (pattern.type === AstType.CallExpr) {
		for (const item of pattern.args) {
			declarePattern(r, item, mutable, assert);
		}
		return;
	}
	if (pattern.type === AstType.WildCardExpr) {
		return;
	}
	if (pattern.type === AstType.LitExpr) {
		if (!assert) {
			throw new ResolutionError(
				"You cannot use a literal pattern outside of an assert or match!",
				pattern.start,
				pattern.end
			);
		}
		return;
	}
	if (pattern.type === AstType.IdExpr) {
		const globalScope = r.scopes[0];
		const priorDecl = globalScope.decls[pattern.value];
		if (
			priorDecl !== undefined &&
			(!r.allowShadowGlobals || priorDecl.builtin)
		) {
			throw new ResolutionError(
				`You cannot redeclare a ${priorDecl.builtin ? "builtin" : "global"}!`,
				pattern.start,
				pattern.end
			);
		}
		const scope = r.scopes[r.scopes.length - 1];
		pattern.resolvedId = scope.nextId++;
		scope.decls[pattern.value] = {
			resolvedId: pattern.resolvedId,
			mutable,
			builtin: false,
		};
		return;
	}
	throw new Unreachable();
}

function pushScope(r: Resolver): void {
	const higherScope = r.scopes[r.scopes.length - 1];
	r.scopes.push({ nextId: higherScope.nextId, decls: {} });
}

function popScope(r: Resolver): void {
	r.scopes.pop();
}

function resolve(r: Resolver, ast: Ast): void {
	switch (ast.type) {
		case AstType.ModuleDecls:
			return resolveModuleDecls(r, ast);
		case AstType.ReplExprs:
			return resolveReplExprs(r, ast);
		case AstType.VarDecl:
			return resolveVarDecl(r, ast);
		case AstType.ProcDecl:
			return resolveProcDecl(r, ast);
		case AstType.TypeDecl:
			return resolveTypeDecl(r, ast);
		case AstType.StructDecl:
			return resolveStructDecl(r, ast);
		case AstType.TestDecl:
			return resolveTestDecl(r, ast);
		case AstType.BreakStmt:
			return resolveBreakStmt(r, ast);
		case AstType.ContinueStmt:
			return resolveContinueStmt(r, ast);
		case AstType.ReturnStmt:
			return resolveReturnStmt(r, ast);
		case AstType.AssertStmt:
			return resolveAssertStmt(r, ast);
		case AstType.LoopStmt:
			return resolveLoopStmt(r, ast);
		case AstType.WhileStmt:
			return resolveWhileStmt(r, ast);
		case AstType.AssignStmt:
			return resolveAssignStmt(r, ast);
		case AstType.ExprStmt:
			return resolveExprStmt(r, ast);
		case AstType.BlockExpr:
			return resolverBlockExpr(r, ast);
		case AstType.TupleExpr:
			return resolveTupleExpr(r, ast);
		case AstType.StructExpr:
			return resolveStructExpr(r, ast);
		case AstType.GroupExpr:
			return resolveGroupExpr(r, ast);
		case AstType.IfExpr:
			return resolveIfExpr(r, ast);
		case AstType.MatchExpr:
			return resolveMatchExpr(r, ast);
		case AstType.ThrowExpr:
			return resolveThrowExpr(r, ast);
		case AstType.ProcExpr:
			return resolveProcExpr(r, ast);
		case AstType.TypeExpr:
			return;
		case AstType.BinaryExpr:
			return resolveBinaryExpr(r, ast);
		case AstType.UnaryExpr:
			return resolveUnaryExpr(r, ast);
		case AstType.CallExpr:
			return resolveCallExpr(r, ast);
		case AstType.LitExpr:
			return;
		case AstType.IdExpr:
			return resolveIdExpr(r, ast);
		case AstType.ProcTypeExpr:
			throw new Unreachable();
		case AstType.WildCardExpr:
			throw new Unreachable();
	}
	throw new Unreachable(ast satisfies never);
}

function resolveModuleDecls(r: Resolver, m: ModuleDecls): void {
	// TODO: the repl needs to keep a module open during execution, and module
	// scope needs to be enforced.
	if (r.procStack !== 0) {
		throw new Unreachable();
	}
	for (const decl of m.decls) {
		resolve(r, decl);
	}
}

function resolveReplExprs(r: Resolver, e: ReplExprs): void {
	for (const line of e.lines) {
		resolve(r, line);
	}
}

function resolveVarDecl(r: Resolver, v: VarDecl): void {
	resolve(r, v.initExpr);
	declarePattern(r, v.pattern, v.mutable, v.assert);
}

function resolveProcDecl(r: Resolver, p: ProcDecl): void {
	if (r.procStack !== 0) {
		throw new Unreachable();
	}
	declarePattern(r, p.id, false, false);
	resolveProcExpr(r, p.initExpr);
}

function resolveTypeDecl(r: Resolver, t: TypeDecl): void {
	if (r.procStack !== 0) {
		throw new Unreachable();
	}
	declarePattern(r, t.id, false, false);
}

function resolveStructDecl(r: Resolver, s: StructDecl): void {
	if (r.procStack !== 0) {
		throw new Unreachable();
	}
	declarePattern(r, s.id, false, false);
	if (s.fields !== undefined) {
		for (const field of s.fields) {
			if (field.expr !== undefined) {
				resolve(r, field.expr);
			}
		}
	}
}

function resolveTestDecl(r: Resolver, t: TestDecl): void {
	resolve(r, t.thenExpr);
}

function resolveBreakStmt(r: Resolver, b: BreakStmt): void {
	if (b.label === undefined && r.loopStack.length === 0) {
		throw new ResolutionError("Cannot break outside a loop!", b.start, b.end);
	}
	if (b.label !== undefined && !r.loopStack.includes(b.label.value)) {
		throw new ResolutionError("Undeclared label!", b.label.start, b.label.end);
	}
}

function resolveContinueStmt(r: Resolver, c: ContinueStmt): void {
	if (c.label === undefined && r.loopStack.length === 0) {
		throw new ResolutionError(
			"Cannot continue outside a loop!",
			c.start,
			c.end
		);
	}
	if (c.label !== undefined && !r.loopStack.includes(c.label.value)) {
		throw new ResolutionError("Undeclared label!", c.label.start, c.label.end);
	}
}

function resolveReturnStmt(r: Resolver, s: ReturnStmt): void {
	if (r.procStack < 1) {
		throw new ResolutionError("Cannot return outside a proc!", s.start, s.end);
	}
	if (s.expr !== undefined) {
		resolve(r, s.expr);
	}
}

function resolveAssertStmt(r: Resolver, a: AssertStmt): void {
	resolve(r, a.testExpr);
}

function resolveLoopStmt(r: Resolver, l: LoopStmt): void {
	r.loopStack.push(l.label?.value);
	resolve(r, l.thenExpr);
	r.loopStack.pop();
}

function resolveWhileStmt(r: Resolver, w: WhileStmt): void {
	r.loopStack.push(undefined);
	resolve(r, w.testExpr);
	resolve(r, w.thenExpr);
	r.loopStack.pop();
}

function resolveAssignStmt(r: Resolver, a: AssignStmt): void {
	if (a.target === undefined) {
		for (const scope of r.scopes.toReversed()) {
			const decl = scope.decls[a.id.value];
			if (decl !== undefined) {
				if (!decl.mutable) {
					throw new ResolutionError(
						"Cannot assign to a const!",
						a.id.start,
						a.id.end
					);
				}
				a.id.resolvedId = decl.resolvedId;
				resolve(r, a.expr);
				return;
			}
		}
		throw new ResolutionError("Undeclared variable!", a.id.start, a.id.end);
	} else {
		resolve(r, a.target);
		resolve(r, a.expr);
	}
}

function resolveExprStmt(r: Resolver, e: ExprStmt): void {
	resolve(r, e.expr);
}

function resolverBlockExpr(r: Resolver, b: BlockExpr): void {
	pushScope(r);
	for (const stmt of b.stmts) {
		resolve(r, stmt);
	}
	popScope(r);
}

function resolveTupleExpr(r: Resolver, t: TupleExpr): void {
	for (const item of t.items) {
		resolve(r, item);
	}
}

function resolveStructExpr(r: Resolver, s: StructExpr): void {
	for (const f of s.fieldInits) {
		resolve(r, f.expr ?? f.id);
	}
	if (s.spreadInit !== undefined) {
		resolve(r, s.spreadInit);
	}
}

function resolveGroupExpr(r: Resolver, g: GroupExpr): void {
	resolve(r, g.expr);
}

function resolveIfExpr(r: Resolver, i: IfExpr): void {
	if (i.pattern !== undefined) {
		pushScope(r);
		declarePattern(r, i.pattern, i.mutable, true);
		resolve(r, i.testExpr);
		resolve(r, i.thenExpr);
		popScope(r);
	} else {
		resolve(r, i.testExpr);
		resolve(r, i.thenExpr);
	}
	if (i.elseExpr !== undefined) {
		resolve(r, i.elseExpr);
	}
}

function resolveMatchExpr(r: Resolver, m: MatchExpr): void {
	if (m.testExpr !== undefined) {
		resolve(r, m.testExpr);
	}
	for (const c of m.cases) {
		pushScope(r);
		if (c.pattern !== undefined) {
			declarePattern(r, c.pattern, false, true);
		}
		if (c.testExpr !== undefined) {
			resolve(r, c.testExpr);
		}
		resolve(r, c.thenExpr);
		popScope(r);
	}
}

function resolveThrowExpr(r: Resolver, t: ThrowExpr): void {
	resolve(r, t.expr);
}

function resolveProcExpr(r: Resolver, p: ProcExpr): void {
	pushScope(r);
	for (const param of p.params) {
		declarePattern(r, param.pattern, false, false);
	}
	const saveLoopStack = r.loopStack;
	r.loopStack = [];
	r.procStack++;
	resolve(r, p.implExpr);
	r.procStack--;
	r.loopStack = saveLoopStack;
	popScope(r);
}

function resolveBinaryExpr(r: Resolver, b: BinaryExpr): void {
	resolve(r, b.left);
	if (b.op !== BinaryOp.Member) {
		resolve(r, b.right);
	}
}

function resolveUnaryExpr(r: Resolver, u: UnaryExpr): void {
	resolve(r, u.right);
}

function resolveCallExpr(r: Resolver, c: CallExpr): void {
	resolve(r, c.proc);
	for (const arg of c.args) {
		resolve(r, arg);
	}
}

function resolveIdExpr(r: Resolver, i: IdExpr): void {
	for (const scope of r.scopes.toReversed()) {
		const decl = scope.decls[i.value];
		if (decl !== undefined) {
			i.resolvedId = decl.resolvedId;
			return;
		}
	}
	throw new ResolutionError("Undeclared variable!", i.start, i.end);
}
