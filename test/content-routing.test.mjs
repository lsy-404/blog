import test from "node:test";
import assert from "node:assert/strict";
import { createRedirects, rewriteInternalLinks } from "../scripts/content-routing.mjs";

const routes = {
  "articles/main.md": "t/main.md",
  "daliy/day.md": "d/day.md",
  "articles/res/diagram.png": "t/res/diagram.png",
  "daliy/rosmontis_heizi.md": "f/rosmontis_heizi.md",
  "daliy/rosmontis/art.webp": "f/rosmontis/art.webp",
  "articles/guide/README.md": "t/guide/README.md",
};

test("redirects legacy html, clean, markdown, and eligible English routes only", () => {
  const output = createRedirects(routes, new Set([
    "/t/main.html", "t/main.html", "/d/day.html", "/f/rosmontis_heizi.html",
    "/en/t/main.html", "/t/res/diagram.png",
  ]));
  assert.match(output, /^\/articles\/main\.html \/t\/main\.html 301$/m);
  assert.match(output, /^\/articles\/main \/t\/main\.html 301$/m);
  assert.match(output, /^\/articles\/main\.md \/t\/main\.html 301$/m);
  assert.match(output, /^\/en\/articles\/main\.html \/en\/t\/main\.html 301$/m);
  assert.match(output, /^\/articles\/res\/diagram\.png \/t\/res\/diagram\.png 301$/m);
  assert.doesNotMatch(output, /\/en\/daliy\/day/);
  assert.doesNotMatch(output, /\*/);
});

test("rewrites Markdown links, images, HTML attributes, and relocated assets", () => {
  const input = [
    "[daily](../daliy/day.md?view=1#part)",
    "![diagram](res/diagram.png)",
    "![fan art](../daliy/rosmontis/art.webp)",
    '<a href="../daliy/day.md">daily</a>',
    "[absolute](/articles/main.md)",
  ].join("\n");
  const output = rewriteInternalLinks(input, routes, "articles/main.md");
  assert.equal(output, [
    "[daily](../d/day.md?view=1#part)",
    "![diagram](res/diagram.png)",
    "![fan art](../f/rosmontis/art.webp)",
    '<a href="../d/day.md">daily</a>',
    "[absolute](/t/main.md)",
  ].join("\n"));
});

test("does not rewrite matching text inside inline or fenced code", () => {
  const input = [
    "[daily](../daliy/day.md)",
    "`[code](../daliy/day.md)`",
    "`inline code spanning\n[another](../daliy/day.md)`",
    "```md",
    "[example](../daliy/day.md)",
    "```",
  ].join("\n");
  const expected = [
    "[daily](../d/day.md)",
    "`[code](../daliy/day.md)`",
    "`inline code spanning\n[another](../daliy/day.md)`",
    "```md",
    "[example](../daliy/day.md)",
    "```",
  ].join("\n");
  assert.equal(rewriteInternalLinks(input, routes, "articles/main.md"), expected);
});

test("leaves external and unmapped links alone and resolves English mirror links", () => {
  const input = ["[external](https://example.com/articles/main.md)", "[missing](../daliy/missing.md)"].join("\n");
  assert.equal(rewriteInternalLinks(input, routes, "articles/main.md"), input);
  assert.equal(rewriteInternalLinks("[daily](../daliy/day.md)", routes, "en/t/main.md"), "[daily](../d/day.md)");
});

test("rewrites only destination spans when the same legacy path appears elsewhere", () => {
  const input = [
    "[local](/articles/main.md)",
    "[external](https://example.com/articles/main.md)",
    "Prose /articles/main.md",
    "",
    "    [indented code](/articles/main.md)",
    "&lt;a href=\"/articles/main.md\"&gt;escaped markup&lt;/a&gt;",
  ].join("\n");
  const output = [
    "[local](/t/main.md)",
    "[external](https://example.com/articles/main.md)",
    "Prose /articles/main.md",
    "",
    "    [indented code](/articles/main.md)",
    "&lt;a href=\"/articles/main.md\"&gt;escaped markup&lt;/a&gt;",
  ].join("\n");
  assert.equal(rewriteInternalLinks(input, routes, "articles/main.md"), output);
});

test("handles legacy html and clean links, reference definitions, and directory README routes", () => {
  const input = [
    "[html](../daliy/day.html)",
    "[clean](../daliy/day)",
    "[slash clean](../daliy/day/)",
    "[guide](guide)",
    "[reference][daily]",
    "[daily]: ../daliy/day.html",
    '<a href="../daliy/day.html?x=1&amp;y=2">daily</a>',
  ].join("\n");
  const output = [
    "[html](../d/day.html)",
    "[clean](../d/day)",
    "[slash clean](../d/day)",
    "[guide](guide/)",
    "[reference][daily]",
    "[daily]: ../d/day.html",
    '<a href="../d/day.html?x=1&amp;y=2">daily</a>',
  ].join("\n");
  assert.equal(rewriteInternalLinks(input, routes, "articles/main.md"), output);
});

test("redirects a README page to its directory URL", () => {
  const output = createRedirects({ "articles/guide/README.md": "t/guide/README.md" }, ["/t/guide/"]);
  assert.match(output, /^\/articles\/guide\/ \/t\/guide\/ 301$/m);
  assert.match(output, /^\/articles\/guide \/t\/guide\/ 301$/m);
});

test("rewrites absolute English legacy links to English destinations", () => {
  assert.equal(
    rewriteInternalLinks("[English](/en/articles/main.html)", routes, "en/articles/main.md"),
    "[English](/en/t/main.html)",
  );
  assert.equal(
    rewriteInternalLinks("[English](/articles/main.md)", routes, "en/articles/main.md"),
    "[English](/en/t/main.md)",
  );
});
