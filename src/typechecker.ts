export type Interpreter = {
	inGlobalScope: boolean;
	// TODO this should probably be soemthing like global > module > local
	globals: RtValue[];
	closure: RtValue[];
	locals: RtValue[];
};
