import { describe, expect, it } from "bun:test";
import { parseOrderRequest } from "../orderbook/validation.ts";

const invalidInputs: [label: string, input: unknown][] = [
	["not an object", "order"],
	["null", null],
	["a bad side", { type: "limit", side: "hold", price: 1, quantity: 1 }],
	["a bad type", { type: "stop", side: "buy", price: 1, quantity: 1 }],
	["zero quantity", { type: "market", side: "buy", quantity: 0 }],
	["negative quantity", { type: "market", side: "buy", quantity: -1 }],
	["fractional quantity", { type: "market", side: "buy", quantity: 1.5 }],
	["string quantity", { type: "market", side: "buy", quantity: "1" }],
	[
		"a limit order without a price",
		{ type: "limit", side: "buy", quantity: 1 },
	],
	[
		"a fractional price",
		{ type: "limit", side: "buy", price: 1.5, quantity: 1 },
	],
	[
		"a market order with a price",
		{ type: "market", side: "buy", price: 1, quantity: 1 },
	],
];

describe("parseOrderRequest", () => {
	it("accepts a limit order", () => {
		expect(
			parseOrderRequest({
				type: "limit",
				side: "buy",
				price: 100,
				quantity: 5,
			}),
		).toEqual({
			ok: true,
			value: { type: "limit", side: "buy", price: 100, quantity: 5 },
		});
	});

	it("accepts a market order and drops unknown fields", () => {
		expect(
			parseOrderRequest({
				type: "market",
				side: "sell",
				quantity: 2,
				note: "hi",
			}),
		).toEqual({
			ok: true,
			value: { type: "market", side: "sell", quantity: 2 },
		});
	});

	it.each(invalidInputs)("rejects %s", (_label, input) => {
		const result = parseOrderRequest(input);

		expect(result.ok).toBe(false);
	});
});
