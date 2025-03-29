import { Span } from "./utils.ts";

export type CodeSource = {
	readonly path: string;
	content: string;
	start: number;
	end: number;
};

export type Checkpoint = Span;

export const CodeSource = {
	fromPath,
	fromString,
	append,
	reset,
	hasMore,
	startScan,
	getScan,
	getSpan,
	peek,
	consume,
	consumeAndPeek,
	match,
	checkpoint,
	restore,
};

async function fromPath(path: string): Promise<CodeSource> {
	return fromString(await Deno.readTextFile(path), path);
}

function fromString(content: string, path: string = "_"): CodeSource {
	return {
		path,
		content: content,
		start: 0,
		end: 0,
	};
}

function append(s: CodeSource, content: string): void {
	s.content += content;
}

function reset(s: CodeSource): void {
	s.start = 0;
	s.end = 0;
}

function hasMore(s: CodeSource): boolean {
	return s.end < s.content.length;
}

function startScan(s: CodeSource): void {
	s.start = s.end;
}

function getScan(s: CodeSource): string {
	return s.content.substring(s.start, s.end);
}

function getSpan(s: CodeSource): Span {
	return { start: s.start, end: s.end };
}

function peek(s: CodeSource): string | undefined {
	return s.content[s.end];
}

function consume(s: CodeSource): string | undefined {
	return s.content[s.end++];
}

function consumeAndPeek(s: CodeSource): string | undefined {
	return s.content[++s.end];
}

function match(s: CodeSource, toMatch: string): boolean {
	if (s.content.startsWith(toMatch, s.end)) {
		s.end += toMatch.length;
		return true;
	}
	return false;
}

function checkpoint(s: CodeSource): Checkpoint {
	return { start: s.start, end: s.end };
}

function restore(s: CodeSource, c: Checkpoint): void {
	s.start = c.start;
	s.end = c.end;
}
