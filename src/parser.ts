import { Token, TokenType } from "./tokens.ts";
import { Ast, AstType, BinaryOp, UnaryOp, RtValue, Op } from "./core.ts";

type TokenMatcher = { type?: TokenType; image?: string };

type Parser = {
	tokens: Token[];
	position: number;
	starts: number[];
};

export class ParseError extends Error {
	constructor(
		readonly note: string,
		readonly start: number,
		readonly end: number
	) {
		super(note);
	}
}

export const Parser = { parse };

function parse(moduleId: string, tokens: Token[]): Ast {
	const p: Parser = { tokens, position: 0, starts: [] };
	return parseModule(p, moduleId);
}

function parseModule(p: Parser, moduleId: string): Ast {
	pushStart(p);
	const decls: Ast[] = [];
	while (hasMore(p)) {
		decls.push(parseStmt(p));
		if (!hasMore(p) || matches(peek(p, -1), { image: "}" })) {
			match(p, { image: ";" });
		} else {
			consume(p, { image: ";" }, 'Expected ";" following declaration!');
		}
	}
	return {
		type: AstType.Module,
		id: moduleId,
		decls,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseStmt(p: Parser): Ast {
	if (matches(peek(p), { image: "var" })) {
		return parseVarStmt(p);
	}
	if (matches(peek(p), { image: "print" })) {
		return parsePrintStmt(p);
	}
	if (matches(peek(p), { image: "break" })) {
		return parseBreakStmt(p);
	}
	if (matches(peek(p), { image: "continue" })) {
		return parseContinueStmt(p);
	}
	return parseAssignStmt(p);
}

function parseVarStmt(p: Parser): Ast {
	pushStart(p);
	consume(p, { image: "var" });
	const identifier = consume(p, { type: TokenType.Id });
	consume(p, { image: "=" });
	const initializer = parseExpr(p);
	return {
		type: AstType.VarStmt,
		name: identifier.image,
		initializer,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parsePrintStmt(p: Parser): Ast {
	pushStart(p);
	consume(p, { image: "print" });
	const expr = parseExpr(p);
	return {
		type: AstType.PrintStmt,
		expr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseBreakStmt(p: Parser): Ast {
	pushStart(p);
	consume(p, { image: "break" });
	const label = match(p, { type: TokenType.Id });
	return {
		type: AstType.BreakStmt,
		label: label?.image,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseContinueStmt(p: Parser): Ast {
	pushStart(p);
	consume(p, { image: "continue" });
	const label = match(p, { type: TokenType.Id });
	return {
		type: AstType.ContinueStmt,
		label: label?.image,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseAssignStmt(p: Parser): Ast {
	const expr = parseExpr(p);
	if (match(p, { image: "=" })) {
		const value = parseExpr(p);
		if (expr.type === AstType.IdExpr) {
			return {
				type: AstType.AssignStmt,
				name: expr.value,
				value,
				start: expr.start,
				end: value.end,
			};
		} else {
			throw new ParseError("Invalid assignment target!", expr.start, expr.end);
		}
	}
	return {
		type: AstType.ExprStmt,
		expr,
		start: expr.start,
		end: expr.end,
	};
}

function parseExpr(p: Parser): Ast {
	return parseLogicalOr(p);
}

function parseLogicalOr(p: Parser): Ast {
	let left = parseLogicalAnd(p);
	while (match(p, { image: "|" })) {
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
	while (match(p, { image: "&" })) {
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

const EqualityOps: Record<string, BinaryOp> = {
	"==": BinaryOp.Eq,
	"!=": BinaryOp.NotEq,
	"===": BinaryOp.Id,
	"!==": BinaryOp.NotId,
};

function parseEquality(p: Parser): Ast {
	let left = parseComparison(p);
	let op = peek(p);
	while (matchOp(op, EqualityOps)) {
		consume(p);
		const right = parseComparison(p);
		left = {
			type: AstType.BinaryExpr,
			op: EqualityOps[op.image],
			left,
			right,
			start: left.start,
			end: right.end,
		};
		op = peek(p);
	}
	return left;
}

const ComparisonOps: Record<string, BinaryOp> = {
	">": BinaryOp.Gt,
	"<": BinaryOp.Lt,
	">=": BinaryOp.Gte,
	"<=": BinaryOp.Lte,
};

function parseComparison(p: Parser): Ast {
	let left = parseTerm(p);
	let op = peek(p);
	while (matchOp(op, ComparisonOps)) {
		consume(p);
		const right = parseTerm(p);
		left = {
			type: AstType.BinaryExpr,
			op: ComparisonOps[op.image],
			left,
			right,
			start: left.start,
			end: right.end,
		};
		op = peek(p);
	}
	return left;
}

const TermOps: Record<string, BinaryOp> = {
	"+": BinaryOp.Add,
	"-": BinaryOp.Sub,
};

function parseTerm(p: Parser): Ast {
	let left = parseFactor(p);
	let op = peek(p);
	while (matchOp(op, TermOps)) {
		consume(p);
		const right = parseFactor(p);
		left = {
			type: AstType.BinaryExpr,
			op: TermOps[op.image],
			left,
			right,
			start: left.start,
			end: right.end,
		};
		op = peek(p);
	}
	return left;
}

const FactorOps: Record<string, BinaryOp> = {
	"*": BinaryOp.Mul,
	"/": BinaryOp.Div,
	"%": BinaryOp.Rem,
	"?": BinaryOp.Default,
};

function parseFactor(p: Parser): Ast {
	let left = parseUnary(p);
	let op = peek(p);
	while (matchOp(op, FactorOps)) {
		consume(p);
		const right = parseUnary(p);
		left = {
			type: AstType.BinaryExpr,
			op: FactorOps[op.image],
			left,
			right,
			start: left.start,
			end: right.end,
		};
		op = peek(p);
	}
	return left;
}

const UnaryOps: Record<string, UnaryOp> = {
	"-": UnaryOp.Neg,
	"!": UnaryOp.Not,
	"...": UnaryOp.Spread,
};

function parseUnary(p: Parser): Ast {
	const op = peek(p);
	if (matchOp(op, UnaryOps)) {
		consume(p);
		const right = parsePrimary(p);
		return {
			type: AstType.UnaryExpr,
			op: UnaryOps[op.image],
			right,
			start: op?.start,
			end: right.end,
		};
	}
	return parsePrimary(p);
}

function parsePrimary(p: Parser): Ast {
	if (matches(peek(p), { image: "(" })) {
		return parseGroupExpr(p);
	}
	if (matches(peek(p), { image: "do" })) {
		return parseBlockExpr(p);
	}
	if (matches(peek(p), { image: "if" })) {
		return parseIfExpr(p);
	}
	if (matches(peek(p), { image: "loop" })) {
		return parseLoopExpr(p);
	}
	if (matches(peek(p), { image: "while" })) {
		return parseWhileExpr(p);
	}
	if (matches(peek(p), { type: TokenType.Lit })) {
		const lit = consume(p);
		return {
			type: AstType.LitExpr,
			value: lit.value as RtValue,
			start: lit.start,
			end: lit.end,
		};
	}
	const id = consume(p, { type: TokenType.Id }, "Expected expresssion!");
	return {
		type: AstType.IdExpr,
		value: id.image,
		start: id.start,
		end: id.end,
	};
}

function parseGroupExpr(p: Parser): Ast {
	pushStart(p);
	const expr = parseExpr(p);
	consume(p, { image: ")" });
	return {
		type: AstType.GroupExpr,
		expr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseBlockExpr(p: Parser): Ast {
	pushStart(p);
	let label: Token | undefined;
	if (match(p, { image: "do" })) {
		label = match(p, { type: TokenType.Id });
	}
	consume(p, { image: "{" });
	const stmts: Ast[] = [];
	while (hasMore(p) && !matches(peek(p), { image: "}" })) {
		stmts.push(parseStmt(p));
		if (
			matches(peek(p), { image: "}" }) ||
			matches(peek(p, -1), { image: "}" })
		) {
			match(p, { image: ";" });
		} else {
			consume(p, { image: ";" }, 'Expected ";" following statement!');
		}
	}
	consume(p, { image: "}" });
	return {
		type: AstType.BlockExpr,
		label: label?.image,
		stmts,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseIfExpr(p: Parser): Ast {
	pushStart(p);
	consume(p, { image: "if" });
	const testExpr = parseExpr(p);
	const thenExpr = parseBlockExpr(p);
	let elseExpr: Ast | undefined;
	if (match(p, { image: "else" })) {
		if (matches(peek(p), { image: "if" })) {
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

function parseLoopExpr(p: Parser): Ast {
	pushStart(p);
	consume(p, { image: "loop" });
	const label = match(p, { type: TokenType.Id });
	const blockExpr = parseBlockExpr(p);
	return {
		type: AstType.LoopExpr,
		label: label?.image,
		blockExpr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseWhileExpr(p: Parser): Ast {
	pushStart(p);
	consume(p, { image: "while" });
	const testExpr = parseExpr(p);
	const blockExpr = parseBlockExpr(p);
	return {
		type: AstType.WhileExpr,
		testExpr,
		blockExpr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function hasMore(p: Parser): boolean {
	return p.position < p.tokens.length;
}

function peek(p: Parser, position: number = 0): Token | undefined {
	return p.tokens[p.position + position];
}

function matches(t: Token | undefined, matcher: TokenMatcher): boolean {
	return (
		t !== undefined &&
		(matcher.type === undefined || matcher.type === t.type) &&
		(matcher.image === undefined || matcher.image === t.image)
	);
}

function match(p: Parser, matcher: TokenMatcher): Token | undefined {
	const token = peek(p);
	if (matches(token, matcher)) {
		p.position++;
		return token;
	}
	return undefined;
}

function consume(p: Parser, matcher: TokenMatcher = {}, note?: string): Token {
	const token = peek(p);
	if (matches(token, matcher)) {
		p.position++;
		return token as Token;
	}
	if (note === undefined) {
		if (matcher.type !== undefined) {
			note = `Expected ${matcher.type}!`;
		} else if (matcher.image !== undefined) {
			note = `Expected "${matcher.image}"!`;
		} else {
			note = "Unexpcted end of input!";
		}
	}
	const end = getEnd(p);
	throw new ParseError(note, token?.start ?? end, token?.end ?? end);
}

function matchOp(t: Token | undefined, ops: Record<string, Op>): t is Token {
	return ops[t?.image ?? ""] !== undefined;
}

function pushStart(p: Parser): void {
	p.starts.push(p.tokens[p.position].start);
}

function popStart(p: Parser): number {
	return p.starts.pop() ?? 0;
}

function getEnd(p: Parser): number {
	return p.tokens[p.position - 1]?.end ?? 0;
}
