/**
 * Domain types for a single-symbol central limit order book.
 *
 * Prices and quantities are plain integers: a price is a number of ticks
 * (e.g. cents) and a quantity is a number of lots. Real exchanges do the same
 * so that `0.1 + 0.2 !== 0.3` can never corrupt a balance.
 */

/** A buyer submits a `buy` (a bid), a seller submits a `sell` (an ask). */
export type Side = "buy" | "sell";

/**
 * - `limit`: trade at this price or better; whatever does not fill rests on the book.
 * - `market`: trade immediately at any price; whatever does not fill is discarded.
 */
export type OrderType = "limit" | "market";

export interface LimitOrderRequest {
	type: "limit";
	side: Side;
	price: number;
	quantity: number;
}

export interface MarketOrderRequest {
	type: "market";
	side: Side;
	quantity: number;
}

/** What a client asks the book to do. */
export type OrderRequest = LimitOrderRequest | MarketOrderRequest;

/** A limit order waiting on the book for someone to trade against it. */
export interface RestingOrder {
	id: number;
	side: Side;
	price: number;
	/** The quantity the order was submitted with. */
	quantity: number;
	/** The quantity still waiting to be filled. */
	remaining: number;
}

/**
 * A match between two orders. The `maker` is the order that was already
 * resting on the book; the `taker` is the incoming order that crossed it.
 */
export interface Trade {
	id: number;
	price: number;
	quantity: number;
	takerSide: Side;
	makerOrderId: number;
	takerOrderId: number;
}

/**
 * - `filled`: the whole quantity traded.
 * - `partially_filled`: some traded; the rest rests (limit) or was discarded (market).
 * - `resting`: nothing traded; the whole order rests on the book.
 * - `cancelled`: nothing traded and nothing rests (a market order on an empty side).
 */
export type OrderStatus =
	| "filled"
	| "partially_filled"
	| "resting"
	| "cancelled";

/** The outcome of submitting one order. The three quantities always sum to the submitted quantity. */
export interface OrderResult {
	orderId: number;
	status: OrderStatus;
	filledQuantity: number;
	restingQuantity: number;
	cancelledQuantity: number;
	trades: Trade[];
}

/** All orders at one price, aggregated: what a trading screen shows per row. */
export interface LevelSnapshot {
	price: number;
	quantity: number;
	orders: number;
}

export interface BookSnapshot {
	/** Best (highest) bid first. */
	bids: LevelSnapshot[];
	/** Best (lowest) ask first. */
	asks: LevelSnapshot[];
	/** `bestAsk - bestBid`, or `null` while either side is empty. */
	spread: number | null;
}
