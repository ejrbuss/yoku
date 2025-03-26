import { Type } from "./types.ts";

export enum TokenTag {}

export type Token = {
	tag: TokenTag;
	data: unknown;
	start: number;
	end: number;
};

enum AstTag {}

type Ast = {
	tag: AstTag;
	data: unknown;
	start: number;
	end: number;
	children: Ast[];
};

type TypedAst = Ast & {
	children: TypedAst[];
	type: Type;
};
