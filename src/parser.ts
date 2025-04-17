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
	AstId,
	AstReturnStmt,
	AstAssertStmt,
	ProcExprParam,
	AstLoopStmt,
	TupleExpr,
	AstTestDecl,
	AstTypeDecl,
	MatchExpr,
	Case,
	AstStructDecl,
	ThrowExpr,
	AstStructField,
	AstStructFieldInit,
	AstProcDecl,
	AstEnumDecl,
	AstExpr,
	GroupExpr,
	AstPattern,
	AstTuplePattern,
	AstStructFieldPattern,
	AstStructPattern,
	AstLit,
	AstWildcard,
	AstWhileStmt,
	AstStmt,
	AstType,
	AstTypeExpr,
	AstTupleType,
	AstProcType,
	AstDecl,
	AstEnumPattern,
} from "./ast.ts";
import { CodeSource } from "./codesource.ts";
import { Unreachable } from "./utils.ts";
import { AssignOp, AssignToBinary, BinaryOp, UnaryOp } from "./ops.ts";
import { assertArrayIncludes } from "@std/assert/array-includes";

type TokenMatcher = TokenType | string;

type Parser = {
	tokens: Token[];
	position: number;
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

function parse(source: CodeSource, replMode?: boolean): AstModule {
	const c = CodeSource.checkpoint(source);
	const tokens = Tokenizer.tokenize(source, IgnoredTokens);
	for (const t of tokens) {
		if (t.type === TokenType.Error) {
			throw new ParseError(t.note as string, false, t.start, t.end);
		}
	}
	const p: Parser = { tokens, position: 0 };
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
	const start = getStart(p);
	const decls: (AstDecl | AstStmt)[] = [];
	while (hasMore(p)) {
		decls.push(parseDecl(p, replMode));
	}
	return {
		tag: AstTag.Module,
		id: moduleId,
		replMode,
		decls,
		start,
		end: getEnd(p),
	};
}

function parseDecl(p: Parser, replMode: boolean): AstDecl | AstStmt {
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

function parseStmt(p: Parser): AstStmt {
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
	const start = getStart(p);
	const mutable = match(p, "const") === undefined;
	if (mutable) {
		consume(p, "var");
	}
	const assert = match(p, "assert") !== undefined;
	const pattern = parsePattern(p);
	const typeAnnotation = match(p, ":") ? parseType(p) : undefined;
	consume(p, "=");
	const initExpr = parseExpr(p);
	return {
		tag: AstTag.VarDecl,
		mutable,
		assert,
		typeAnnotation,
		pattern,
		initExpr,
		start,
		end: getEnd(p),
	};
}

function parseProcDecl(p: Parser): AstProcDecl {
	const start = getStart(p);
	consume(p, "proc");
	const id = parseId(p);
	const initExpr = parseProcExpr(p);
	return {
		tag: AstTag.ProcDecl,
		id,
		initExpr,
		start,
		end: getEnd(p),
	};
}

function praseTypeDecl(p: Parser): AstTypeDecl {
	const start = getStart(p);
	consume(p, "type");
	const id = parseId(p);
	consume(p, "=");
	const typeExpr = parseType(p);
	return {
		tag: AstTag.TypeDecl,
		id,
		typeExpr,
		start,
		end: getEnd(p),
	};
}

function parseStructDecl(p: Parser): AstStructDecl {
	const start = getStart(p);
	match(p, "struct");
	const id = parseId(p);
	const fields: AstStructField[] = [];
	if (match(p, "{")) {
		while (hasMore(p) && !lookAhead(p, "}")) {
			const mutable = match(p, "const") === undefined;
			if (mutable) {
				consume(p, "var");
			}
			const id = parseId(p);
			consume(p, ":");
			const typeAnnotation = parseType(p);
			fields.push({ mutable, id, typeAnnotation });
		}
		consume(p, "}");
	} else {
		consume(p, "(");
		while (hasMore(p) && !lookAhead(p, ")")) {
			const typeAnnotation = parseType(p);
			fields.push({
				mutable: false,
				id: {
					tag: AstTag.Id,
					value: `${fields.length}`,
					start: typeAnnotation.start,
					end: typeAnnotation.end,
				},
				typeAnnotation,
			});
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
		start,
		end: getEnd(p),
	};
}

function parseEnumDecl(p: Parser): AstEnumDecl {
	const start = getStart(p);
	consume(p, "enum");
	const id = parseId(p);
	const variants: AstStructDecl[] = [];
	consume(p, "{");
	while (hasMore(p) && !lookAhead(p, "}")) {
		if (!lookAhead(p, "{", 1) && !lookAhead(p, "(", 1)) {
			const variantId = parseId(p);
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
			match(p, ",");
		}
	}
	consume(p, "}");
	return {
		tag: AstTag.EnumDecl,
		id,
		variants,
		start,
		end: getEnd(p),
	};
}

function parseTestDecl(p: Parser): AstTestDecl {
	const start = getStart(p);
	consume(p, "test");
	const name = parseLit(p);
	if (typeof name.value !== "string") {
		throw new ParseError("Expected test name!", false, name.start, name.end);
	}
	const thenExpr = parseBlockExpr(p);
	return {
		tag: AstTag.TestDecl,
		name,
		thenExpr,
		start: start,
		end: getEnd(p),
	};
}

function parseBreakStmt(p: Parser): AstBreakStmt {
	const start = getStart(p);
	consume(p, "break");
	const label = lookAhead(p, TokenType.Id) ? parseId(p) : undefined;
	return {
		tag: AstTag.BreakStmt,
		label,
		start: start,
		end: getEnd(p),
	};
}

function parseReturnStmt(p: Parser): AstReturnStmt {
	const start = getStart(p);
	consume(p, "return");
	const expr = !lookAhead(p, "}") ? parseExpr(p) : undefined;
	return {
		tag: AstTag.ReturnStmt,
		expr,
		start,
		end: getEnd(p),
	};
}

function parseAssertStmt(p: Parser): AstAssertStmt {
	const start = getStart(p);
	consume(p, "assert");
	const testExpr = parseExpr(p);
	return {
		tag: AstTag.AssertStmt,
		testExpr,
		start,
		end: getEnd(p),
	};
}

function parseContinueStmt(p: Parser): AstContinueStmt {
	const start = getStart(p);
	consume(p, "continue");
	const label = lookAhead(p, TokenType.Id) ? parseId(p) : undefined;
	return {
		tag: AstTag.ContinueStmt,
		label,
		start,
		end: getEnd(p),
	};
}

function parseAssignStmt(p: Parser): AstStmt {
	const start = getStart(p);
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
		if (target.tag === AstTag.Id) {
			return {
				tag: AstTag.AssignVarStmt,
				target,
				expr,
				start,
				end: getEnd(p),
			};
		} else if (
			target.tag === AstTag.BinaryExpr &&
			target.op === BinaryOp.Member &&
			target.right.tag === AstTag.Id
		) {
			return {
				tag: AstTag.AssignFieldStmt,
				target: target.left,
				field: target.right,
				expr,
				start,
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
		start,
		end: getEnd(p),
	};
}

function parseLoopStmt(p: Parser): AstLoopStmt {
	const start = getStart(p);
	consume(p, "loop");
	const label = lookAhead(p, TokenType.Id) ? parseId(p) : undefined;
	const thenExpr = parseBlockExpr(p);
	return {
		tag: AstTag.LoopStmt,
		label,
		thenExpr,
		start,
		end: getEnd(p),
	};
}

function parseWhileStmt(p: Parser): AstWhileStmt {
	const start = getStart(p);
	consume(p, "while");
	const testExpr = parseSubExpr(p);
	const thenExpr = parseBlockExpr(p);
	return {
		tag: AstTag.WhileStmt,
		testExpr,
		thenExpr,
		start,
		end: getEnd(p),
	};
}

function parseExpr(p: Parser): AstExpr {
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

function parseSubExpr(p: Parser): AstExpr {
	return parseLogicalOr(p);
}

function parseLogicalOr(p: Parser): AstExpr {
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

function parseLogicalAnd(p: Parser): AstExpr {
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

function parseEquality(p: Parser): AstExpr {
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

function parseComparison(p: Parser): AstExpr {
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

function parseTerm(p: Parser): AstExpr {
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

function parseFactor(p: Parser): AstExpr {
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

function parsePower(p: Parser): AstExpr {
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

function parseUnary(p: Parser): AstExpr {
	const start = getStart(p);
	if (match(p, UnaryOp.Neg) || match(p, UnaryOp.Not)) {
		const op = lookBehind(p);
		const right = parseCallExpr(p);
		return {
			tag: AstTag.UnaryExpr,
			op: op?.image as UnaryOp,
			right,
			start,
			end: getEnd(p),
		};
	}
	return parseCallExpr(p);
}

function parseCallExpr(p: Parser): AstExpr {
	let expr = parsePrimaryExpr(p);
	for (;;) {
		if (match(p, "(")) {
			const args: AstExpr[] = [];
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
				right = parseId(p);
			} else {
				right = parseLit(p);
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

function parsePrimaryExpr(p: Parser): AstExpr {
	if (lookAhead(p, "(")) {
		return parseTupleOrGroupExpr(p);
	}
	if (lookAhead(p, "proc")) {
		return parseProcExpr(p);
	}
	if (lookAhead(p, "type")) {
		return parseTypeExpr(p);
	}
	if (lookAhead(p, TokenType.Lit)) {
		return parseLit(p);
	}
	if (lookAhead(p, TokenType.Id)) {
		return parseId(p);
	}
	consume(p, TokenType.Id, "Expected expression!");
	throw new Unreachable();
}

function parseTupleOrGroupExpr(p: Parser): TupleExpr | GroupExpr {
	const start = getStart(p);
	consume(p, "(");
	if (match(p, ")")) {
		return {
			tag: AstTag.TupleExpr,
			items: [],
			start,
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
				start,
				end: getEnd(p),
			};
		} else {
			consume(p, ")");
			return {
				tag: AstTag.GroupExpr,
				expr,
				start,
				end: getEnd(p),
			};
		}
	}
}

function parseStructExpr(p: Parser): AstExpr {
	const start = getStart(p);
	const id = parseId(p);
	if (match(p, "{")) {
		const fieldInits: AstStructFieldInit[] = [];
		let spreadInit: undefined | AstExpr;
		while (hasMore(p) && !lookAhead(p, "}")) {
			if (match(p, "...")) {
				spreadInit = parseExpr(p);
				match(p, ",");
				break;
			}
			const id = parseId(p);
			const expr = match(p, "=") ? parseExpr(p) : undefined;
			fieldInits.push({ id, expr });
			if (!lookAhead(p, "}")) {
				consume(p, ",");
			}
		}
		consume(p, "}");
		return {
			tag: AstTag.StructExpr,
			id: id,
			fieldInits,
			spreadInit,
			start,
			end: getEnd(p),
		};
	}
	return id;
}

function parseBlockExpr(p: Parser): BlockExpr {
	const start = getStart(p);
	match(p, "do");
	consume(p, "{");
	const stmts: AstStmt[] = [];
	while (hasMore(p) && !lookAhead(p, "}")) {
		stmts.push(parseStmt(p));
		match(p, ";");
	}
	consume(p, "}");
	return {
		tag: AstTag.BlockExpr,
		stmts,
		start,
		end: getEnd(p),
	};
}

function parseIfExpr(p: Parser): IfExpr {
	const start = getStart(p);
	consume(p, "if");
	let pattern: undefined | AstPattern;
	let assertedType: undefined | AstType;
	let mutable: boolean = false;
	if (match(p, "const") || match(p, "var")) {
		mutable = lookBehind(p, "const") === undefined;
		pattern = parsePattern(p);
		assertedType = match(p, ":") ? parseType(p) : undefined;
		consume(p, "=");
	}
	const testExpr = parseSubExpr(p);
	const thenExpr = parseBlockExpr(p);
	let elseExpr: AstExpr | undefined;
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
		assertedType,
		testExpr,
		thenExpr,
		elseExpr,
		start,
		end: getEnd(p),
	};
}

function parseMatchExpr(p: Parser): MatchExpr {
	const start = getStart(p);
	consume(p, "match");
	const testExpr = !lookAhead(p, "{") ? parseSubExpr(p) : undefined;
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
			const assertedType = match(p, ":") ? parseType(p) : undefined;
			const testExpr = match(p, "if") ? parseSubExpr(p) : undefined;
			consume(p, "=>");
			const thenExpr = parseBlockExpr(p);
			cases.push({ pattern, assertedType, testExpr, thenExpr });
		}
	}
	consume(p, "}");
	return {
		tag: AstTag.MatchExpr,
		testExpr,
		cases,
		start,
		end: getEnd(p),
	};
}

function parseThrowExpr(p: Parser): ThrowExpr {
	const start = getStart(p);
	consume(p, "throw");
	const expr = parseExpr(p);
	return {
		tag: AstTag.ThrowExpr,
		expr,
		start,
		end: getEnd(p),
	};
}

function parseTypeExpr(p: Parser): AstTypeExpr {
	const start = getStart(p);
	match(p, "type");
	const type = parseType(p);
	return {
		tag: AstTag.TypeExpr,
		type,
		start,
		end: getEnd(p),
	};
}

function parseProcExpr(p: Parser): ProcExpr {
	const start = getStart(p);
	match(p, "proc");
	const params: ProcExprParam[] = [];
	if (match(p, "(")) {
		while (hasMore(p) && !lookAhead(p, ")")) {
			const pattern = parsePattern(p);
			const typeAnnotation = match(p, ":") ? parseType(p) : undefined;
			params.push({ pattern, typeAnnotation });
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
	const returnType =
		match(p, "->") && !lookAhead(p, "{") ? parseType(p) : undefined;
	const implExpr = parseBlockExpr(p);
	return {
		tag: AstTag.ProcExpr,
		params,
		implExpr,
		returnType,
		start,
		end: getEnd(p),
	};
}

function parseType(p: Parser): AstType {
	if (lookAhead(p, "proc")) {
		return parseProcType(p);
	}
	if (lookAhead(p, "(")) {
		return parseTupleType(p);
	}
	if (lookAhead(p, "_")) {
		return parseWildcard(p);
	}
	return parseId(p, "Expected type!");
}

function parseProcType(p: Parser): AstProcType {
	const start = getStart(p);
	consume(p, "proc");
	consume(p, "(");
	const params: AstType[] = [];
	while (hasMore(p) && !lookAhead(p, ")")) {
		params.push(parseType(p));
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
	const returnType = parseType(p);
	return {
		tag: AstTag.ProcType,
		params,
		returnType,
		start,
		end: getEnd(p),
	};
}

function parseTupleType(p: Parser): AstTupleType {
	const start = getStart(p);
	consume(p, "(");
	const items: AstType[] = [];
	while (hasMore(p) && !lookAhead(p, ")")) {
		items.push(parseType(p));
		if (!lookAhead(p, ")")) {
			consume(p, ",");
		}
	}
	consume(p, ")");
	return {
		tag: AstTag.TupleType,
		items,
		start,
		end: getEnd(p),
	};
}

function parsePattern(p: Parser): AstPattern {
	return parseAsPattern(p);
}

function parseAsPattern(p: Parser): AstPattern {
	let left = parsePrimaryPattern(p);
	while (match(p, BinaryOp.As)) {
		const right = parsePrimaryPattern(p);
		left = {
			tag: AstTag.AsPattern,
			left,
			right,
			start: left.start,
			end: right.end,
		};
	}
	return left;
}

function parsePrimaryPattern(p: Parser): AstPattern {
	if (lookAhead(p, "(")) {
		return parseTuplePattern(p);
	}
	if (
		lookAhead(p, TokenType.Id) &&
		(lookAhead(p, "(", 1) || lookAhead(p, "{", 1))
	) {
		return parseStructPattern(p);
	}
	if (lookAhead(p, TokenType.Id) && lookAhead(p, ".", 1)) {
		return parseEnumPattern(p);
	}
	if (lookAhead(p, "_")) {
		return parseWildcard(p);
	}
	if (lookAhead(p, TokenType.Lit)) {
		return parseLit(p);
	}
	return parseId(p, "Expected pattern!");
}

function parseTuplePattern(p: Parser): AstTuplePattern {
	const start = getStart(p);
	consume(p, "(");
	const items: AstPattern[] = [];
	while (hasMore(p) && !lookAhead(p, ")")) {
		items.push(parsePattern(p));
		if (!lookAhead(p, ")")) {
			consume(p, ",");
		}
	}
	consume(p, ")");
	return {
		tag: AstTag.TuplePattern,
		items,
		start,
		end: getEnd(p),
	};
}

function parseStructPattern(p: Parser): AstStructPattern {
	const start = getStart(p);
	const id = parseId(p);
	const fieldPatterns: AstStructFieldPattern[] = [];
	if (match(p, "{")) {
		while (hasMore(p) && !lookAhead(p, "}")) {
			const id = parseId(p);
			const pattern = match(p, "=") ? parsePattern(p) : id;
			fieldPatterns.push({ id, pattern });
			if (!lookAhead(p, "}")) {
				consume(p, ",");
			}
		}
		consume(p, "}");
	}
	if (match(p, "(")) {
		let i = 0;
		while (hasMore(p) && !lookAhead(p, ")")) {
			const pattern = parsePattern(p);
			const id: AstId = {
				tag: AstTag.Id,
				value: `${i++}`,
				start: pattern.start,
				end: pattern.end,
			};
			fieldPatterns.push({ id, pattern });
			if (!lookAhead(p, ")")) {
				consume(p, ",");
			}
		}
		consume(p, ")");
	}
	return {
		tag: AstTag.StructPattern,
		id,
		fieldPatterns,
		start,
		end: getEnd(p),
	};
}

function parseEnumPattern(p: Parser): AstEnumPattern {
	const start = getStart(p);
	const id = parseId(p);
	consume(p, ".");
	const variant = parseStructPattern(p);
	return {
		tag: AstTag.EnumPattern,
		id,
		variant,
		start,
		end: getEnd(p),
	};
}

function parseWildcard(p: Parser): AstWildcard {
	const wildcard = consume(p, "_");
	return {
		tag: AstTag.Wildcard,
		start: wildcard.start,
		end: wildcard.end,
	};
}

function parseLit(p: Parser): AstLit {
	const lit = consume(p, TokenType.Lit);
	return {
		tag: AstTag.Lit,
		value: lit.value,
		start: lit.start,
		end: lit.end,
	};
}

function parseId(p: Parser, note?: string): AstId {
	const id = consume(p, TokenType.Id, note);
	return {
		tag: AstTag.Id,
		value: id.image,
		start: id.start,
		end: id.end,
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

function getStart(p: Parser): number {
	return lookAhead(p)?.start ?? 0;
}

function getEnd(p: Parser): number {
	return lookBehind(p)?.end ?? 0;
}
