import { BookSide } from "./book-side.ts";
import type {
	BookSnapshot,
	OrderRequest,
	OrderResult,
	OrderStatus,
	RestingOrder,
	Side,
	Trade,
} from "./types.ts";

/**
 * A central limit order book for one symbol, with price-time priority matching.
 *
 * Start reading at `submit`: every incoming order first trades against the
 * opposite side for as long as prices cross, then any limit remainder rests on
 * its own side and waits.
 */
export class OrderBook {
	private readonly bids = new BookSide("buy");
	private readonly asks = new BookSide("sell");
	/** Every resting order by id, so a cancel does not have to search the book. */
	private readonly restingOrders = new Map<number, RestingOrder>();
	private readonly tradeHistory: Trade[] = [];
	private nextOrderId = 1;
	private nextTradeId = 1;

	submit(request: OrderRequest): OrderResult {
		// Market orders have no price limit: they accept whatever the book offers.
		const limitPrice = request.type === "limit" ? request.price : null;
		const taker: RestingOrder = {
			id: this.nextOrderId++,
			side: request.side,
			// Only read if the order rests, and a market order never rests.
			price: limitPrice ?? 0,
			quantity: request.quantity,
			remaining: request.quantity,
		};

		// 1. Match: trade against the opposite side while prices cross.
		const trades = this.match(taker, limitPrice);

		// 2. Rest: a limit order keeps its unfilled remainder on the book;
		//    a market order's remainder is discarded.
		let restingQuantity = 0;
		if (request.type === "limit" && taker.remaining > 0) {
			this.ownSide(taker.side).add(taker);
			this.restingOrders.set(taker.id, taker);
			restingQuantity = taker.remaining;
		}

		const filledQuantity = taker.quantity - taker.remaining;
		return {
			orderId: taker.id,
			status: statusOf(taker.quantity, filledQuantity, restingQuantity),
			filledQuantity,
			restingQuantity,
			cancelledQuantity: taker.quantity - filledQuantity - restingQuantity,
			trades,
		};
	}

	/** Takes a resting order off the book. Returns `undefined` if it is not resting. */
	cancel(orderId: number): RestingOrder | undefined {
		const order = this.restingOrders.get(orderId);
		if (order === undefined) {
			return undefined;
		}
		this.restingOrders.delete(orderId);
		return this.ownSide(order.side).remove(order);
	}

	/** The best `depth` price levels on each side. */
	snapshot(depth: number): BookSnapshot {
		const bestBid = this.bids.best()?.price;
		const bestAsk = this.asks.best()?.price;
		return {
			bids: this.bids.snapshot(depth),
			asks: this.asks.snapshot(depth),
			spread:
				bestBid === undefined || bestAsk === undefined
					? null
					: bestAsk - bestBid,
		};
	}

	/** The most recent `limit` trades, oldest first. */
	trades(limit: number): Trade[] {
		return limit > 0 ? this.tradeHistory.slice(-limit) : [];
	}

	/**
	 * The heart of the engine. Repeatedly takes the best level on the opposite
	 * side (price priority) and, within it, the oldest order (time priority),
	 * until the taker is filled or the prices stop crossing.
	 */
	private match(taker: RestingOrder, limitPrice: number | null): Trade[] {
		const opposite = this.oppositeSide(taker.side);
		const trades: Trade[] = [];

		while (taker.remaining > 0) {
			const level = opposite.best();
			if (
				level === undefined ||
				!crosses(taker.side, limitPrice, level.price)
			) {
				break;
			}

			const makerRemaining = level.peek()?.remaining ?? 0;
			const quantity = Math.min(taker.remaining, makerRemaining);
			const maker = level.fillFront(quantity);
			taker.remaining -= quantity;

			if (maker.remaining === 0) {
				this.restingOrders.delete(maker.id);
			}
			opposite.dropIfEmpty(level);

			// The trade happens at the maker's price: the resting order set the
			// price, and the taker gets that price even if it was willing to pay more.
			trades.push(this.recordTrade(level.price, quantity, maker, taker));
		}

		return trades;
	}

	private recordTrade(
		price: number,
		quantity: number,
		maker: RestingOrder,
		taker: RestingOrder,
	): Trade {
		const trade: Trade = {
			id: this.nextTradeId++,
			price,
			quantity,
			takerSide: taker.side,
			makerOrderId: maker.id,
			takerOrderId: taker.id,
		};
		this.tradeHistory.push(trade);
		return trade;
	}

	private ownSide(side: Side): BookSide {
		return side === "buy" ? this.bids : this.asks;
	}

	private oppositeSide(side: Side): BookSide {
		return side === "buy" ? this.asks : this.bids;
	}
}

/**
 * Do the prices cross? A buyer crosses an ask priced at or below its limit; a
 * seller crosses a bid priced at or above its limit. A market order (no limit)
 * crosses anything.
 */
function crosses(
	takerSide: Side,
	limitPrice: number | null,
	makerPrice: number,
): boolean {
	if (limitPrice === null) {
		return true;
	}
	return takerSide === "buy"
		? makerPrice <= limitPrice
		: makerPrice >= limitPrice;
}

function statusOf(
	quantity: number,
	filledQuantity: number,
	restingQuantity: number,
): OrderStatus {
	if (filledQuantity === quantity) {
		return "filled";
	}
	if (filledQuantity > 0) {
		return "partially_filled";
	}
	return restingQuantity > 0 ? "resting" : "cancelled";
}
