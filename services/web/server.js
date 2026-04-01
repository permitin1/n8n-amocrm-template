const Fastify = require("fastify");
const path = require("path");
const view = require("@fastify/view");
const ejs = require("ejs");

const app = Fastify({ logger: true });

app.register(view, {
  engine: { ejs },
  root: path.join(__dirname, "templates"),
});

// Health check
app.get("/health", async () => ({ status: "ok", version: "1.0.0" }));

// Routes
const routes = require("./routes");
routes.forEach((r) => app.register(r));

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

app.listen({ port: PORT, host: HOST }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
