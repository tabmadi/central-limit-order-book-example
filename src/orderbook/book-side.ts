import { PriceLevel } from "./price-level.ts";
import type { LevelSnapshot, RestingOrder, Side } from "./types.ts";

/**
 * One side of the book: all bids, or all asks.
 *
 * Levels are kept sorted best-first, which gives "price priority": the
 * matching engine only ever needs `levels[0]`.
 * - bids: highest price first (the buyer willing to pay most goes first)
 * - asks: lowest price first (the seller willing to accept least goes first)
 *
 * A sorted array keeps the code readable. Inserting a new price is O(n);
 * production engines use a balanced tree or a heap for O(log n).
 */
export class BookSide {
	readonly side: Side;
	private readonly levels: PriceLevel[] = [];
	private readonly levelsByPrice = new Map<number, PriceLevel>();

	constructor(side: Side) {
		this.side = side;
	}

	/** The level that trades next, or `undefined` when this side is empty. */
	best(): PriceLevel | undefined {
		return this.levels[0];
	}

	/** Puts an order at the back of the queue for its price, creating the level if needed. */
	add(order: RestingOrder): void {
		let level = this.levelsByPrice.get(order.price);
		if (level === undefined) {
			level = new PriceLevel(order.price);
			this.insertLevel(level);
		}
		level.enqueue(order);
	}

	/** Takes an order off the book. Returns `undefined` if it is not resting here. */
	remove(order: RestingOrder): RestingOrder | undefined {
		const level = this.levelsByPrice.get(order.price);
		const removed = level?.remove(order.id);
		if (level !== undefined) {
			this.dropIfEmpty(level);
		}
		return removed;
	}

	/** Drops a level once its last order has been filled or cancelled. */
	dropIfEmpty(level: PriceLevel): void {
		if (!level.isEmpty) {
			return;
		}
		this.levelsByPrice.delete(level.price);
		this.levels.splice(this.levels.indexOf(level), 1);
	}

	/** The best `depth` levels, aggregated. */
	snapshot(depth: number): LevelSnapshot[] {
		return this.levels.slice(0, depth).map((level) => ({
			price: level.price,
			quantity: level.totalQuantity,
			orders: level.orderCount,
		}));
	}

	/** Is price `a` better than price `b` for this side? */
	private isBetter(a: number, b: number): boolean {
		return this.side === "buy" ? a > b : a < b;
	}

	private insertLevel(level: PriceLevel): void {
		const index = this.levels.findIndex((existing) =>
			this.isBetter(level.price, existing.price),
		);
		if (index === -1) {
			this.levels.push(level);
		} else {
			this.levels.splice(index, 0, level);
		}
		this.levelsByPrice.set(level.price, level);
	}
}
