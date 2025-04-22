import { CodeSource } from "../src/codesource.ts";
import { Span, structurallyEq } from "../src/utils.ts";
import { RunResult, RunResultType, Runtime } from "../src/runtime.ts";
import { assert, assertEquals, AssertionError } from "jsr:@std/assert";
import { print } from "../src/core.ts";
import { annotate, Fmt, highlight, tab } from "../src/reporter.ts";
import { blue, bold, gray, red } from "@std/fmt/colors";
import { dir } from "node:console";

const ModeDirective = /^--- mode (Repl|Module) ---/;
const TestDirective = /^--- (test|skip) "(.*)" ---/;
const ModuleDirective = /^--- module (\w+) ---/;

enum Mode {
	Repl = "Repl",
}

for await (const file of Deno.readDir("./test/examples")) {
	if (file.name.endsWith(".yo")) {
		const path = `./test/examples/${file.name}`;
		const suite = file.name.replace(".yo", "");
		const content = await Deno.readTextFile(path);
		if (!ModeDirective.test(content)) {
			const end = content.indexOf("\n");
			throw new Error(
				"\n" +
					annotate(content, {
						path,
						start: 0,
						end: end < 0 ? content.length : end,
						note: "Expected mode directive!",
						fmt: red,
					})
			);
		}
		const mode = (content.match(ModeDirective) as RegExpMatchArray)[1] as Mode;
		if (mode === Mode.Repl) {
			let start = content.indexOf("\n");
			while (start < content.length) {
				if (!content.startsWith("---", start)) {
					start++;
					continue;
				}
				const nextLine = content.indexOf("\n", start);
				let end = content.indexOf("\n---", nextLine);
				if (end < 0 || nextLine < 0) {
					end = content.length;
				}
				console.log({ start, nextLine, end });
				const directive = content.substring(start, nextLine);
				if (ModuleDirective.test(directive)) {
					start = end;
					continue;
				}
				if (TestDirective.test(directive)) {
					const match = directive.match(TestDirective);
					assert(match);
					const testOrSkip = match[1];
					const name = match[2];
					const span = { start, end };
					Deno.test(
						`${suite} - ${name}`,
						{ ignore: testOrSkip === "skip" },
						() => runReplTest(content, path, span)
					);
					start = end;
					continue;
				}
				throw new Error(
					"\n" +
						annotate(content, {
							path,
							start,
							end: nextLine,
							note: "Uknown directive!",
							fmt: red,
						})
				);
			}
		} else {
			Deno.test(suite, () => runModuleTest(content, path));
		}
	}
}

function runReplTest(content: string, path: string, span: Span): void {
	const rt = Runtime.create({ replMode: true });
	const s = CodeSource.fromString("", path);

	function source(): string {
		const lineNo = Span.lineOf(content, span) + 1;
		const colNo = Span.columnOf(content, span) + 1;
		const fileLink = `${path}:${lineNo}:${colNo}`;
		return `\n  ${bold("Source:")} ${gray(fileLink)}\n\n${tab(
			highlight(s.content).trim(),
			"    "
		)}`;
	}

	function expected(r: RunResult | string): string {
		return `\n  ${bold("Expected:")}\n${tab(result(r, blue), "    ")}`;
	}

	function found(r: RunResult | string): string {
		return `\n  ${bold("Found:")}\n${tab(result(r, red), "    ")}`;
	}

	function error(r: RunResult | string): string {
		return `\n  ${bold("Error:")}\n${tab(result(r, red), "    ")}`;
	}

	function result(r: RunResult | string, fmt: Fmt): string {
		if (typeof r === "string") {
			return fmt(r);
		}
		if (r.type === RunResultType.Error) {
			// Patch the error span to be the real file location
			if (r.source.path === path) {
				s.content = content.substring(0, span.start + s.content.length);
				if (r.start !== undefined) {
					r.start += span.start;
				}
				if (r.end !== undefined) {
					r.end += span.start;
				}
			}
			return Runtime.printError(r);
		}
		return fmt(print(r.result));
	}

	try {
		for (const line of content.substring(span.start, span.end).split("\n")) {
			CodeSource.append(s, `${line}\n`);
			const actualResult = Runtime.run(rt, s);
			if (line.includes("--> !")) {
				const expectedError = line.split("--> !")[1].trim();
				if (
					actualResult.type !== RunResultType.Error ||
					actualResult.name !== expectedError
				) {
					throw new AssertionError(
						`\n${source()}\n${expected(expectedError)}\n${found(actualResult)}`
					);
				}
			} else if (line.includes("-->")) {
				const expectedSource = line.split("-->")[1].trim();
				const expectedResult = Runtime.run(
					rt,
					CodeSource.fromString(expectedSource, "Expectation")
				);
				if (expectedResult.type === RunResultType.Error) {
					throw new AssertionError(`\n${source()}\n${error(expectedResult)}\n`);
				}
				if (!structurallyEq(actualResult, expectedResult)) {
					throw new AssertionError(
						`\n${source()}\n${expected(expectedResult)}\n${found(actualResult)}`
					);
				}
			} else {
				if (
					actualResult.type !== RunResultType.Ok &&
					!actualResult.needsMoreInput
				) {
					throw new AssertionError(`\n${source()}\n${error(actualResult)}\n`);
				}
			}
		}
	} catch (cause) {
		if (cause instanceof AssertionError) {
			throw cause;
		}
		if (cause instanceof Error) {
			throw new AssertionError(`\n${source()}\n${error(`${cause}`)}`, {
				cause,
			});
		}
		throw new AssertionError(
			`\n${source()}\n${error(`${JSON.stringify(cause)}`)}`,
			{
				cause,
			}
		);
	}
}

function runModuleTest(source: string, path: string): void {
	const rt = Runtime.create({ test: true });
	const s = CodeSource.fromString(source, path);
	const result = Runtime.run(rt, s);
	if (result.type === RunResultType.Error) {
		Runtime.reportError(result);
		assertEquals(result.type, RunResultType.Ok);
	}
}
