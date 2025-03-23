import { Span } from "./utils.ts";

export type CodeSource = {
	readonly path: string;
	content: string;
	_start: number;
	_end: number;
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
	// Simplifies column calculations
	content = content.replaceAll("\t", "    ");
	return {
		path,
		content: content,
		_start: 0,
		_end: 0,
	};
}

function append(s: CodeSource, content: string): void {
	s.content += content;
}

function reset(s: CodeSource): void {
	s._start = 0;
	s._end = 0;
}

function hasMore(s: CodeSource): boolean {
	return s._end < s.content.length;
}

function startScan(s: CodeSource): void {
	s._start = s._end;
}

function getScan(s: CodeSource): string {
	return s.content.substring(s._start, s._end);
}

function getSpan(s: CodeSource): Span {
	return { start: s._start, end: s._end };
}

function peek(s: CodeSource): string | undefined {
	return s.content[s._end];
}

function consume(s: CodeSource): string | undefined {
	return s.content[s._end++];
}

function consumeAndPeek(s: CodeSource): string | undefined {
	return s.content[++s._end];
}

function match(s: CodeSource, toMatch: string): boolean {
	if (s.content.startsWith(toMatch, s._end)) {
		s._end += toMatch.length;
		return true;
	}
	return false;
}

function checkpoint(s: CodeSource): Checkpoint {
	return { start: s._start, end: s._end };
}

function restore(s: CodeSource, c: Checkpoint): void {
	s._start = c.start;
	s._end = c.end;
}
