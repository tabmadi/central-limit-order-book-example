import type { RestingOrder } from "./types.ts";

/**
 * Every resting order at one price, in arrival order.
 *
 * The queue is what gives "time priority": at the same price, whoever arrived
 * first sits at the front and is filled first.
 */
export class PriceLevel {
	readonly price: number;
	private readonly queue: RestingOrder[] = [];
	private total = 0;

	constructor(price: number) {
		this.price = price;
	}

	/** Sum of the remaining quantity of every order at this price. */
	get totalQuantity(): number {
		return this.total;
	}

	get orderCount(): number {
		return this.queue.length;
	}

	get isEmpty(): boolean {
		return this.queue.length === 0;
	}

	/** Joins the back of the queue. */
	enqueue(order: RestingOrder): void {
		this.queue.push(order);
		this.total += order.remaining;
	}

	/** The order that will be filled next, if any. */
	peek(): RestingOrder | undefined {
		return this.queue[0];
	}

	/**
	 * Fills `quantity` from the order at the front of the queue and returns
	 * it. A fully filled order leaves the queue.
	 */
	fillFront(quantity: number): RestingOrder {
		const front = this.queue[0];
		if (front === undefined) {
			throw new Error(`price level ${this.price} is empty`);
		}
		if (quantity <= 0 || quantity > front.remaining) {
			throw new Error(
				`cannot fill ${quantity} from order ${front.id} with ${front.remaining} remaining`,
			);
		}

		front.remaining -= quantity;
		this.total -= quantity;
		if (front.remaining === 0) {
			this.queue.shift();
		}
		return front;
	}

	/** Takes an order out of the queue wherever it is (a cancel). */
	remove(orderId: number): RestingOrder | undefined {
		const index = this.queue.findIndex((order) => order.id === orderId);
		if (index === -1) {
			return undefined;
		}

		const [removed] = this.queue.splice(index, 1);
		if (removed !== undefined) {
			this.total -= removed.remaining;
		}
		return removed;
	}
}
