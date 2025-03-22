import { Runtime } from "./yoku.ts";
import { assertEquals } from "jsr:@std/assert";

const ModeDirective = /--- mode (\w+) ---/;
const TestDirective = /--- test "(.*)" ---/;

enum Mode {
	Repl = "Repl",
}

for await (const file of Deno.readDir("./test")) {
	if (file.name.endsWith(".yo")) {
		const suiteName = file.name.substring(0, file.name.length - 3);
		const source = await Deno.readTextFile(`./test/${file.name}`);
		const stack = linesStackOf(source);
		let mode = Mode.Repl;
		for (;;) {
			const line = stack.pop();
			if (line === undefined) {
				break;
			}
			if (ModeDirective.test(line)) {
				const match = line.match(ModeDirective);
				if (match === null || !(match[1] in Mode)) {
					throw new Error(`${suiteName}:${line}: Invalid mode directive!`);
				}
				mode = match[1] as Mode;
				continue;
			}
			if (TestDirective.test(line)) {
				const match = line.match(TestDirective);
				if (match === null) {
					throw new Error(`${suiteName}:${line}: Invalid test directive!`);
				}
				const testLines = popTestLines(stack);
				const testName = match[1];
				Deno.test(`${suiteName}: ${testName}`, () => {
					if (mode === Mode.Repl) {
						const rt = Runtime.create();
						for (const line of testLines) {
							const [actualSource, expectedSource] = line.split("-->");
							const actual = Runtime.run(rt, suiteName, actualSource);
							if (expectedSource !== undefined) {
								const expected = Runtime.run(rt, suiteName, expectedSource);
								assertEquals(actual, expected, line);
							}
						}
					}
				});
				continue;
			}
			throw new Error(`Cannot interperate test line!\n${line}`);
		}
	}
}

function linesStackOf(text: string, discardEmpty: boolean = true): string[] {
	const lines = text.split("\n");
	const stack: string[] = [];
	for (const line of lines.reverse()) {
		if (!discardEmpty || line.trim().length > 0) {
			stack.push(line);
		}
	}
	return stack;
}

function popTestLines(stack: string[]): string[] {
	const lines: string[] = [];
	let top = stack.pop();
	while (top !== undefined) {
		if (top.startsWith("--- test")) {
			stack.push(top);
			break;
		}
		lines.push(top);
		top = stack.pop();
	}
	return lines;
}
