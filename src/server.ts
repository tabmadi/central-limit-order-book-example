import type { Server } from "bun";
import type { OrderBook } from "./orderbook/order-book.ts";
import { parseOrderRequest } from "./orderbook/validation.ts";

export interface ServerOptions {
	book: OrderBook;
	port: number;
	bookDepth: number;
	tradeLimit: number;
}

const badRequest = (error: string) => Response.json({ error }, { status: 400 });
const notFound = (error: string) => Response.json({ error }, { status: 404 });

/**
 * Reads an optional non-negative integer query parameter. Returns `fallback`
 * when it is absent and `undefined` when it is present but invalid.
 */
function readCount(url: string, name: string, fallback: number) {
	const raw = new URL(url).searchParams.get(name);
	if (raw === null) {
		return fallback;
	}
	const value = Number(raw);
	return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/**
 * A thin HTTP adapter over the order book: it parses requests, calls the
 * engine, and serialises the result. No trading logic lives here.
 */
export function createServer({
	book,
	port,
	bookDepth,
	tradeLimit,
}: ServerOptions): Server {
	return Bun.serve({
		port,
		routes: {
			"/health": {
				GET: () =>
					Response.json({
						status: "ok",
						timestamp: new Date().toISOString(),
						uptime: process.uptime(),
					}),
			},

			"/orders": {
				POST: async (request) => {
					let body: unknown;
					try {
						body = await request.json();
					} catch {
						return badRequest("body must be valid JSON");
					}

					const parsed = parseOrderRequest(body);
					if (!parsed.ok) {
						return badRequest(parsed.error);
					}
					return Response.json(book.submit(parsed.value), { status: 201 });
				},
			},

			"/orders/:id": {
				DELETE: (request) => {
					const cancelled = book.cancel(Number(request.params.id));
					if (cancelled === undefined) {
						return notFound("no resting order with that id");
					}
					return Response.json(cancelled);
				},
			},

			"/book": {
				GET: (request) => {
					const depth = readCount(request.url, "depth", bookDepth);
					if (depth === undefined) {
						return badRequest("depth must be a non-negative integer");
					}
					return Response.json(book.snapshot(depth));
				},
			},

			"/trades": {
				GET: (request) => {
					const limit = readCount(request.url, "limit", tradeLimit);
					if (limit === undefined) {
						return badRequest("limit must be a non-negative integer");
					}
					return Response.json(book.trades(limit));
				},
			},
		},

		fetch: () => notFound("not found"),
	});
}
