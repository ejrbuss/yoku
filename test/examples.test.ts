import { CodeSource } from "../src/codesource.ts";
import { Span, structurallyEq } from "../src/utils.ts";
import { RunResult, RunResultType, Runtime } from "../src/runtime.ts";
import { assertEquals, AssertionError } from "jsr:@std/assert";
import { print } from "../src/core.ts";
import { annotate, Fmt, highlight, tab } from "../src/reporter.ts";
import { blue, bold, gray, red } from "@std/fmt/colors";

const ModeDirective = /^--- mode (Repl|Module) ---/;
const TestDirective = /^--- test "(.*)" ---/;

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
			for (let i = content.indexOf("\n"); i < content.length; i++) {
				if (content.startsWith("--", i)) {
					const start = i;
					let end = start + "--".length;
					const subContent = content.substring(start);
					if (!TestDirective.test(subContent)) {
						const end = subContent.indexOf("\n", start);
						throw new Error(
							"\n" +
								annotate(content, {
									path,
									start,
									end: start + (end < 0 ? subContent.length : end),
									note: "Expected test directive!",
									fmt: red,
								})
						);
					}
					const name = (subContent.match(TestDirective) as RegExpMatchArray)[1];
					while (end < content.length && !content.startsWith("\n--", end)) {
						end++;
					}
					Deno.test(`${suite} - ${name}`, {}, () =>
						runReplTest2(content, path, { start, end })
					);
					i = end;
				}
			}
		} else {
			Deno.test(suite, () => runModuleTest(content, path));
		}
	}
}

function runReplTest2(content: string, path: string, span: Span): void {
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
			s.content = content.substring(0, span.start + s.content.length);
			if (r.start !== undefined) {
				r.start += span.start;
			}
			if (r.end !== undefined) {
				r.end += span.start;
			}
			return Runtime.printError(r);
		}
		return fmt(print(r.result));
	}

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
