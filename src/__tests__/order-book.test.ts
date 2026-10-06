import { describe, expect, it } from "bun:test";
import { OrderBook } from "../orderbook/order-book.ts";
import type { Side } from "../orderbook/types.ts";

const limit = (side: Side, price: number, quantity: number) =>
	({ type: "limit", side, price, quantity }) as const;
const market = (side: Side, quantity: number) =>
	({ type: "market", side, quantity }) as const;

describe("OrderBook", () => {
	describe("resting", () => {
		it("rests a limit order that does not cross", () => {
			const book = new OrderBook();
			book.submit(limit("sell", 101, 5));

			const result = book.submit(limit("buy", 100, 3));

			expect(result).toMatchObject({
				status: "resting",
				filledQuantity: 0,
				restingQuantity: 3,
				trades: [],
			});
			expect(book.snapshot(10)).toEqual({
				bids: [{ price: 100, quantity: 3, orders: 1 }],
				asks: [{ price: 101, quantity: 5, orders: 1 }],
				spread: 1,
			});
		});

		it("sorts bids highest first and asks lowest first", () => {
			const book = new OrderBook();
			book.submit(limit("buy", 98, 1));
			book.submit(limit("buy", 99, 1));
			book.submit(limit("sell", 103, 1));
			book.submit(limit("sell", 102, 1));

			const { bids, asks } = book.snapshot(10);

			expect(bids.map((level) => level.price)).toEqual([99, 98]);
			expect(asks.map((level) => level.price)).toEqual([102, 103]);
		});

		it("aggregates orders at the same price and limits depth", () => {
			const book = new OrderBook();
			book.submit(limit("buy", 99, 2));
			book.submit(limit("buy", 99, 3));
			book.submit(limit("buy", 98, 1));

			expect(book.snapshot(1).bids).toEqual([
				{ price: 99, quantity: 5, orders: 2 },
			]);
		});
	});

	describe("matching", () => {
		it("fully fills when an equal quantity crosses", () => {
			const book = new OrderBook();
			const maker = book.submit(limit("sell", 100, 5));

			const result = book.submit(limit("buy", 100, 5));

			expect(result.status).toBe("filled");
			expect(result.trades).toEqual([
				{
					id: 1,
					price: 100,
					quantity: 5,
					takerSide: "buy",
					makerOrderId: maker.orderId,
					takerOrderId: result.orderId,
				},
			]);
			expect(book.snapshot(10)).toEqual({ bids: [], asks: [], spread: null });
		});

		it("rests the remainder of a partially filled limit order", () => {
			const book = new OrderBook();
			book.submit(limit("sell", 100, 2));

			const result = book.submit(limit("buy", 100, 5));

			expect(result).toMatchObject({
				status: "partially_filled",
				filledQuantity: 2,
				restingQuantity: 3,
				cancelledQuantity: 0,
			});
			expect(book.snapshot(10).bids).toEqual([
				{ price: 100, quantity: 3, orders: 1 },
			]);
		});

		it("trades at the maker's price, not the taker's", () => {
			const book = new OrderBook();
			book.submit(limit("sell", 100, 1));

			const result = book.submit(limit("buy", 105, 1));

			expect(result.trades[0]?.price).toBe(100);
		});

		it("sweeps several levels, best price first, and stops at its limit", () => {
			const book = new OrderBook();
			book.submit(limit("sell", 100, 1));
			book.submit(limit("sell", 101, 1));
			book.submit(limit("sell", 102, 1));

			const result = book.submit(limit("buy", 101, 3));

			expect(result.trades.map((trade) => trade.price)).toEqual([100, 101]);
			expect(result.restingQuantity).toBe(1);
			expect(book.snapshot(10)).toMatchObject({
				bids: [{ price: 101, quantity: 1 }],
				asks: [{ price: 102, quantity: 1 }],
			});
		});

		it("fills the oldest order first at the same price", () => {
			const book = new OrderBook();
			const first = book.submit(limit("buy", 100, 2));
			const second = book.submit(limit("buy", 100, 2));

			const result = book.submit(limit("sell", 100, 3));

			expect(result.trades).toMatchObject([
				{ makerOrderId: first.orderId, quantity: 2 },
				{ makerOrderId: second.orderId, quantity: 1 },
			]);
			expect(book.snapshot(10).bids).toEqual([
				{ price: 100, quantity: 1, orders: 1 },
			]);
		});

		it("records every trade in the history, oldest first", () => {
			const book = new OrderBook();
			book.submit(limit("sell", 100, 1));
			book.submit(limit("sell", 101, 1));
			book.submit(market("buy", 2));

			expect(book.trades(10).map((trade) => trade.price)).toEqual([100, 101]);
			expect(book.trades(1).map((trade) => trade.price)).toEqual([101]);
			expect(book.trades(0)).toEqual([]);
		});
	});

	describe("market orders", () => {
		it("takes whatever price the book offers", () => {
			const book = new OrderBook();
			book.submit(limit("buy", 99, 1));
			book.submit(limit("buy", 90, 1));

			const result = book.submit(market("sell", 2));

			expect(result.status).toBe("filled");
			expect(result.trades.map((trade) => trade.price)).toEqual([99, 90]);
		});

		it("discards what it cannot fill instead of resting", () => {
			const book = new OrderBook();
			book.submit(limit("sell", 100, 2));

			const result = book.submit(market("buy", 5));

			expect(result).toMatchObject({
				status: "partially_filled",
				filledQuantity: 2,
				restingQuantity: 0,
				cancelledQuantity: 3,
			});
			expect(book.snapshot(10).bids).toEqual([]);
		});

		it("is cancelled outright on an empty book", () => {
			const book = new OrderBook();

			const result = book.submit(market("buy", 5));

			expect(result).toMatchObject({
				status: "cancelled",
				cancelledQuantity: 5,
				trades: [],
			});
		});
	});

	describe("cancel", () => {
		it("takes a resting order off the book", () => {
			const book = new OrderBook();
			const { orderId } = book.submit(limit("buy", 100, 5));

			expect(book.cancel(orderId)?.remaining).toBe(5);
			expect(book.snapshot(10).bids).toEqual([]);
		});

		it("keeps other orders at the same price in place", () => {
			const book = new OrderBook();
			const first = book.submit(limit("buy", 100, 1));
			book.submit(limit("buy", 100, 2));

			book.cancel(first.orderId);

			expect(book.snapshot(10).bids).toEqual([
				{ price: 100, quantity: 2, orders: 1 },
			]);
		});

		it("cancels only the unfilled remainder", () => {
			const book = new OrderBook();
			const { orderId } = book.submit(limit("buy", 100, 5));
			book.submit(limit("sell", 100, 2));

			expect(book.cancel(orderId)?.remaining).toBe(3);
		});

		it("ignores unknown and already filled orders", () => {
			const book = new OrderBook();
			const { orderId } = book.submit(limit("buy", 100, 1));
			book.submit(limit("sell", 100, 1));

			expect(book.cancel(orderId)).toBeUndefined();
			expect(book.cancel(999)).toBeUndefined();
		});
	});
});
