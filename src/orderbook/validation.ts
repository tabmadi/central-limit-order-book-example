import type { OrderRequest } from "./types.ts";

export type ParseResult =
	| { ok: true; value: OrderRequest }
	| { ok: false; error: string };

const fail = (error: string): ParseResult => ({ ok: false, error });

const isPositiveInteger = (value: unknown): value is number =>
	Number.isSafeInteger(value) && (value as number) > 0;

/**
 * Turns untrusted input (a parsed JSON body) into an `OrderRequest`, or
 * explains what is wrong with it. The engine trusts its input, so every check
 * lives here, at the edge.
 */
export function parseOrderRequest(input: unknown): ParseResult {
	if (typeof input !== "object" || input === null) {
		return fail("body must be a JSON object");
	}
	const { type, side, price, quantity } = input as Record<string, unknown>;

	if (side !== "buy" && side !== "sell") {
		return fail('side must be "buy" or "sell"');
	}
	if (!isPositiveInteger(quantity)) {
		return fail("quantity must be a positive integer (lots)");
	}

	if (type === "limit") {
		if (!isPositiveInteger(price)) {
			return fail("a limit order needs a positive integer price (ticks)");
		}
		return { ok: true, value: { type, side, price, quantity } };
	}
	if (type === "market") {
		if (price !== undefined) {
			return fail("a market order must not have a price");
		}
		return { ok: true, value: { type, side, quantity } };
	}
	return fail('type must be "limit" or "market"');
}
