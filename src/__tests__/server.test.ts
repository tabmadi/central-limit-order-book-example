import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Server } from "bun";
import { OrderBook } from "../orderbook/order-book.ts";
import type { BookSnapshot, OrderResult } from "../orderbook/types.ts";
import { createServer } from "../server.ts";

describe("HTTP API", () => {
	let server: Server;

	beforeEach(() => {
		// Port 0 lets the OS pick a free port, so tests never collide.
		server = createServer({
			book: new OrderBook(),
			port: 0,
			bookDepth: 10,
			tradeLimit: 50,
		});
	});

	afterEach(async () => {
		await server.stop(true);
	});

	const call = (path: string, init?: RequestInit) =>
		fetch(new URL(path, server.url), init);

	const submit = (order: unknown) =>
		call("/orders", { method: "POST", body: JSON.stringify(order) });

	it("reports health", async () => {
		const response = await call("/health");

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ status: "ok" });
	});

	it("matches orders and shows the result in /book and /trades", async () => {
		await submit({ type: "limit", side: "sell", price: 101, quantity: 5 });
		const response = await submit({ type: "market", side: "buy", quantity: 2 });

		expect(response.status).toBe(201);
		expect(await response.json()).toMatchObject({
			status: "filled",
			trades: [{ price: 101, quantity: 2 }],
		});

		const book = await (await call("/book")).json();
		expect(book).toEqual({
			bids: [],
			asks: [{ price: 101, quantity: 3, orders: 1 }],
			spread: null,
		});

		const trades = await (await call("/trades?limit=1")).json();
		expect(trades).toMatchObject([{ price: 101, quantity: 2 }]);
	});

	it("limits /book depth", async () => {
		await submit({ type: "limit", side: "buy", price: 99, quantity: 1 });
		await submit({ type: "limit", side: "buy", price: 98, quantity: 1 });

		const book = (await (await call("/book?depth=1")).json()) as BookSnapshot;

		expect(book.bids).toEqual([{ price: 99, quantity: 1, orders: 1 }]);
	});

	it("cancels a resting order", async () => {
		const placed = await submit({
			type: "limit",
			side: "buy",
			price: 99,
			quantity: 4,
		});
		const { orderId } = (await placed.json()) as OrderResult;

		const cancelled = await call(`/orders/${orderId}`, { method: "DELETE" });
		expect(cancelled.status).toBe(200);
		expect(await cancelled.json()).toMatchObject({ id: orderId, remaining: 4 });

		const again = await call(`/orders/${orderId}`, { method: "DELETE" });
		expect(again.status).toBe(404);
	});

	it("rejects invalid orders with a reason", async () => {
		const invalid = await submit({ type: "limit", side: "buy", quantity: 1 });
		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toHaveProperty("error");

		const notJson = await call("/orders", { method: "POST", body: "{" });
		expect(notJson.status).toBe(400);
	});

	it("rejects invalid query parameters", async () => {
		expect((await call("/book?depth=-1")).status).toBe(400);
		expect((await call("/trades?limit=abc")).status).toBe(400);
	});

	it("returns 404 for unknown paths", async () => {
		expect((await call("/nope")).status).toBe(404);
	});
});
