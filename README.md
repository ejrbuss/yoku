# yoku

```
-- ## Reserved Words
-- Primitve types
Byte
Char
Int32
Int64
Int
Float32
Float64
Float
Any
This

-- Type Constructors/Enums
Bool
Option
Result
Type
Array
List
Map

```txt
-- All reference objects have an extra 8 bytes 
-- for reference counting
struct HeapObject {
	Int32 refCount;
	Int32 weakRefHandle;
	...
}

-- If you could observe the any type it would look something 
-- like this, and it only allows you to dereference if you give
-- it the correct type.
struct Any {
	Type type;
	RawReference reference;
}

-- Can we dynamically construct an abstract type at runtime?
abstract MyAbstract {
	proc myAbstractProc();
}

struct MyConcrete {}

impl MyAbstract for MyConcrete {
	proc myAbstractProc();
}

-- In the static case the concrete class can be implicitly cast
const concreteInstance: MyConcrete = MyConcrete {};
const abstractInstance: MyAbstract = concreteInstance;

-- But what about in the dynamic case?
const anyInstance: Any = Any(concreteInstance);
const abstractInstance: MyAbstract = Any as MyAbstract;

-- Here Any contains a type that implements MyAbstract, but
-- that is not known statically. It not only has to be discovered
-- dynamically, which should already be available through the <:
-- operator:
assert MyConcrete <: MyAbstract

-- But it also needs to dynamically construct such an instance.
-- This makes the `as` operator on Any very special. But this
-- might be a desirable method to have on `Type`

impl[I, T: I] Type[T] {

	proc implement(t: This, instance: T) -> I {
		-- Find a copy of the vtable in the type
		const vtable: VTable[I] = This.implementations[Any(I)] ? throw Unreachable {};
		-- Create a new instance of the I
		return (t, vtable)
	}

}

-- On second thought this is a bad idea - Any should require a 
-- cast to exactly that type it first contained, whether concrete
-- or abstract.

-- How hard would it be to support tuples?
-- They really help in the enumerate case
for (i, v) in iter.enumerate() {

}

-- opaque types are useful to avoid boilerplate of
enum StrImpl {
	case HeapStr(Array[Byte], Int32);
	case SmallStr(Int32, ByteBuffer[7])
}

export type Str = opaque StrImpl;

-- Should it be a keyword or a type?
export type Str = Opaque[StrImpl];

-- Or a little clunky but maybe good, opaque by default
export type ImOpaque = Int;
export type ImTransparent = export Int;

-- You can ONLY implement an asbtract type if either the abstract -- type or the implementing type are defined in the current module
-- new types/type aliases count
import SomeModule as { ImportedType };

type MyType = ImportedType;

impl SomeAbstractType for MyType {
	-- Allowed
}

const x = data.bit_and(0xff);


```

Could we get rid of abstarct entirely? Keep it simple stupid?

```
struct Iter[T] {
	const next: proc() -> T?
}

impl Iter {

	proc map[R](this: This, transform: proc(T) -> R) -> Iter[R] {
		Iter { proc() -> {
			transform(this.next())
		}}
	}

	proc filter(this: This, predicate: proc(T) -> Bool) -> Iter[T] {
		Iter { proc() -> {
			loop {
				match this.next {
					Some { value } => {
						if predicate(value) {
							return Some { value }
						}
					}
					None => { None }
				}
			}
		}}
	}

	proc reduce[A](this: This, acc: A, reducer: proc(A, T) -> A) -> A {
		for value in this {
			acc = reducer(acc, value);
		}
		acc
	}

}

union List[T] {
	Empty;
	Cons(T, List[T]);
}

impl List {

	proc toIter(this: This) -> Iter[T] {
		var head = this;
		Iter { proc() -> {
			match head {
				Empty => { None }
				Cons(first, rest) => {
					head = rest;
					Some { first }
				}
			}
		}}
	}

}

const myList = List.Cons(1, List.Cons(2, List.Cons(3, List.Empty)))
for value in myList.toIter() {
	print(value)
}

-- What if I just want to quickly assert my way to a particular sub type?
const list: List[Int] = ...;
const Cons(value, _) = list; -- Will throw an exception if the pattern fails to match, otherwise

  -- Just deal with doing a full match, explicitness is good
const x: Int? = match list { Cons(value, _) => { 42 } }


struct Complex[T] {
	const real: T;
	const imag: T;
}

impl Complex {

	export proc +(a: This, b: This) -> This {
		Cmplex {
			real = a.real + b.real,
			imag = a.imag + b.imag,
		}
	}

}

const map: Map[Point, Int] = Map.of(
	(Point { 3, 4 }, 2),
	(Point { 1, 2 }, 5),
);

const mapAlt = Map.empty[MyType, Int](myHashFn);

Top 3 bits of all references could be special flags
2 for the reference type
 - Local
 - Shared
 - Raw
 - Weak
1 to use as a spin lock depending on the reference type
How much of this shows up at the type level?

```

Get runtime types
```
const int_type: Type[Int] = type Int;
const float_type: Type[Float] = Type.of(4.5);
```

Assert types out of Any
```
const assert Result.Ok { value } = some_any_value;
```

```
trait Show {
	proc show(self: Self) -> Str;
}

trait Hash {
	proc hash(self: Self) -> Int;
}
```


```
-- Somewhat compact/data oriented model for tokenizer
export struct TokenData {
	export var ignore: Array[TokenType]
	var position: Int
	const tokens: Array[TokenType]
	const positions: Array[Int]
	const intValues: Array[(Int, Int)]
	const floatValues: Array[(Int, Float)]
	const strValues: Array[(Int, Float)]
	const idValues: Array[(Int, Str)]
	const noteValues: Array[(Int, Str)]
}

export type Token = Int

impl TokenData {

	proc spanOf(td: This, t: Token) -> Span {
		return Span {
			start = this.positions[t],
			end = this.positions[t + 1],
		}
	}

}
```

### TODO
```yoku
-- structs
struct Person {
	const name: Str
	var age: Int
}

inline struct Complex {
	const r: Float
	const i: Float
}

inline proc p() {}

-- enums 
enum Alignment {
	Good
	Bad
}

const a = Alignment.Good
-- exhaustive matching
const shout: Str = match a {
	Good => "yay!"
	Bad => "boo!"
}

enum Expr {
	Add { const left: Expr; const right: Expr }
	Mul {
		const left: Expr
		const rigt: Expr
	}
	Div(Int, Int),
	Num(Int)
	Zero
}

-- Impl blocks
impl Int {

	proc add_float(a: This, b: Int) -> Int {
		return a + b
	}

}

Int.add(3, 4) --> 7
(3).add(4) --> 7

-- String interpolation
-- Try/Catch/Throw

-- Parameterized types
enum Option[T] {
	Some(T),
	None
}
-- Runtime types
-- Modules, import/export
-- Start Standard Library
-- Doc comments
-- Annotations (main, deprecated, builtin, external, test, unspecialized, packed, align)

proc owned(t: TypeExpr) -> () { ... }

-- The following will make a call to owned once per source code usage
-- The annotation can also be found on runtime type info
proc init_world() -> @owned RawRef[World] {}

struct GameState {
	const world: @owned RawRef[World]
}

-- Prelude (define types in prelude)
-- Array
-- Iter
-- for loops
-- Variadic Args
-- Option
-- Result
-- Ref
-- Map
-- List
-- Union types

-- assert throws ideas
const assert Result.Ok(_) = Result.of(proc () { f() })
const assert Result.Error(_): Result.Error[DivisionByZero] = Result.of(proc() { f() })
assert f() throws DivisionByZero -- New keyword just for assert ;_;
assert throws(proc() { f() }) == DivizionByZero.Tag

-- In general I have some enum, and I want to assert it some variant?
enum MyEnum {
	V1(Int)
	V2(Bool)
}
const x: MyEnum = ...
const assert MyEnum.V1(_) = x
-- throw/result is just nastier because of the extra layer, so maybe throws is worth it?

-- use statement
use file = open("data.txt") -- will call close at end of scope

-- parametrized tests
test "parameterized" for value in Array.of(1, 2, 3, 4) {

}

-- Let's pretend we have type level unions ie.
type Num = Int | Float
var x: Num = 4
x = 3.5 -- allowed

-- How do we convert a result of one type to another?
type Result1 = Result[Ok, A]
type Result2 = Result[Ok, B | C]
type Result3 = Result[Ok, A | B | C]

const r1: Result1 = ...
if assert Result.Error(e) = r1 {
	-- e can convert to union, type decided by proc signature
	return Result.Error(e) 
}
const r2: Result2 = ...
const r2 = match r2 {
	Ok(ok) => { ok },
	Error(error) => { return Result.Error(error) }
}

const new = match old {
	V1(new) => { new },
	V2(bad) => { return V2(bad) }
}

const new = match catch V1

-- Maybe ? really is the way to go

```

When rewriting the language, consider that we really have three langauges
 - Language of types
 - Language of patterns
 - Langauge of statements and expressions

The first two can be parsed and understood almost entirely on their own. The 
third requires integration with the other two.