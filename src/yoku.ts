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
		await runFile(args[0]);
	} else {
		runPrompt();
	}
}

async function runFile(path: string) {
	const resolver = Resolver.create();
	const typeChecker = TypeChecker.create();
	const interpreter = Interpreter.create(resolver, typeChecker);
	run(resolver, typeChecker, interpreter, path, await Deno.readTextFile(path));
}

function runPrompt() {
	const resolver = Resolver.create();
	const typeChecker = TypeChecker.create();
	const interpreter = Interpreter.create(resolver, typeChecker);
	for (;;) {
		try {
			const line = prompt(">");
			if (line !== null) {
				console.log(
					print(run(resolver, typeChecker, interpreter, "repl", line))
				);
			}
		} catch (error) {
			if (!(error instanceof YokuError)) {
				console.error(error);
			}
		}
	}
}

function run(
	resolver: Resolver,
	typeChecker: TypeChecker,
	interpreter: Interpreter,
	moduleId: string,
	source: string
): unknown {
	// TODO: reportError does not currently understand \t
	source = source.replaceAll("\t", "    ");
	const tokens = Tokenizer.tokenize(source);
	console.log();
	console.log(`--- Tokens ---`);
	for (const token of tokens) {
		console.log(Token.print(token));
	}
	console.log();

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
		console.log(`\n--- AST ---`);
		console.log(Ast.print(ast));
		console.log();
		Resolver.resolve(resolver, ast);
		TypeChecker.check(typeChecker, ast);
		return Interpreter.interperate(interpreter, ast);
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

main(Deno.args);
