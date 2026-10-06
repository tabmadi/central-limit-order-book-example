import convict from "convict";

export interface ServerConfig {
	port: number;
	bookDepth: number;
	tradeLimit: number;
}

const configSchema = convict<ServerConfig>({
	port: {
		doc: "The port to bind.",
		format: "port",
		default: 3000,
		env: "PORT",
		arg: "port",
	},
	bookDepth: {
		doc: "Price levels per side returned by GET /book when no ?depth= is given.",
		format: "nat",
		default: 10,
		env: "BOOK_DEPTH",
		arg: "book-depth",
	},
	tradeLimit: {
		doc: "Trades returned by GET /trades when no ?limit= is given.",
		format: "nat",
		default: 50,
		env: "TRADE_LIMIT",
		arg: "trade-limit",
	},
});

configSchema.validate({ allowed: "strict" });

export const config = configSchema.getProperties();
