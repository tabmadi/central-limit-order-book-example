# Central Limit Order Book (CLOB) by example

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Bun](https://img.shields.io/badge/Bun-1.2-orange.svg)](https://bun.sh/)

A deliberately small, fully tested order book and matching engine in TypeScript. It is the
same idea that runs every stock and crypto exchange, stripped down to a few hundred
heavily commented lines you can read in one sitting and poke at with `curl`.

## What is a central limit order book?

A market has buyers and sellers who disagree on price. An order book is the list of
everyone who is **waiting** to trade, sorted so the best offers are on top:

```text
            ASKS (sellers)                    lowest ask = best price to buy at
      price   quantity  orders
       103       4         1
       102       7         2
       101       5         1   <-- best ask
     ------------------------  spread = 101 - 99 = 2
        99       3         1   <-- best bid
        98      10         3
            BIDS (buyers)                     highest bid = best price to sell at
```

- A **bid** is an offer to buy; an **ask** is an offer to sell.
- The **spread** is the gap between the best ask and the best bid. While it is positive,
  nobody agrees on a price and nothing trades.
- A **limit order** says "buy (or sell) up to this quantity, at this price or better".
  Whatever cannot trade right now **rests** on the book and waits.
- A **market order** says "trade this quantity now, at whatever price is available".
  It never rests: whatever cannot fill is discarded.

"Central" means one shared book that every participant trades against. "Limit" means the
book is built out of limit orders.

### Matching: price-time priority

When a new order arrives, the engine checks whether it **crosses** the other side: a buy
at 102 crosses any ask priced 102 or lower. While it crosses, the engine trades against
the opposite side in a strict order:

1. **Price priority**: best price first (lowest ask for a buyer, highest bid for a seller).
2. **Time priority**: at the same price, whoever arrived first is filled first.

Each trade happens at the price of the order that was **already resting** (the *maker*),
not the incoming one (the *taker*). A buyer willing to pay 102 who meets an ask at 101
pays 101.

### A worked example

Starting from the book above, someone submits **buy 8 @ 102 (limit)**:

| Step | Best ask         | Trade      | Buyer still wants |
|------|------------------|------------|-------------------|
| 1    | 101 × 5          | 5 @ 101    | 3                 |
| 2    | 102 × 7          | 3 @ 102    | 0 → **filled**    |

Within the 102 level, the oldest order fills first. The 101 level is gone and the 102
level shrinks to 4. Had the order been **buy 20 @ 102**, it would have taken all 12 at 101
and 102, stopped at 103 (above its limit), and the remaining 8 would **rest** as the new
best bid at 102. As a **market** order for 20, it would also have taken the 4 at 103 and
then discarded the last 4.

### Why integers?

Prices are in **ticks** (e.g. cents) and quantities in **lots**, both whole numbers. In
floating point `0.1 + 0.2 !== 0.3`, and an exchange cannot afford rounding drift.

## Reading the code

Read in this order; each file builds on the previous one.

| File                                                       | What it teaches                                                       |
|------------------------------------------------------------|-----------------------------------------------------------------------|
| [`src/orderbook/types.ts`](src/orderbook/types.ts)             | The vocabulary: sides, order types, trades, results                   |
| [`src/orderbook/price-level.ts`](src/orderbook/price-level.ts) | A FIFO queue at one price: **time priority**                          |
| [`src/orderbook/book-side.ts`](src/orderbook/book-side.ts)     | Levels sorted best-first: **price priority**                          |
| [`src/orderbook/order-book.ts`](src/orderbook/order-book.ts)   | **The matching engine**: `submit`, `match`, `cancel`, `snapshot`      |
| [`src/orderbook/validation.ts`](src/orderbook/validation.ts)   | Checking untrusted input at the edge, so the engine can trust its own |
| [`src/server.ts`](src/server.ts)                               | A thin HTTP adapter with no trading logic                             |

The tests in [`src/__tests__/`](src/__tests__) double as executable examples:
[`order-book.test.ts`](src/__tests__/order-book.test.ts) walks through resting, partial
fills, sweeping levels, priority, market orders, and cancels.

## Running it

You need [mise](https://mise.jdx.dev). It installs Bun and every other tool at the versions
pinned in [`.mise.toml`](.mise.toml).

```bash
mise trust && mise install   # the pinned tools
mise run setup               # dependencies and git hooks
mise run dev                 # http://localhost:3000, reloads on change
```

### Try it with curl

```bash
# Build an ask side
curl -s -XPOST localhost:3000/orders -d '{"type":"limit","side":"sell","price":101,"quantity":5}'
curl -s -XPOST localhost:3000/orders -d '{"type":"limit","side":"sell","price":102,"quantity":7}'

# And a bid
curl -s -XPOST localhost:3000/orders -d '{"type":"limit","side":"buy","price":99,"quantity":3}'

# Look at the book: spread is 2
curl -s localhost:3000/book

# Cross the spread: fills 5 @ 101 and 3 @ 102
curl -s -XPOST localhost:3000/orders -d '{"type":"limit","side":"buy","price":102,"quantity":8}'

# A market sell hits the best bid
curl -s -XPOST localhost:3000/orders -d '{"type":"market","side":"sell","quantity":1}'

# What traded, and cancel the rest of order 3 (the bid at 99)
curl -s localhost:3000/trades
curl -s -XDELETE localhost:3000/orders/3
```

### HTTP API

| Method   | Path                | Body / query                                    | Response                                                                    |
|----------|---------------------|-------------------------------------------------|-----------------------------------------------------------------------------|
| `POST`   | `/orders`           | `{ type, side, price?, quantity }`              | `201` with status, filled / resting / cancelled quantities and trades; `400` with a reason |
| `DELETE` | `/orders/:id`       |                                                 | `200` with the cancelled order; `404` if it is not resting                  |
| `GET`    | `/book`             | `?depth=N` (default `BOOK_DEPTH`, 10)           | `{ bids, asks, spread }`, best levels first                                 |
| `GET`    | `/trades`           | `?limit=N` (default `TRADE_LIMIT`, 50)          | The most recent trades, oldest first                                        |
| `GET`    | `/health`           |                                                 | Liveness check                                                              |

`type` is `"limit"` or `"market"`, `side` is `"buy"` or `"sell"`, `price` (limit orders
only) and `quantity` are positive integers. Configuration lives in
[`src/config.ts`](src/config.ts); see [`.env.example`](.env.example).

## What is deliberately missing

Real exchanges add much more. Each of these is a good exercise:

- **Time-in-force**: IOC (fill what you can now, cancel the rest) and FOK (fill everything
  now or nothing) are small changes to `submit`.
- **Faster levels**: replace the sorted array in `book-side.ts` with a balanced tree or
  heap, and the `findIndex` in `price-level.ts` with a linked list for O(1) cancels.
- **Self-trade prevention**: stop a trader's buy from matching their own sell.
- **Multiple symbols**: one `OrderBook` per instrument, routed by `/books/:symbol`.
- **Accounts and balances**: reject orders a trader cannot pay for.
- **Market data feed**: push trades and book updates over WebSocket.
- **Persistence and recovery**: append every order to a log and replay it on start.
- **Stop and iceberg orders**, order amendment, fees.

## Development

| Task              | Description                                          |
|-------------------|------------------------------------------------------|
| `mise run dev`    | Start the server with file watching                  |
| `mise run start`  | Start the server                                     |
| `mise run test`   | Run the tests                                        |
| `mise run lint`   | Biome (warnings fail), `tsc --noEmit`, and gitleaks  |
| `mise run format` | Apply Biome's fixes                                  |
| `mise run check`  | Lint and test: run it before you finish a change     |

`mise tasks` lists every task; the `package.json` scripts delegate to them. Git hooks
([Lefthook](https://github.com/evilmartians/lefthook)) fix, type-check, test, and scan staged
files for secrets on commit, enforce [Conventional Commits](https://www.conventionalcommits.org/)
with [Cocogitto](https://github.com/cocogitto/cocogitto), and run `mise run ci` on push, the
same gate as the GitHub workflow.

## License

Apache 2.0. See [LICENSE](LICENSE).
