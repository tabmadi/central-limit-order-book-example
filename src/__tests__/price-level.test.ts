import { describe, expect, it } from "bun:test";
import { PriceLevel } from "../orderbook/price-level.ts";
import type { RestingOrder } from "../orderbook/types.ts";

const order = (id: number, quantity: number): RestingOrder => ({
	id,
	side: "sell",
	price: 100,
	quantity,
	remaining: quantity,
});

describe("PriceLevel", () => {
	it("starts empty", () => {
		const level = new PriceLevel(100);

		expect(level.isEmpty).toBe(true);
		expect(level.totalQuantity).toBe(0);
		expect(level.peek()).toBeUndefined();
	});

	it("keeps orders in arrival order and sums their quantity", () => {
		const level = new PriceLevel(100);
		level.enqueue(order(1, 5));
		level.enqueue(order(2, 3));

		expect(level.peek()?.id).toBe(1);
		expect(level.orderCount).toBe(2);
		expect(level.totalQuantity).toBe(8);
	});

	it("partially fills the front order without moving it", () => {
		const level = new PriceLevel(100);
		level.enqueue(order(1, 5));
		level.enqueue(order(2, 3));

		const filled = level.fillFront(2);

		expect(filled.id).toBe(1);
		expect(filled.remaining).toBe(3);
		expect(level.peek()?.id).toBe(1);
		expect(level.totalQuantity).toBe(6);
	});

	it("removes the front order once it is fully filled", () => {
		const level = new PriceLevel(100);
		level.enqueue(order(1, 5));
		level.enqueue(order(2, 3));

		level.fillFront(5);

		expect(level.peek()?.id).toBe(2);
		expect(level.totalQuantity).toBe(3);
	});

	it("refuses to fill more than the front order has", () => {
		const level = new PriceLevel(100);
		level.enqueue(order(1, 5));

		expect(() => level.fillFront(6)).toThrow();
		expect(() => new PriceLevel(100).fillFront(1)).toThrow();
	});

	it("removes an order from anywhere in the queue", () => {
		const level = new PriceLevel(100);
		level.enqueue(order(1, 5));
		level.enqueue(order(2, 3));
		level.enqueue(order(3, 1));

		expect(level.remove(2)?.id).toBe(2);
		expect(level.remove(2)).toBeUndefined();
		expect(level.orderCount).toBe(2);
		expect(level.totalQuantity).toBe(6);
	});
});
