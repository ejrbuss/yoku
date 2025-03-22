import { Token, Tokenizer, TokenType } from "./tokens.ts";
import { ParseError, Parser } from "./parser.ts";
import { Interpreter } from "./interpreter.ts";
import { Ast, print } from "./core.ts";
import { ResolutionError, Resolver } from "./resolver.ts";
import { Span } from "./utils.ts";
import { TypeChecker, TypeError } from "./typechecker.ts";

class YokuError extends Error {}

async function main(args: string[]) {
	if (args.length > 1) {
		console.log("Usage: yoku [script]");
		Deno.exit(64);
	} else if (args.length === 1) {
		await runFile(Runtime.create(), args[0]);
	} else {
		runPrompt(Runtime.create());
	}
}

export type Runtime = {
	resolver: Resolver;
	typeChecker: TypeChecker;
	interpreter: Interpreter;
	debugTokens?: boolean;
	debugAst?: boolean;
};

export const Runtime = { create: createRuntime, run, runFile };

function createRuntime(): Runtime {
	const resolver = Resolver.create();
	const typeChecker = TypeChecker.create();
	const interpreter = Interpreter.create(resolver, typeChecker);
	return { resolver, typeChecker, interpreter };
}

async function runFile(rt: Runtime, path: string): Promise<void> {
	run(rt, path, await Deno.readTextFile(path));
}

function runPrompt(rt: Runtime): void {
	for (;;) {
		try {
			const line = prompt(">");
			if (line !== null) {
				console.log(print(run(rt, "repl", line)));
			}
		} catch (error) {
			if (!(error instanceof YokuError)) {
				console.error(error);
			}
		}
	}
}

function run(rt: Runtime, moduleId: string, source: string): unknown {
	// TODO: reportError does not currently understand \t
	source = source.replaceAll("\t", "    ");
	const tokens = Tokenizer.tokenize(source);
	if (rt.debugTokens) {
		printTokens(tokens);
	}

	let error = false;
	for (const token of tokens) {
		if (token.type === TokenType.Error) {
			error = true;
			reportError(moduleId, source, token, token.note);
		}
	}
	if (error) {
		throw new YokuError();
	}
	try {
		const ast = Parser.parse(moduleId, tokens);
		if (rt.debugAst) {
			printAst(ast);
		}
		Resolver.resolve(rt.resolver, ast);
		TypeChecker.check(rt.typeChecker, ast);
		return Interpreter.interperate(rt.interpreter, ast);
	} catch (error) {
		if (error instanceof ParseError) {
			reportError(moduleId, source, error, error.note);
			throw new YokuError();
		}
		if (error instanceof ResolutionError) {
			reportError(moduleId, source, error, error.note);
			throw new YokuError();
		}
		if (error instanceof TypeError) {
			reportError(moduleId, source, error, error.note);
			throw new YokuError();
		}
		throw error;
	}
}

function reportError(
	moduleId: string,
	source: string,
	span: Span,
	note?: string
): void {
	const line = Span.lineOf(source, span) + 1;
	const column = Span.columnOf(source, span) + 1;
	const headline = `--> ${moduleId}:${line}:${column}`;
	const highlight = Span.highlight(source, span, note);
	console.error(`${headline}\n${highlight}\n`);
}

function printTokens(tokens: Token[]): void {
	console.log("--- Tokens ---");
	for (const token of tokens) {
		console.log(Token.print(token));
	}
	console.log();
}

function printAst(ast: Ast): void {
	console.log(`\n--- AST ---`);
	console.log(Ast.print(ast));
	console.log();
}

if (import.meta.main) {
	main(Deno.args);
}
