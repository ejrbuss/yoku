export enum BinaryOp {
	Add = "+",
	Sub = "-",
	Mul = "*",
	Div = "/",
	Rem = "%",
	Pow = "^",
	And = "&",
	Or = "|",
	Lt = "<",
	Lte = "<=",
	Gt = ">",
	Gte = ">=",
	Eq = "==",
	NotEq = "!=",
	Id = "===",
	NotId = "!==",
	Member = ".",
}

export enum UnaryOp {
	Not = "!",
	Neg = "-",
}

export enum AssignOp {
	Add = "+=",
	Sub = "-=",
	Mul = "*=",
	Div = "/=",
	Rem = "%=",
	And = "&=",
	Or = "|=",
	Assign = "=",
}

export const AssignToBinary: Record<AssignOp, BinaryOp | undefined> = {
	[AssignOp.Add]: BinaryOp.Add,
	[AssignOp.Sub]: BinaryOp.Sub,
	[AssignOp.Mul]: BinaryOp.Mul,
	[AssignOp.Div]: BinaryOp.Div,
	[AssignOp.Rem]: BinaryOp.Rem,
	[AssignOp.And]: BinaryOp.And,
	[AssignOp.Or]: BinaryOp.Or,
	[AssignOp.Assign]: undefined,
};
