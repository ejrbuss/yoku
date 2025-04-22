import { assert } from "@std/assert/assert";

export type Scope<T> = Record<string, T>;

export type Scopes<T> = Scope<T>[];

function create<T>(): Scopes<T> {
	return [{}];
}

function find<T>(scopes: Scopes<T>, id: string): T | undefined {
	for (let i = scopes.length - 1; i >= 0; i--) {
		const value = scopes[i][id];
		if (value !== undefined) {
			return value;
		}
	}
	return undefined;
}

function update<T>(scopes: Scopes<T>, id: string, value: T): boolean {
	for (let i = scopes.length - 1; i >= 0; i--) {
		const scope = scopes[i];
		if (id in scope) {
			scope[id] = value;
			return true;
		}
	}
	return false;
}

function declare<T>(scopes: Scopes<T>, id: string, value: T): void {
	assert(scopes.length > 0);
	scopes[scopes.length - 1][id] = value;
}

function openScope<T>(scopes: Scopes<T>): void {
	scopes.push({});
}

function dropScope<T>(scopes: Scopes<T>): Scope<T> {
	const scope = scopes.pop();
	assert(scope !== undefined);
	return scope;
}

function copy<T>(scopes: Scopes<T>): Scopes<T> {
	const copy = [];
	for (const scope of scopes) {
		copy.push({ ...scope });
	}
	return copy;
}

function print<T>(scopes: Scopes<T>): string {
	if (scopes.length === 0) {
		return "{}";
	}
	const [first, ...rest] = scopes;
	const items: string[] = [];
	for (const id in first) {
		items.push(id);
	}
	items.push(print(rest));
	return `{ ${items.join(", ")} }`;
}

export const Scopes = {
	create,
	find,
	update,
	declare,
	openScope,
	dropScope,
	copy,
	print,
};
