# yoku

```
-- ## Reserved Words
-- Primitve types
Byte
Char
Int
Int32
Int64
Float
Float32
Float64
Any
This

-- Type Constructors/Enums
Bool
True
False
Option
None
Some
Result
Ok
Error
Type
Array
List
Map

-- Builtin functions
assert




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
const Result.Ok { value } = some_any_value;
```

```
trait Show {
	proc show(self: Self) -> Str;
}

trait Hash {
	proc hash(self: Self) -> Int;
}
```

### Mini TODO
```yoku
-- patterns in params
proc f((x, y): (Int, Int)) -> Int { x * y + y + x }
f((3, 4));

-- `as` aliasing
const (x, y, z) as point = (1, 2, 3); 

-- Type declarations
type i64 = Int; 

-- spread in tuples
const t1 = (1, 2);
const t2 = (3, 4);
const t3: (Int, Int, Bool, Int, Int) = (...t1, True, ...t2)

-- spread in calls
const f(x: Int, y: Int) -> Int { x * y + y + x }
f(...(3, 4));

-- spread in patterns
const (x, ...yz) = (1, 2, 3)

-- spread in types
type Point2D = (Int, Int)
type Point3D = (Int, ...Point2D)

-- match if/else
const x = 5;
const y = match {
	if x == 1 => { "one" }
	if x == 2 => { "two" }
	else => { "many" }
}
print(y);

-- match values
const x = 5;
match x {
	1 => { "one" }
	2 => { "two" }
	else { "many" }
}

-- parametrized tests (later)
test "parameterized" for value in Array.of(1, 2, 3, 4) {

}
```