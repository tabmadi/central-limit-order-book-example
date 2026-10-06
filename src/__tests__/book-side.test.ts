import { describe, expect, it } from "bun:test";
import { BookSide } from "../orderbook/book-side.ts";
import type { RestingOrder, Side } from "../orderbook/types.ts";

const order = (id: number, side: Side, price: number): RestingOrder => ({
	id,
	side,
	price,
	quantity: 1,
	remaining: 1,
});

describe("BookSide", () => {
	it("puts the highest bid first", () => {
		const bids = new BookSide("buy");
		bids.add(order(1, "buy", 99));
		bids.add(order(2, "buy", 101));
		bids.add(order(3, "buy", 100));

		expect(bids.best()?.price).toBe(101);
		expect(bids.snapshot(10).map((level) => level.price)).toEqual([
			101, 100, 99,
		]);
	});

	it("puts the lowest ask first", () => {
		const asks = new BookSide("sell");
		asks.add(order(1, "sell", 101));
		asks.add(order(2, "sell", 99));
		asks.add(order(3, "sell", 100));

		expect(asks.best()?.price).toBe(99);
		expect(asks.snapshot(2).map((level) => level.price)).toEqual([99, 100]);
	});

	it("drops a level when its last order is removed", () => {
		const asks = new BookSide("sell");
		const only = order(1, "sell", 100);
		asks.add(only);
		asks.add(order(2, "sell", 101));

		expect(asks.remove(only)).toBe(only);
		expect(asks.best()?.price).toBe(101);
	});

	it("keeps a level that still has orders", () => {
		const asks = new BookSide("sell");
		const first = order(1, "sell", 100);
		asks.add(first);
		asks.add(order(2, "sell", 100));

		asks.remove(first);

		expect(asks.snapshot(10)).toEqual([{ price: 100, quantity: 1, orders: 1 }]);
	});

	it("returns undefined when removing an order that is not there", () => {
		const asks = new BookSide("sell");

		expect(asks.remove(order(1, "sell", 100))).toBeUndefined();
	});
});
