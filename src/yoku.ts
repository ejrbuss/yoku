import { CodeSource } from "./codesource.ts";
import { print } from "./core.ts";
import { Runtime, RunResultType } from "./runtime.ts";

async function main(args: string[]) {
	if (args.length > 1) {
		console.log("Usage: yoku [script]");
		Deno.exit(64);
	} else if (args.length === 1) {
		const rt = Runtime.create();
		const s = await CodeSource.fromPath(args[0]);
		const result = Runtime.run(rt, s);
		if (result.type !== RunResultType.Ok) {
			Runtime.reportError(result);
			return Deno.exit(1);
		}
	} else {
		const rt = Runtime.create({ replMode: true, debug: true });
		runPrompt(rt);
	}
}

function runPrompt(rt: Runtime): void {
	const s = CodeSource.fromString("", "repl");
	let needsMoreInput = false;
	for (;;) {
		const line = prompt(needsMoreInput ? " " : ">");
		if (line !== null) {
			CodeSource.append(s, "\n" + line);
			const result = Runtime.run(rt, s);
			switch (result.type) {
				case RunResultType.Ok:
					console.log(`%c${print(result.result)}`, "color: blue");
					needsMoreInput = false;
					break;
				case RunResultType.Error:
					if (result.needsMoreInput) {
						console.log(result);
						needsMoreInput = true;
					} else {
						Runtime.reportError(result);
						needsMoreInput = false;
					}
					break;
			}
		}
	}
}

if (import.meta.main) {
	main(Deno.args);
}
