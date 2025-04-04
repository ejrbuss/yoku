import { Token, Tokenizer, TokenType } from "./tokens.ts";
import {
	Ast,
	AstTag,
	ProcExpr,
	IfExpr,
	BlockExpr,
	AstContinueStmt,
	AstBreakStmt,
	AstVarDecl,
	AstModule,
	AstReturnStmt,
	AstAssertStmt,
	IdExpr,
	ProcExprParam,
	ProcTypeExpr,
	AstLoopStmt,
	TupleExpr,
	AstTestDecl,
	LitExpr,
	AstTypeDecl,
	MatchExpr,
	Case,
	TypeExpr,
	AstStructDecl,
	ThrowExpr,
	AstStructField,
	StructExprFieldInit,
	AstProcDecl,
	AstEnumDecl,
} from "./ast.ts";
import { CodeSource } from "./codesource.ts";
import { Unreachable } from "./utils.ts";
import { AssignOp, AssignToBinary, BinaryOp, UnaryOp } from "./ops.ts";

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

const IgnoredTokens = [TokenType.Comment, TokenType.Doc, TokenType.Whitespace];

function parse(source: CodeSource, replMode?: boolean) {
	const c = CodeSource.checkpoint(source);
	const tokens = Tokenizer.tokenize(source, IgnoredTokens);
	for (const t of tokens) {
		if (t.type === TokenType.Error) {
			throw new ParseError(t.note as string, false, t.start, t.end);
		}
	}
	const p: Parser = { tokens, position: 0, starts: [] };
	try {
		// TODO how should module ID relate to path?
		return parseModuleDecls(p, source.path, replMode ?? false);
	} catch (error) {
		if (error instanceof ParseError && error.needsMoreInput) {
			CodeSource.restore(source, c);
		}
		throw error;
	}
}

function parseModuleDecls(
	p: Parser,
	moduleId: string,
	replMode: boolean
): AstModule {
	pushStart(p);
	const decls: Ast[] = [];
	while (hasMore(p)) {
		decls.push(parseDecl(p, replMode));
	}
	return {
		tag: AstTag.Module,
		id: moduleId,
		replMode,
		decls,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseDecl(p: Parser, replMode: boolean): Ast {
	if (lookAhead(p, "var") || lookAhead(p, "const")) {
		return parseVarDecl(p);
	}
	if (lookAhead(p, "proc") && lookAhead(p, TokenType.Id, 1)) {
		return parseProcDecl(p);
	}
	if (lookAhead(p, "type") && lookAhead(p, TokenType.Id, 1)) {
		return praseTypeDecl(p);
	}
	if (lookAhead(p, "struct")) {
		return parseStructDecl(p);
	}
	if (lookAhead(p, "enum")) {
		return parseEnumDecl(p);
	}
	if (lookAhead(p, "test")) {
		return parseTestDecl(p);
	}
	if (replMode) {
		return parseStmt(p);
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

function parseVarDecl(p: Parser): AstVarDecl {
	pushStart(p);
	const mutable = match(p, "const") === undefined;
	if (mutable) {
		consume(p, "var");
	}
	const assert = match(p, "assert") !== undefined;
	const pattern = parsePattern(p);
	const declType = tryParseTypeAnnotation(p);
	consume(p, "=");
	const initExpr = parseExpr(p);
	return {
		tag: AstTag.VarDecl,
		mutable,
		assert,
		typeAnnotation: declType,
		pattern,
		initExpr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseProcDecl(p: Parser): AstProcDecl {
	pushStart(p);
	consume(p, "proc");
	const id = parseIdExpr(p);
	const initExpr = parseProcExpr(p);
	return {
		tag: AstTag.ProcDecl,
		id,
		initExpr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function praseTypeDecl(p: Parser): AstTypeDecl {
	pushStart(p);
	consume(p, "type");
	const id = parseIdExpr(p);
	consume(p, "=");
	const typeExpr = parseTypeExpr(p);
	return {
		tag: AstTag.TypeDecl,
		id,
		typeExpr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseStructDecl(p: Parser): AstStructDecl {
	pushStart(p);
	match(p, "struct");
	const id = parseIdExpr(p);
	const fields: AstStructField[] = [];
	if (match(p, "{")) {
		while (hasMore(p) && !lookAhead(p, "}")) {
			const mutable = match(p, "const") === undefined;
			if (mutable) {
				consume(p, "var");
			}
			const id = parseIdExpr(p);
			consume(p, ":");
			const typeAnnotation = parseTypeExpr(p);
			fields.push({ mutable, id, typeAnnotation });
		}
		consume(p, "}");
	} else {
		consume(p, "(");
		while (hasMore(p) && !lookAhead(p, ")")) {
			const typeAnnotation = parseTypeExpr(p);
			fields.push({ mutable: false, typeAnnotation });
			if (!lookAhead(p, ")")) {
				consume(p, ",");
			}
		}
		consume(p, ")");
	}
	return {
		tag: AstTag.StructDecl,
		id,
		fields,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseEnumDecl(p: Parser): AstEnumDecl {
	pushStart(p);
	consume(p, "enum");
	const id = parseIdExpr(p);
	const variants: AstStructDecl[] = [];
	consume(p, "{");
	while (hasMore(p) && !lookAhead(p, "}")) {
		if (!lookAhead(p, "{", 1) && !lookAhead(p, "(")) {
			const variantId = parseIdExpr(p);
			variants.push({
				tag: AstTag.StructDecl,
				id: variantId,
				fields: [],
				start: variantId.start,
				end: variantId.end,
			});
			if (!lookAhead(p, "}")) {
				consume(p, ",");
			}
		} else {
			variants.push(parseStructDecl(p));
		}
	}
	consume(p, "}");
	return {
		tag: AstTag.EnumDecl,
		id,
		variants,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseTestDecl(p: Parser): AstTestDecl {
	pushStart(p);
	consume(p, "test");
	const name = consume(p, TokenType.Lit);
	if (typeof name.value !== "string") {
		throw new ParseError("Expected test name!", false, name.start, name.end);
	}
	const thenExpr = parseBlockExpr(p);
	return {
		tag: AstTag.TestDecl,
		name: name.value,
		thenExpr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseBreakStmt(p: Parser): AstBreakStmt {
	pushStart(p);
	consume(p, "break");
	let label: undefined | IdExpr;
	if (lookAhead(p, TokenType.Id)) {
		label = parseIdExpr(p);
	}
	return {
		tag: AstTag.BreakStmt,
		label,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseReturnStmt(p: Parser): AstReturnStmt {
	pushStart(p);
	consume(p, "return");
	let expr: Ast | undefined;
	if (!lookAhead(p, "}")) {
		expr = parseExpr(p);
	}
	return {
		tag: AstTag.ReturnStmt,
		expr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseAssertStmt(p: Parser): AstAssertStmt {
	pushStart(p);
	consume(p, "assert");
	const testExpr = parseExpr(p);
	return {
		tag: AstTag.AssertStmt,
		testExpr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseContinueStmt(p: Parser): AstContinueStmt {
	pushStart(p);
	consume(p, "continue");
	let label: undefined | IdExpr;
	if (lookAhead(p, TokenType.Id)) {
		label = parseIdExpr(p);
	}
	return {
		tag: AstTag.ContinueStmt,
		label,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseAssignStmt(p: Parser): Ast {
	pushStart(p);
	const target = parseExpr(p);
	if (matchAny(p, Object.values(AssignOp))) {
		const assignOp = lookBehind(p)?.image as AssignOp;
		const binOp = AssignToBinary[assignOp];
		let expr = parseExpr(p);
		if (binOp !== undefined) {
			expr = {
				tag: AstTag.BinaryExpr,
				op: binOp,
				left: target,
				right: expr,
				start: target.start,
				end: expr.end,
			};
		}
		if (target.tag === AstTag.IdExpr) {
			return {
				tag: AstTag.AssignVarStmt,
				target,
				expr,
				start: popStart(p),
				end: getEnd(p),
			};
		} else if (
			target.tag === AstTag.BinaryExpr &&
			target.op === BinaryOp.Member &&
			target.right.tag === AstTag.IdExpr
		) {
			return {
				tag: AstTag.AssignFieldStmt,
				target: target.left,
				field: target.right,
				expr,
				start: popStart(p),
				end: getEnd(p),
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
		tag: AstTag.ExprStmt,
		expr: target,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseLoopStmt(p: Parser): AstLoopStmt {
	pushStart(p);
	consume(p, "loop");
	let label: undefined | IdExpr;
	if (lookAhead(p, TokenType.Id)) {
		label = parseIdExpr(p);
	}
	const thenExpr = parseBlockExpr(p);
	return {
		tag: AstTag.LoopStmt,
		label,
		thenExpr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseWhileStmt(p: Parser): AstLoopStmt {
	pushStart(p);
	consume(p, "while");
	const testExpr = parseSubExpr(p);
	const thenExpr = parseBlockExpr(p);
	return {
		tag: AstTag.LoopStmt,
		thenExpr: {
			tag: AstTag.IfExpr,
			mutable: false,
			testExpr,
			thenExpr,
			elseExpr: {
				tag: AstTag.BreakStmt,
				start: thenExpr.end,
				end: thenExpr.end,
			},
			start: testExpr.start,
			end: thenExpr.end,
		},
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseExpr(p: Parser): Ast {
	if (lookAhead(p, "do")) {
		return parseBlockExpr(p);
	}
	if (lookAhead(p, "if")) {
		return parseIfExpr(p);
	}
	if (lookAhead(p, "match")) {
		return parseMatchExpr(p);
	}
	if (lookAhead(p, "throw")) {
		return parseThrowExpr(p);
	}
	if (lookAhead(p, TokenType.Id) && lookAhead(p, "{", 1)) {
		return parseStructExpr(p);
	}
	return parseSubExpr(p);
}

function parseSubExpr(p: Parser): Ast {
	return parseLogicalOr(p);
}

function parseLogicalOr(p: Parser): Ast {
	let left = parseLogicalAnd(p);
	while (match(p, "|")) {
		const right = parseLogicalAnd(p);
		left = {
			tag: AstTag.BinaryExpr,
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
			tag: AstTag.BinaryExpr,
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
			tag: AstTag.BinaryExpr,
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
			tag: AstTag.BinaryExpr,
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
			tag: AstTag.BinaryExpr,
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
			tag: AstTag.BinaryExpr,
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
	if (match(p, BinaryOp.Pow)) {
		const op = lookBehind(p)?.image as BinaryOp;
		const right = parsePower(p);
		left = {
			tag: AstTag.BinaryExpr,
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
	pushStart(p);
	if (match(p, UnaryOp.Neg) || match(p, UnaryOp.Not)) {
		const op = lookBehind(p);
		const right = parseCallExpr(p);
		return {
			tag: AstTag.UnaryExpr,
			op: op?.image as UnaryOp,
			right,
			start: popStart(p),
			end: getEnd(p),
		};
	}
	popStart(p);
	return parseCallExpr(p);
}

function parseCallExpr(p: Parser): Ast {
	let expr = parsePrimaryExpr(p);
	for (;;) {
		if (match(p, "(")) {
			const args: Ast[] = [];
			while (hasMore(p) && !lookAhead(p, ")")) {
				args.push(parseExpr(p));
				if (!lookAhead(p, ")")) {
					consume(p, ",");
				}
			}
			if (args.length > 255) {
				const arg = args[256];
				throw new ParseError(
					"More than 255 arguments!",
					false,
					arg.start,
					arg.end
				);
			}
			consume(p, ")");
			expr = {
				tag: AstTag.CallExpr,
				proc: expr,
				args,
				start: expr.start,
				end: getEnd(p),
			};
		} else if (match(p, ".")) {
			let right: Ast;
			if (lookAhead(p, TokenType.Id)) {
				right = parseIdExpr(p);
			} else {
				right = parseLitExpr(p);
			}
			expr = {
				tag: AstTag.BinaryExpr,
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

function parsePrimaryExpr(p: Parser): Ast {
	if (lookAhead(p, "(")) {
		return parseTupleExpr(p);
	}
	if (lookAhead(p, "proc")) {
		return parseProcExpr(p);
	}
	if (lookAhead(p, "type")) {
		return parseTypeExpr(p);
	}
	if (lookAhead(p, TokenType.Lit)) {
		return parseLitExpr(p);
	}
	if (lookAhead(p, TokenType.Id)) {
		return parseIdExpr(p);
	}
	consume(p, TokenType.Id, "Expected expression!");
	throw new Unreachable();
}

function parseTupleExpr(p: Parser): Ast {
	pushStart(p);
	consume(p, "(");
	if (match(p, ")")) {
		return {
			tag: AstTag.TupleExpr,
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
				tag: AstTag.TupleExpr,
				items,
				start: popStart(p),
				end: getEnd(p),
			};
		} else {
			consume(p, ")");
			return {
				tag: AstTag.GroupExpr,
				expr,
				start: popStart(p),
				end: getEnd(p),
			};
		}
	}
}

function parseStructExpr(p: Parser): Ast {
	pushStart(p);
	const id = parseIdExpr(p);
	if (match(p, "{")) {
		const fieldInits: StructExprFieldInit[] = [];
		let spreadInit: undefined | Ast;
		while (hasMore(p) && !lookAhead(p, "}")) {
			if (match(p, "...")) {
				spreadInit = parseExpr(p);
				match(p, ",");
				break;
			}
			const id = parseIdExpr(p);
			let expr: undefined | Ast;
			if (match(p, "=")) {
				expr = parseExpr(p);
			}
			fieldInits.push({ id, expr });
			if (!lookAhead(p, "}")) {
				consume(p, ",");
			}
		}
		consume(p, "}");
		return {
			tag: AstTag.StructExpr,
			id,
			fieldInits,
			spreadInit,
			start: popStart(p),
			end: getEnd(p),
		};
	}
	popStart(p);
	return id;
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
		tag: AstTag.BlockExpr,
		stmts,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseIfExpr(p: Parser): IfExpr {
	pushStart(p);
	consume(p, "if");
	let pattern: undefined | Ast;
	let declType: undefined | Ast;
	let mutable: boolean = false;
	if (match(p, "const") || match(p, "var")) {
		mutable = lookBehind(p, "const") === undefined;
		pattern = parsePattern(p);
		declType = tryParseTypeAnnotation(p);
		consume(p, "=");
	}
	const testExpr = parseSubExpr(p);
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
		tag: AstTag.IfExpr,
		mutable,
		pattern,
		declType,
		testExpr,
		thenExpr,
		elseExpr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseMatchExpr(p: Parser): MatchExpr {
	pushStart(p);
	consume(p, "match");
	let testExpr: undefined | Ast;
	if (!lookAhead(p, "{")) {
		testExpr = parseSubExpr(p);
	}
	consume(p, "{");
	const cases: Case[] = [];
	while (hasMore(p) && !lookAhead(p, "}")) {
		if (match(p, "else")) {
			consume(p, "=>");
			const thenExpr = parseBlockExpr(p);
			cases.push({ thenExpr });
		} else if (testExpr === undefined) {
			consume(p, "if");
			const testExpr = parseSubExpr(p);
			consume(p, "=>");
			const thenExpr = parseBlockExpr(p);
			cases.push({ testExpr, thenExpr });
		} else {
			const pattern = parsePattern(p);
			const declType = tryParseTypeAnnotation(p);
			let testExpr: undefined | Ast;
			if (match(p, "if")) {
				testExpr = parseSubExpr(p);
			}
			consume(p, "=>");
			const thenExpr = parseBlockExpr(p);
			cases.push({ pattern, declType, testExpr, thenExpr });
		}
	}
	consume(p, "}");
	return {
		tag: AstTag.MatchExpr,
		testExpr,
		cases,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseThrowExpr(p: Parser): ThrowExpr {
	pushStart(p);
	consume(p, "throw");
	const expr = parseExpr(p);
	return {
		tag: AstTag.ThrowExpr,
		expr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseProcExpr(p: Parser): ProcExpr {
	pushStart(p);
	match(p, "proc");
	const params: ProcExprParam[] = [];
	if (match(p, "(")) {
		while (hasMore(p) && !lookAhead(p, ")")) {
			const pattern = parsePattern(p);
			const declType = tryParseTypeAnnotation(p);
			params.push({ pattern, declType });
			if (params.length > 255) {
				throw new ParseError(
					"More than 255 parameters!",
					false,
					pattern.start,
					pattern.end
				);
			}
			if (!lookAhead(p, ")")) {
				consume(p, ",");
			}
		}
		consume(p, ")");
	}
	let returnType: undefined | Ast;
	if (match(p, "->") && !lookAhead(p, "{")) {
		returnType = parseTypeExpr(p);
	}
	const implExpr = parseBlockExpr(p);
	return {
		tag: AstTag.ProcExpr,
		params,
		implExpr,
		returnType,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseLitExpr(p: Parser): LitExpr {
	const lit = consume(p);
	return {
		tag: AstTag.LitExpr,
		value: lit.value,
		start: lit.start,
		end: lit.end,
	};
}

function parseIdExpr(p: Parser): IdExpr {
	const id = consume(p, TokenType.Id);
	return {
		tag: AstTag.IdExpr,
		value: id.image,
		start: id.start,
		end: id.end,
	};
}

function tryParseTypeAnnotation(p: Parser): Ast | undefined {
	if (lookAhead(p, ":")) {
		return parseTypeAnnotation(p);
	}
	return undefined;
}

function parseTypeAnnotation(p: Parser): Ast {
	consume(p, ":");
	return parseTypeExpr(p);
}

function parseTypeExpr(p: Parser): TypeExpr {
	pushStart(p);
	match(p, "type");
	const expr = parsePrimaryTypeExpr(p);
	return {
		tag: AstTag.TypeExpr,
		expr,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parsePrimaryTypeExpr(p: Parser): Ast {
	if (lookAhead(p, "proc")) {
		return parseProcTypeExpr(p);
	}
	if (lookAhead(p, "(")) {
		return parseTupleTypeExpr(p);
	}
	if (lookAhead(p, "_")) {
		return parseWildcardExpr(p);
	}
	if (lookAhead(p, TokenType.Id)) {
		return parseIdExpr(p);
	}
	consume(p, TokenType.Id, "Expected type!");
	throw new Unreachable();
}

function parseProcTypeExpr(p: Parser): ProcTypeExpr {
	pushStart(p);
	consume(p, "proc");
	consume(p, "(");
	const params: Ast[] = [];
	while (hasMore(p) && !lookAhead(p, ")")) {
		params.push(parseTypeExpr(p));
		if (!lookAhead(p, ")")) {
			consume(p, ",");
		}
	}
	if (params.length > 255) {
		const param = params[256];
		throw new ParseError(
			"More than 255 parameters!",
			false,
			param.start,
			param.end
		);
	}
	consume(p, ")");
	consume(p, "->");
	const returnType = parseTypeExpr(p);
	return {
		tag: AstTag.ProcTypeExpr,
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
		tag: AstTag.TupleExpr,
		items,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parsePattern(p: Parser): Ast {
	return parseAsPattern(p);
}

function parseAsPattern(p: Parser): Ast {
	const left = parsePrimaryPattern(p);
	if (match(p, "as")) {
		const right = parseIdExpr(p);
		return {
			tag: AstTag.BinaryExpr,
			op: BinaryOp.As,
			left,
			right,
			start: left.start,
			end: right.end,
		};
	}
	return left;
}

function parsePrimaryPattern(p: Parser): Ast {
	if (lookAhead(p, "(")) {
		return parseTuplePattern(p);
	}
	if (lookAhead(p, "_")) {
		return parseWildcardExpr(p);
	}
	if (lookAhead(p, TokenType.Lit)) {
		return parseLitExpr(p);
	}
	if (lookAhead(p, TokenType.Id)) {
		return parseStructPattern(p);
	}
	consume(p, TokenType.Id, "Expected pattern!");
	throw new Unreachable();
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
		tag: AstTag.TupleExpr,
		items,
		start: popStart(p),
		end: getEnd(p),
	};
}

function parseStructPattern(p: Parser): Ast {
	pushStart(p);
	const id = parseIdExpr(p);
	if (match(p, "{")) {
		const fieldInits: StructExprFieldInit[] = [];
		while (hasMore(p) && !lookAhead(p, "}")) {
			const id = parseIdExpr(p);
			let expr: undefined | Ast;
			if (match(p, "=")) {
				expr = parsePattern(p);
			}
			fieldInits.push({ id, expr });
			if (!lookAhead(p, "}")) {
				consume(p, ",");
			}
		}
		consume(p, "}");
		return {
			tag: AstTag.StructExpr,
			id,
			fieldInits,
			start: popStart(p),
			end: getEnd(p),
		};
	}
	if (match(p, "(")) {
		const args: Ast[] = [];
		while (hasMore(p) && !lookAhead(p, ")")) {
			args.push(parsePattern(p));
			if (!lookAhead(p, ")")) {
				consume(p, ",");
			}
		}
		if (args.length > 255) {
			const arg = args[256];
			throw new ParseError(
				"More than 255 arguments!",
				false,
				arg.start,
				arg.end
			);
		}
		consume(p, ")");
		return {
			tag: AstTag.CallExpr,
			proc: id,
			args,
			start: popStart(p),
			end: getEnd(p),
		};
	}
	popStart(p);
	return id;
}

function parseWildcardExpr(p: Parser): Ast {
	pushStart(p);
	consume(p, "_");
	return {
		tag: AstTag.WildCardExpr,
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

function matchAny(p: Parser, ms: TokenMatcher[]): Token | undefined {
	for (const m of ms) {
		const t = match(p, m);
		if (t !== undefined) {
			return t;
		}
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
