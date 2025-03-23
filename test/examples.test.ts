import { CodeSource } from "../src/codesource.ts";
import { Span, structurallyEq, Todo, Unreachable } from "../src/utils.ts";
import { RunOk, RunResultType, Runtime } from "../src/runtime.ts";
import { assertEquals, assertNotEquals, fail } from "jsr:@std/assert";
import { print, Type } from "../src/core.ts";

const ModeDirective = /^--- mode (Repl|Module) ---/;
const TestDirective = /^--- test "(.*)" ---/;

enum Mode {
	Repl = "Repl",
}

for await (const file of Deno.readDir("./test/examples")) {
	if (file.name.endsWith(".yo")) {
		const path = `./test/examples/${file.name}`;
		const content = await Deno.readTextFile(path);
		if (!ModeDirective.test(content)) {
			const end = content.indexOf("\n");
			throw new Error(
				`In '${path}':\n${Span.highlight(
					content,
					{ start: 0, end: end < 0 ? content.length : end },
					"Expected mode directive!"
				)}`
			);
		}
		const mode = (content.match(ModeDirective) as RegExpMatchArray)[1] as Mode;
		for (let i = content.indexOf("\n"); i < content.length; i++) {
			if (content.startsWith("--", i)) {
				const start = i;
				let end = start + "--".length;
				const subContent = content.substring(start);
				if (!TestDirective.test(subContent)) {
					const end = content.indexOf("\n", start);
					throw new Error(
						`In '${path}':\n${Span.highlight(
							content,
							{ start: 0, end: end < 0 ? content.length : end },
							"Expected test directive!"
						)}`
					);
				}
				const name = (subContent.match(TestDirective) as RegExpMatchArray)[1];
				while (end < content.length && !content.startsWith("\n--", end)) {
					end++;
				}
				Deno.test(name, () =>
					runExampleTest(mode, content.substring(start, end))
				);
				i = end;
			}
		}
	}
}

function runExampleTest(m: Mode, source: string) {
	if (m === Mode.Repl) {
		const art = Runtime.create({ replMode: true });
		const ert = Runtime.create({ replMode: true });
		const s = CodeSource.fromString("", "actual");
		for (const line of source.split("\n")) {
			CodeSource.append(s, line + "\n");
			const actualResult = Runtime.run(art, s);
			if (line.includes("--> !")) {
				const [_, expectedSource] = line.split("--> !");
				if (actualResult.type !== RunResultType.Error) {
					console.error(`%cLine: ${line}\n`, "color: red");
					assertEquals(actualResult.type, RunResultType.Error);
					throw new Unreachable();
				}
				if (actualResult.name !== expectedSource.trim()) {
					console.error(`%cLine: ${line}\n`, "color: red");
					assertEquals(actualResult.name, expectedSource.trim());
				}
				continue;
			}
			if (line.includes("-->")) {
				const [_, expectedSource] = line.split("-->");
				const expectedResult = Runtime.run(
					ert,
					CodeSource.fromString(expectedSource, "expected")
				);
				if (actualResult.type !== RunResultType.Ok) {
					Runtime.reportError(actualResult);
					assertEquals(actualResult.type, RunResultType.Ok);
					throw new Unreachable();
				}
				if (!structurallyEq(actualResult, expectedResult)) {
					const ap = print(actualResult.result);
					const ep = print((expectedResult as RunOk).result);
					console.error(
						`%cLine: ${line}\nActual: ${ap}\nExpected: ${ep}`,
						"color: red"
					);
					assertEquals(actualResult, expectedResult);
				}
				continue;
			}
			if (
				actualResult.type === RunResultType.Error &&
				!actualResult.needsMoreInput
			) {
				console.error(`%cLine: ${line}\n`, "color: red");
				Runtime.reportError(actualResult);
				assertNotEquals(actualResult.type, RunResultType.Error);
			}
		}
	} else {
		throw new Todo();
	}
}
