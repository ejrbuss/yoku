import { Token, Tokenizer, TokenType } from "./tokens.ts";
import {
	Ast,
	AstType,
	BinaryOp,
	UnaryOp,
	ProcExpr,
	IfExpr,
	BlockExpr,
	ContinueStmt,
	BreakStmt,
	ProcDecl,
	VarDecl,
	Module,
	ReturnStmt,
	AssertStmt,
	IdExpr,
	ProcParam,
	Access,
	ProcTypeExpr,
	WhileStmt,
	LoopStmt,
	TupleExpr,
	Repl,
	TestDecl,
} from "./core.ts";
import { CodeSource } from "./codesource.ts";

type TokenMatcher = TokenType | string;

type Parser = {
	tokens: Token[];
	position: number;
	starts: number[];
};

export class ParseError extends Error {
	constructor(
		readonly note: string,
		readonly needsMoreInput: boolean,
		readonly start: number,
		readonly end: number
	) {
		super(note);
	}
}

export const Parser = { parse };

function parse(source: CodeSource, replMode?: boolean) {
	const c = CodeSource.checkpoint(source);
	const tokens = Tokenizer.tokenize(source);
	for (const token of tokens) {
		if (token.type === TokenType.Error) {
			throw new ParseError(token.note ?? "_", false, token.start, token.end);
		}
	}
	const p: Parser = { tokens, position: 0, starts: [] };
	try {
		if (replMode) {
			return parseRepl(p);
		} else {
			// TODO how should module ID relate to path?
			return parseModule(p, source.path);
		}
	} catch (error) {
		if (replMode && error instanceof ParseError && error.needsMoreInput) {
			CodeSource.restore(source, c);
		}
		throw error;
	}
}

function parseModule(p: Parser, moduleId: string): Module {
	pushStart(p);
	const decls: Ast[] = [];
	while (hasMore(p)) {
		decls.push(parseDecl(p));
	}
	return {
		type: AstType.Module,
		id: moduleId,
		decls,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseRepl(p: Parser): Repl {
	pushStart(p);
	const lines: Ast[] = [];
	while (hasMore(p)) {
		const start = p.position;
		try {
			lines.push(parseDecl(p));
		} catch (declError) {
			if (!(declError instanceof ParseError)) {
				throw declError;
			}
			p.position = start;
			try {
				lines.push(parseStmt(p));
			} catch (stmtError) {
				if (stmtError instanceof ParseError && declError.needsMoreInput) {
					throw declError;
				}
				throw stmtError;
			}
		}
	}
	return {
		type: AstType.Repl,
		lines,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseDecl(p: Parser): Ast {
	if (lookAhead(p, "var") || lookAhead(p, "const")) {
		return parseVarDecl(p);
	}
	if (lookAhead(p, "proc") && lookAhead(p, TokenType.Id, 1)) {
		return parseProcDecl(p);
	}
	if (lookAhead(p, "test")) {
		return parseTestDecl(p);
	}
	const t = lookBehind(p);
	throw new ParseError(
		`Expected declaration!`,
		!hasMore(p),
		t?.start ?? getEnd(p),
		t?.end ?? getEnd(p)
	);
}

function parseStmt(p: Parser): Ast {
	if (lookAhead(p, "var") || lookAhead(p, "const")) {
		return parseVarDecl(p);
	}
	if (lookAhead(p, "break")) {
		return parseBreakStmt(p);
	}
	if (lookAhead(p, "continue")) {
		return parseContinueStmt(p);
	}
	if (lookAhead(p, "return")) {
		return parseReturnStmt(p);
	}
	if (lookAhead(p, "assert")) {
		return parseAssertStmt(p);
	}
	if (lookAhead(p, "loop")) {
		return parseLoopStmt(p);
	}
	if (lookAhead(p, "while")) {
		return parseWhileStmt(p);
	}

	return parseAssignStmt(p);
}

function parseVarDecl(p: Parser): VarDecl {
	pushStart(p);
	let access: Access;
	if (match(p, "const")) {
		access = Access.Const;
	} else {
		consume(p, "var");
		access = Access.Var;
	}
	const pattern = parsePattern(p);
	let declType: undefined | Ast;
	if (match(p, ":")) {
		declType = parseTypeExpr(p);
	}
	consume(p, "=");
	const initExpr = parseExpr(p);
	return {
		type: AstType.VarDecl,
		access,
		declType,
		pattern,
		initExpr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseProcDecl(p: Parser): ProcDecl {
	pushStart(p);
	consume(p, "proc");
	const procId = parseIdExpr(p);
	const initExpr = parseProcExpr(p);
	return {
		type: AstType.ProcDecl,
		id: procId,
		initExpr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseTestDecl(p: Parser): TestDecl {
	pushStart(p);
	consume(p, "test");
	const name = consume(p, TokenType.Lit);
	if (typeof name.value !== "string") {
		throw new ParseError("Expected test name!", false, name.start, name.end);
	}
	const thenExpr = parseBlockExpr(p);
	return {
		type: AstType.TestDecl,
		name: name.value,
		thenExpr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseBreakStmt(p: Parser): BreakStmt {
	pushStart(p);
	consume(p, "break");
	let label: undefined | IdExpr;
	if (lookAhead(p, TokenType.Id)) {
		label = parseIdExpr(p);
	}
	return {
		type: AstType.BreakStmt,
		label,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseReturnStmt(p: Parser): ReturnStmt {
	pushStart(p);
	consume(p, "return");
	let expr: Ast | undefined;
	if (!lookAhead(p, "}")) {
		expr = parseExpr(p);
	}
	return {
		type: AstType.ReturnStmt,
		expr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseAssertStmt(p: Parser): AssertStmt {
	pushStart(p);
	consume(p, "assert");
	const testExpr = parseExpr(p);
	return {
		type: AstType.AssertStmt,
		testExpr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseContinueStmt(p: Parser): ContinueStmt {
	pushStart(p);
	consume(p, "continue");
	let label: undefined | IdExpr;
	if (lookAhead(p, TokenType.Id)) {
		label = parseIdExpr(p);
	}
	return {
		type: AstType.ContinueStmt,
		label,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseAssignStmt(p: Parser): Ast {
	const target = parseExpr(p);
	if (match(p, "=")) {
		const expr = parseExpr(p);
		if (target.type === AstType.IdExpr) {
			return {
				type: AstType.AssignStmt,
				id: target,
				expr,
				start: target.start,
				end: expr.end,
			};
		} else {
			throw new ParseError(
				"Invalid assignment target!",
				false,
				target.start,
				target.end
			);
		}
	}
	return {
		type: AstType.ExprStmt,
		expr: target,
		start: target.start,
		end: target.end,
	};
}

function parseLoopStmt(p: Parser): LoopStmt {
	pushStart(p);
	consume(p, "loop");
	let label: undefined | IdExpr;
	if (lookAhead(p, TokenType.Id)) {
		label = parseIdExpr(p);
	}
	const thenExpr = parseBlockExpr(p);
	return {
		type: AstType.LoopStmt,
		label,
		thenExpr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseWhileStmt(p: Parser): WhileStmt {
	pushStart(p);
	consume(p, "while");
	const testExpr = parseExpr(p);
	const thenExpr = parseBlockExpr(p);
	return {
		type: AstType.WhileStmt,
		testExpr,
		thenExpr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseExpr(p: Parser): Ast {
	return parseLogicalOr(p);
}

function parseLogicalOr(p: Parser): Ast {
	let left = parseLogicalAnd(p);
	while (match(p, "|")) {
		const right = parseLogicalAnd(p);
		left = {
			type: AstType.BinaryExpr,
			op: BinaryOp.Or,
			left,
			right,
			start: left.start,
			end: right.end,
		};
	}
	return left;
}

function parseLogicalAnd(p: Parser): Ast {
	let left = parseEquality(p);
	while (match(p, "&")) {
		const right = parseEquality(p);
		left = {
			type: AstType.BinaryExpr,
			op: BinaryOp.And,
			left,
			right,
			start: left.start,
			end: right.end,
		};
	}
	return left;
}

function parseEquality(p: Parser): Ast {
	let left = parseComparison(p);
	while (
		match(p, BinaryOp.Eq) ||
		match(p, BinaryOp.NotEq) ||
		match(p, BinaryOp.Id) ||
		match(p, BinaryOp.NotId)
	) {
		const op = lookBehind(p)?.image as BinaryOp;
		const right = parseComparison(p);
		left = {
			type: AstType.BinaryExpr,
			op,
			left,
			right,
			start: left.start,
			end: right.end,
		};
	}
	return left;
}

function parseComparison(p: Parser): Ast {
	let left = parseTerm(p);
	while (
		match(p, BinaryOp.Gt) ||
		match(p, BinaryOp.Lt) ||
		match(p, BinaryOp.Gte) ||
		match(p, BinaryOp.Lte)
	) {
		const op = lookBehind(p)?.image as BinaryOp;
		const right = parseTerm(p);
		left = {
			type: AstType.BinaryExpr,
			op,
			left,
			right,
			start: left.start,
			end: right.end,
		};
	}
	return left;
}

function parseTerm(p: Parser): Ast {
	let left = parseFactor(p);
	while (match(p, BinaryOp.Add) || match(p, BinaryOp.Sub)) {
		const op = lookBehind(p)?.image as BinaryOp;
		const right = parseFactor(p);
		left = {
			type: AstType.BinaryExpr,
			op,
			left,
			right,
			start: left.start,
			end: right.end,
		};
	}
	return left;
}

function parseFactor(p: Parser): Ast {
	let left = parsePower(p);
	while (
		match(p, BinaryOp.Mul) ||
		match(p, BinaryOp.Div) ||
		match(p, BinaryOp.Rem)
	) {
		const op = lookBehind(p)?.image as BinaryOp;
		const right = parsePower(p);
		left = {
			type: AstType.BinaryExpr,
			op,
			left,
			right,
			start: left.start,
			end: right.end,
		};
	}
	return left;
}

function parsePower(p: Parser): Ast {
	let left = parseUnary(p);
	if (match(p, BinaryOp.Pow) || match(p, BinaryOp.Default)) {
		const op = lookBehind(p)?.image as BinaryOp;
		const right = parsePower(p);
		left = {
			type: AstType.BinaryExpr,
			op,
			left,
			right,
			start: left.start,
			end: right.end,
		};
	}
	return left;
}

function parseUnary(p: Parser): Ast {
	if (
		match(p, UnaryOp.Neg) ||
		match(p, UnaryOp.Not) ||
		match(p, UnaryOp.Spread)
	) {
		const op = lookBehind(p);
		const right = parseCall(p);
		return {
			type: AstType.UnaryExpr,
			op: op?.image as UnaryOp,
			right,
			start: op?.start as number,
			end: right.end,
		};
	}
	return parseCall(p);
}

function parseCall(p: Parser): Ast {
	let expr = parsePrimary(p);
	for (;;) {
		if (match(p, "(")) {
			const args: Ast[] = [];
			while (hasMore(p) && !lookAhead(p, ")")) {
				const arg = parseExpr(p);
				args.push(arg);
				if (args.length > 255) {
					throw new ParseError(
						"More than 255 arguments!",
						false,
						arg.start,
						arg.end
					);
				}
				if (!lookAhead(p, ")")) {
					consume(p, ",");
				}
			}
			consume(p, ")");
			expr = {
				type: AstType.CallExpr,
				proc: expr,
				args,
				start: expr.start,
				end: getEnd(p),
			};
		} else if (match(p, ".")) {
			const right = parsePrimary(p);
			if (
				right.type !== AstType.IdExpr &&
				(right.type !== AstType.LitExpr || typeof right.value !== "bigint")
			) {
				throw new ParseError(
					"Expected Id or Int!",
					false,
					right.start,
					right.end
				);
			}
			expr = {
				type: AstType.BinaryExpr,
				op: BinaryOp.Member,
				left: expr,
				right,
				start: expr.start,
				end: getEnd(p),
			};
		} else {
			break;
		}
	}
	return expr;
}

function parsePrimary(p: Parser): Ast {
	if (lookAhead(p, "(")) {
		return parseTupleExpr(p);
	}
	if (lookAhead(p, "do")) {
		return parseBlockExpr(p);
	}
	if (lookAhead(p, "if")) {
		return parseIfExpr(p);
	}
	if (lookAhead(p, "proc")) {
		return parseProcExpr(p);
	}
	if (lookAhead(p, TokenType.Lit)) {
		const lit = consume(p);
		return {
			type: AstType.LitExpr,
			value: lit.value,
			start: lit.start,
			end: lit.end,
		};
	}
	return parseIdExpr(p);
}

function parseTupleExpr(p: Parser): Ast {
	pushStart(p);
	consume(p, "(");
	if (match(p, ")")) {
		return {
			type: AstType.TupleExpr,
			items: [],
			start: popStart(p),
			end: getEnd(p),
		};
	} else {
		const expr = parseExpr(p);
		if (match(p, ",")) {
			const items = [expr];
			while (hasMore(p) && !lookAhead(p, ")")) {
				items.push(parseExpr(p));
				if (!lookAhead(p, ")")) {
					consume(p, ",");
				}
			}
			consume(p, ")");
			return {
				type: AstType.TupleExpr,
				items,
				start: popStart(p),
				end: getEnd(p),
			};
		} else {
			consume(p, ")");
			return {
				type: AstType.GroupExpr,
				expr,
				start: popStart(p),
				end: getEnd(p),
			};
		}
	}
}

function parseBlockExpr(p: Parser): BlockExpr {
	pushStart(p);
	match(p, "do");
	consume(p, "{");
	const stmts: Ast[] = [];
	while (hasMore(p) && !lookAhead(p, "}")) {
		stmts.push(parseStmt(p));
		match(p, ";");
	}
	consume(p, "}");
	return {
		type: AstType.BlockExpr,
		stmts,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseIfExpr(p: Parser): IfExpr {
	pushStart(p);
	consume(p, "if");
	const testExpr = parseExpr(p);
	const thenExpr = parseBlockExpr(p);
	let elseExpr: Ast | undefined;
	if (match(p, "else")) {
		if (lookAhead(p, "if")) {
			elseExpr = parseIfExpr(p);
		} else {
			elseExpr = parseBlockExpr(p);
		}
	}
	return {
		type: AstType.IfExpr,
		testExpr,
		thenExpr,
		elseExpr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseProcExpr(p: Parser): ProcExpr {
	pushStart(p);
	match(p, "proc");
	consume(p, "(");
	const params: ProcParam[] = [];
	while (hasMore(p) && !lookAhead(p, ")")) {
		const id = parseIdExpr(p);
		consume(p, ":");
		const type = parseTypeExpr(p);
		params.push({ id, type });
		if (params.length > 255) {
			throw new ParseError(
				"More than 255 parameters!",
				false,
				id.start,
				id.end
			);
		}
		if (!lookAhead(p, ")")) {
			consume(p, ",");
		}
	}
	consume(p, ")");
	let returnType: Ast;
	if (match(p, "->")) {
		returnType = parseTypeExpr(p);
	} else {
		returnType = {
			type: AstType.TupleExpr,
			items: [],
			start: getEnd(p),
			end: getEnd(p),
		};
	}
	const implExpr = parseBlockExpr(p);
	return {
		type: AstType.ProcExpr,
		params,
		implExpr,
		returnType,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseIdExpr(p: Parser): IdExpr {
	const id = consume(p, TokenType.Id);
	return {
		type: AstType.IdExpr,
		value: id.image,
		start: id.start,
		end: id.end,
	};
}

function parseTypeExpr(p: Parser): Ast {
	if (lookAhead(p, "proc")) {
		return parseProcTypeExpr(p);
	}
	if (lookAhead(p, "(")) {
		return parseTupleTypeExpr(p);
	}
	return parseIdExpr(p);
}

function parseProcTypeExpr(p: Parser): ProcTypeExpr {
	pushStart(p);
	consume(p, "proc");
	consume(p, "(");
	const params: Ast[] = [];
	while (hasMore(p) && !lookAhead(p, ")")) {
		const param = parseTypeExpr(p);
		params.push(param);
		if (params.length > 255) {
			throw new ParseError(
				"More than 255 parameters!",
				false,
				param.start,
				param.end
			);
		}
		if (!lookAhead(p, ")")) {
			consume(p, ",");
		}
	}
	consume(p, ")");
	consume(p, "->");
	const returnType = parseTypeExpr(p);
	return {
		type: AstType.ProcTypeExpr,
		params,
		returnType,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseTupleTypeExpr(p: Parser): TupleExpr {
	pushStart(p);
	consume(p, "(");
	const items: Ast[] = [];
	while (hasMore(p) && !lookAhead(p, ")")) {
		items.push(parseTypeExpr(p));
		if (!lookAhead(p, ")")) {
			consume(p, ",");
		}
	}
	consume(p, ")");
	return {
		type: AstType.TupleExpr,
		items,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parsePattern(p: Parser): Ast {
	if (lookAhead(p, "(")) {
		return parseTuplePattern(p);
	}
	if (lookAhead(p, "_")) {
		return parseWildcardExpr(p);
	}
	return parseIdExpr(p);
}

function parseTuplePattern(p: Parser): TupleExpr {
	pushStart(p);
	consume(p, "(");
	const items: Ast[] = [];
	while (hasMore(p) && !lookAhead(p, ")")) {
		items.push(parsePattern(p));
		if (!lookAhead(p, ")")) {
			consume(p, ",");
		}
	}
	consume(p, ")");
	return {
		type: AstType.TupleExpr,
		items,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseWildcardExpr(p: Parser): Ast {
	pushStart(p);
	consume(p, "_");
	return {
		type: AstType.WildCardExpr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function hasMore(p: Parser): boolean {
	return p.position < p.tokens.length;
}

function matches(t: Token | undefined, m?: TokenMatcher): boolean {
	return (
		t !== undefined &&
		(m === undefined || (m in TokenType && m === t.type) || m === t.image)
	);
}

function lookBehind(p: Parser, m?: TokenMatcher): Token | undefined {
	return lookAhead(p, m, -1);
}

function lookAhead(
	p: Parser,
	m?: TokenMatcher,
	skip: number = 0
): Token | undefined {
	const token = p.tokens[p.position + skip];
	if (matches(token, m)) {
		return token;
	}
	return undefined;
}

function match(p: Parser, m?: TokenMatcher): Token | undefined {
	const token = lookAhead(p);
	if (matches(token, m)) {
		p.position++;
		return token;
	}
	return undefined;
}

function consume(p: Parser, m?: TokenMatcher, note?: string): Token {
	const token = lookAhead(p);
	if (matches(token, m)) {
		p.position++;
		return token as Token;
	}
	if (note === undefined) {
		if (m === undefined) {
			note = "Unexpected end of input!";
		} else if (m in TokenType) {
			note = `Expected ${m}!`;
		} else {
			note = `Expected "${m}"!`;
		}
	}
	const end = getEnd(p);
	throw new ParseError(
		note,
		!hasMore(p),
		token?.start ?? end,
		token?.end ?? end
	);
}

function pushStart(p: Parser): void {
	p.starts.push(lookAhead(p)?.start ?? 0);
}

function popStart(p: Parser): number {
	return p.starts.pop() ?? 0;
}

function getEnd(p: Parser): number {
	return lookBehind(p)?.end ?? 0;
}
