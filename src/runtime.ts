import { Interpreter, RuntimeError } from "./interpreter.ts";
import { ParseError, Parser } from "./parser.ts";
import { ResolutionError, Resolver } from "./resolver.ts";
import { CodeSource } from "./codesource.ts";
import { TypeChecker, TypeError } from "./typechecker.ts";
import { Span } from "./utils.ts";
import { Ast } from "./core.ts";
import { Token, Tokenizer } from "./tokens.ts";

export enum RunResultType {
	Ok = "Ok",
	Error = "Error",
}

export type RunOk = {
	type: RunResultType.Ok;
	result: unknown;
};

export type RunError = {
	type: RunResultType.Error;
	source: CodeSource;
	name: string;
	note: string;
	start?: number;
	end?: number;
	needsMoreInput?: boolean;
};

export type RunResult = RunOk | RunError;

export type Runtime = {
	resolver: Resolver;
	typeChecker: TypeChecker;
	interpreter: Interpreter;
	debug?: boolean;
	replMode?: boolean;
	test?: boolean;
};

export const Runtime = { create: createRuntime, run, reportError };

function createRuntime(options: Partial<Runtime> = {}): Runtime {
	const resolver = Resolver.create();
	const typeChecker = TypeChecker.create();
	const interpreter = Interpreter.create(
		resolver,
		typeChecker,
		options.test ?? false
	);
	return { resolver, typeChecker, interpreter, ...options };
}

function run(rt: Runtime, s: CodeSource): RunResult {
	try {
		if (rt.debug) {
			const c = CodeSource.checkpoint(s);
			printTokens(Tokenizer.tokenize(s));
			CodeSource.restore(s, c);
		}
		const ast = Parser.parse(s, rt.replMode);
		if (rt.debug) {
			printAst(ast);
		}
		rt.resolver.allowShadowGlobals = rt.replMode ?? false;
		Resolver.resolve(rt.resolver, ast);
		TypeChecker.check(rt.typeChecker, ast);
		const result = Interpreter.interperate(rt.interpreter, ast);
		return {
			type: RunResultType.Ok,
			result,
		};
	} catch (error) {
		if (rt.debug && error instanceof Error) {
			console.error(`Debug: Error\n%c${error.stack}`, "color: green");
		}
		if (
			error instanceof ParseError ||
			error instanceof ResolutionError ||
			error instanceof TypeError
		) {
			const runError: RunError = {
				type: RunResultType.Error,
				source: s,
				name: error.constructor.name,
				note: error.note,
				start: error.start,
				end: error.end,
				needsMoreInput: error instanceof ParseError && error.needsMoreInput,
			};
			return runError;
		}
		if (error instanceof RuntimeError) {
			return {
				type: RunResultType.Error,
				source: s,
				name: error.constructor.name,
				note: error.note,
				start: error.start,
				end: error.end,
			};
		}
		throw error;
	}
}

function reportError(error: RunError): void {
	if (error.start === undefined || error.end === undefined) {
		console.error(`\n%c${error.name}: ${error.note}\n`, "color: red");
		return;
	}
	const span = { start: error.start, end: error.end };
	const line = Span.lineOf(error.source.content, span) + 1;
	const column = Span.columnOf(error.source.content, span) + 1;
	const headline = `--> ${error.source.path}:${line}:${column} ${error.name}`;
	const highlight = Span.highlight(error.source.content, span, error.note);
	console.error(`\n%c${headline}\n${highlight}\n`, "color: red");
}

function printTokens(tokens: Token[]): void {
	console.log(
		`%cDebug: Tokens\n${tokens.map(Token.print).join("\n")}\n`,
		"color: green"
	);
}

function printAst(ast: Ast): void {
	console.log(`%cDebug: AST\n${Ast.print(ast)}\n`, "color: green");
}
