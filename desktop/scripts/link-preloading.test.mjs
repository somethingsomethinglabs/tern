import assert from "node:assert/strict";
import { test } from "node:test";
import { linkPrefetchCandidate } from "../host/link-preloading.cjs";

const base = "https://shop.example/catalogue";
test("eligible navigation stays on its exact URL; external pages get connections only", () => {
  assert.deepEqual(linkPrefetchCandidate("/camping/tent.html", base), {
    url: "https://shop.example/camping/tent.html", origin: "https://shop.example", sameOrigin: true,
  });
  assert.equal(linkPrefetchCandidate("https://docs.example/guide", base).sameOrigin, false);
});
test("action URLs, queries, downloads, fragments and malformed addresses are excluded", () => {
  for (const href of [
    "javascript:alert(1)", "mailto:a@example.com", "https://user:pass@shop.example/foo",
    "/catalogue", "/catalogue#details", "/product?add-to-cart=1", "/product?utm_source=menu",
    "/account/profile", "/LogOut", "/%6Cogout", "/wp-login.php", "/cart/add/item",
    "/confirm/payment", "/api/products", "/downloads/model", "/model.3mf", "/file.zip",
    "/receipt.pdf", "/broken%XX", "https://[",
  ]) assert.equal(linkPrefetchCandidate(href, base), null, href);
});
