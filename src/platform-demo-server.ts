import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createPlatformHttpApp } from "./platform/http.js";

const app = new Hono();
const publicFile = (name: string) => readFileSync(join(process.cwd(), "public", name), "utf8");

app.get("/", (c) => c.redirect("/platform"));
app.get("/platform", (c) => c.html(publicFile("platform.html")));
app.get("/platform.css", (c) => c.body(publicFile("platform.css"), 200, { "content-type": "text/css; charset=utf-8" }));
app.get("/platform.js", (c) => c.body(publicFile("platform.js"), 200, { "content-type": "text/javascript; charset=utf-8" }));
app.route("/api/platform", createPlatformHttpApp());

const port = Number(process.env.PLATFORM_PORT ?? 4222);
serve({ fetch: app.fetch, port }, ({ port: listeningPort }) => {
  console.log(`RescueOps synthetic platform demo: http://localhost:${listeningPort}/platform`);
  console.log("No live provider actions or production tenant security are enabled.");
});
