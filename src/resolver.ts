import {
	Access,
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
	LoopExpr,
	Module,
	ProcDecl,
	ProcExpr,
	ReturnStmt,
	UnaryExpr,
	VarDecl,
	WhileExpr,
} from "./core.ts";

type Decl = {
	access: Access;
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
};

export const Resolver = { create, resolve, declareGlobal };

function create(): Resolver {
	return {
		scopes: [{ nextId: 0, decls: {} }],
		loopStack: [],
		procStack: 0,
	};
}

function declareGlobal(r: Resolver, id: string): number {
	const globalScope = r.scopes[0];
	const resolvedId = globalScope.nextId++;
	globalScope.decls[id] = { resolvedId, access: Access.Const };
	return resolvedId;
}

function declare(r: Resolver, id: IdExpr, access: Access) {
	const globalScope = r.scopes[0];
	if (globalScope.decls[id.value] !== undefined) {
		throw new ResolutionError(`You cannot redeclare global!`, id.start, id.end);
	}
	const scope = r.scopes[r.scopes.length - 1];
	id.resolvedId = scope.nextId++;
	scope.decls[id.value] = { resolvedId: id.resolvedId, access };
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
		case AstType.Module:
			return resolveModule(r, ast);
		case AstType.VarDecl:
			return resolveVarDecl(r, ast);
		case AstType.ProcDecl:
			return resolveProcDecl(r, ast);
		case AstType.BreakStmt:
			return resolveBreakStmt(r, ast);
		case AstType.ContinueStmt:
			return resolveContinueStmt(r, ast);
		case AstType.ReturnStmt:
			return resolveReturnStmt(r, ast);
		case AstType.AssignStmt:
			return resolveAssignStmt(r, ast);
		case AstType.ExprStmt:
			return resolveExprStmt(r, ast);
		case AstType.BlockExpr:
			return resolverBlockExpr(r, ast);
		case AstType.GroupExpr:
			return resolveGroupExpr(r, ast);
		case AstType.IfExpr:
			return resolveIfExpr(r, ast);
		case AstType.LoopExpr:
			return resolveLoopExpr(r, ast);
		case AstType.WhileExpr:
			return resolveWhileExpr(r, ast);
		case AstType.ProcExpr:
			return resolveProcExpr(r, ast);
		case AstType.BinaryExpr:
			return resolveBinaryExpr(r, ast);
		case AstType.UnaryExpr:
			return resolveUnaryExpr(r, ast);
		case AstType.CallExpr:
			return resolveCallExpr(r, ast);
		case AstType.LitExpr:
			return resolveLitExpr(r, ast);
		case AstType.IdExpr:
			return resolveIdExpr(r, ast);
	}
}

function resolveModule(r: Resolver, m: Module): void {
	// TODO: the repl needs to keep a module open during execution, and module
	// scope needs to be enforced.
	for (const decl of m.decls) {
		resolve(r, decl);
	}
}

function resolveVarDecl(r: Resolver, v: VarDecl): void {
	resolve(r, v.initExpr);
	declare(r, v.id, v.access);
}

function resolveProcDecl(r: Resolver, p: ProcDecl): void {
	declare(r, p.id, Access.Const);
	resolveProcExpr(r, p.initExpr);
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

function resolveAssignStmt(r: Resolver, a: AssignStmt): void {
	for (let j = r.scopes.length - 1; j >= 0; j--) {
		const scope = r.scopes[j];
		const decl = scope.decls[a.id.value];
		if (decl !== undefined) {
			if (decl.access === Access.Const) {
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

function resolveGroupExpr(r: Resolver, g: GroupExpr): void {
	resolve(r, g.expr);
}

function resolveIfExpr(r: Resolver, i: IfExpr): void {
	resolve(r, i.testExpr);
	resolve(r, i.thenExpr);
	if (i.elseExpr !== undefined) {
		resolve(r, i.elseExpr);
	}
}

function resolveLoopExpr(r: Resolver, l: LoopExpr): void {
	r.loopStack.push(l.label?.value);
	resolve(r, l.thenExpr);
	r.loopStack.pop();
}

function resolveWhileExpr(r: Resolver, w: WhileExpr): void {
	resolve(r, w.testExpr);
	resolve(r, w.thenExpr);
}

function resolveProcExpr(r: Resolver, p: ProcExpr): void {
	pushScope(r);
	for (const param of p.params) {
		declare(r, param.id, Access.Const);
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
	resolve(r, b.right);
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

function resolveLitExpr(_r: Resolver, _l: LitExpr): void {}

function resolveIdExpr(r: Resolver, i: IdExpr): void {
	for (let j = r.scopes.length - 1; j >= 0; j--) {
		const scope = r.scopes[j];
		const decl = scope.decls[i.value];
		if (decl !== undefined) {
			i.resolvedId = decl.resolvedId;
			return;
		}
	}
	throw new ResolutionError("Undeclared variable!", i.start, i.end);
}
