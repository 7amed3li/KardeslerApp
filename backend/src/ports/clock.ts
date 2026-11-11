export interface Clock {
  now(): Date;
  nowMs(): number;
}

export interface IdGenerator {
  uuid(): string;
  randomHex(bytes: number): string;
  randomDigits6(): string;
}

