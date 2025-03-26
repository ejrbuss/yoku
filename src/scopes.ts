import { Span } from "./utils.ts";
import { assert } from "@std/assert/assert";

export type Decl<T> = {
	mutable: boolean;
	allowShadow: boolean;
	value: T;
	sourceLocation?: Span;
};

type Scope<T> = Record<string, Decl<T>>;

export class Scopes<T> {
	// Global scope is created by default
	private scopes: Scope<T>[] = [{}];

	declareGlobal(id: string, decl: Decl<T>): boolean {
		const priorDecl = this.getDecl(id);
		if (priorDecl && !priorDecl.allowShadow) {
			return false;
		}
		this.globalScope[id] = decl;
		return true;
	}

	declareLocal(id: string, decl: Decl<T>): boolean {
		const priorDecl = this.getDecl(id);
		if (priorDecl && !priorDecl.allowShadow) {
			return false;
		}
		this.localScope[id] = decl;
		return true;
	}

	getDecl(id: string): Decl<T> | undefined {
		for (let i = this.scopes.length - 1; i >= 0; i--) {
			const scope = this.scopes[i];
			const decl = scope[id];
			if (decl !== undefined) {
				return decl;
			}
		}
		return undefined;
	}

	get(id: string): T | undefined {
		return this.getDecl(id)?.value;
	}

	set(id: string, value: T): void {
		const decl = this.getDecl(id);
		assert(decl, `'${id}' is not declared!`);
		assert(decl.mutable, `'${id}' is not mutable!`);
		decl.value = value;
	}

	openScope(): void {
		this.scopes.push({});
	}

	dropScope(): void {
		assert(this.scopes.length > 1, "You cannot pop the global scope!");
		this.scopes.pop();
	}

	capture(): Scopes<T> {
		const captured = new Scopes<T>();
		captured.globalScope = this.globalScope;
		for (let i = 1; i < this.scopes.length; i++) {
			const original = this.scopes[i];
			const copy: Scope<T> = {};
			for (const [id, decl] of Object.entries(original)) {
				copy[id] = { ...decl };
			}
			captured.scopes.push(copy);
		}
		return captured;
	}

	get inGlobalScope(): boolean {
		return this.scopes.length === 1;
	}

	private get globalScope(): Scope<T> {
		return this.scopes[0];
	}

	private set globalScope(scope: Scope<T>) {
		this.scopes[0] = scope;
	}

	private get localScope(): Scope<T> {
		return this.scopes[this.scopes.length - 1];
	}
}
