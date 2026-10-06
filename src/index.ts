import { config } from "./config.ts";
import { OrderBook } from "./orderbook/order-book.ts";
import { createServer } from "./server.ts";

const server = createServer({
	book: new OrderBook(),
	port: config.port,
	bookDepth: config.bookDepth,
	tradeLimit: config.tradeLimit,
});

// biome-ignore lint/suspicious/noConsole: it's just an example we don't want to add a logger for it
console.info(`Order book listening at http://localhost:${server.port}`);
