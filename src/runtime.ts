import { Interpreter, RuntimeError } from "./interpreter.ts";
import { ParseError, Parser } from "./parser.ts";
import { CodeSource } from "./codesource.ts";
import { TypeChecker, TypeError } from "./typechecker.ts";
import { Token, Tokenizer } from "./tokens.ts";
import { annotate } from "./reporter.ts";
import { red } from "@std/fmt/colors";
import { Ast } from "./ast.ts";

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
	typeChecker: TypeChecker;
	interpreter: Interpreter;
	debug?: boolean;
	replMode?: boolean;
	test?: boolean;
};

export const Runtime = { create: createRuntime, run, printError, reportError };

function createRuntime(options: Partial<Runtime> = {}): Runtime {
	const typeChecker = TypeChecker.create();
	const interpreter = Interpreter.create(options.test ?? false);
	return { typeChecker, interpreter, ...options };
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
		if (error instanceof ParseError || error instanceof TypeError) {
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

function printError(error: RunError): string {
	if (error.start === undefined || error.end === undefined) {
		return `${red(error.name)}: ${error.note}`;
	}
	const annotatedSource = annotate(error.source.content, {
		path: error.source.path,
		start: error.start,
		end: error.end,
		note: error.note,
		fmt: red,
	});
	return `${red(error.name)}:\n${annotatedSource}\n`;
}

function reportError(error: RunError): void {
	console.error(printError(error));
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
