import MarkdownIt from "markdown-it";
import path from "node:path";

const markdown = new MarkdownIt({ html: true });
const normalizeSource = (value) => String(value).replace(/^\/+/, "").replace(/\\/g, "/").replace(/^en\//, "");
const normalizePublic = (value) => `/${String(value).replace(/^\/+/, "").replace(/\\/g, "/")}`;

function mapEntries(routeMap) {
  return Object.entries(routeMap ?? {}).map(([source, destination]) => [
    normalizeSource(source), normalizeSource(destination),
  ]);
}

function publicHtmlPath(source) {
  return `/${normalizeSource(source).replace(/\.md$/i, ".html")}`;
}

function publicPagePath(source) {
  const normalized = normalizeSource(source);
  if (/\/README\.md$/i.test(normalized)) return `/${path.posix.dirname(normalized).replace(/^\.$/, "")}${path.posix.dirname(normalized) === "." ? "" : "/"}`;
  if (/^README\.md$/i.test(normalized)) return "/";
  return publicHtmlPath(normalized);
}

function routeExists(routes, route) {
  if (!routes) return true;
  const values = routes instanceof Set ? routes : new Set(routes);
  const normalized = normalizePublic(route);
  return values.has(normalized) || values.has(normalized.slice(1));
}

export function createRedirects(routeMap, availableRoutes) {
  const redirects = new Map();
  for (const [oldSource, newSource] of mapEntries(routeMap)) {
    const target = /\.md$/i.test(newSource) ? publicPagePath(newSource) : `/${newSource}`;
    if (!routeExists(availableRoutes, target)) continue;
    const oldPath = /\.md$/i.test(oldSource) ? publicPagePath(oldSource) : `/${oldSource}`;
    const oldRoutes = /\/README\.md$/i.test(oldSource)
      ? [oldPath, oldPath.replace(/\/$/, ""), `/${oldSource.replace(/README\.md$/i, "README.html")}`, `/${oldSource}`]
      : /^README\.md$/i.test(oldSource)
        ? ["/", "/README.html", "/README.md"]
        : /\.md$/i.test(oldSource)
          ? [publicHtmlPath(oldSource), publicHtmlPath(oldSource).replace(/\.html$/i, ""), publicHtmlPath(oldSource).replace(/\.html$/i, ".md")]
          : [oldPath];
    for (const from of oldRoutes) {
      redirects.set(from, target);
    }
    const englishTarget = `/en${target}`;
    if (routeExists(availableRoutes, englishTarget)) {
      for (const from of oldRoutes) {
        redirects.set(`/en${from}`, englishTarget);
      }
    }
  }
  return [...redirects].map(([from, to]) => `${from} ${to} 301`).join("\n") + (redirects.size ? "\n" : "");
}

function resolveMappedTarget(rawHref, sourceFile, routeMap) {
  if (!rawHref || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(rawHref)) return null;
  const match = rawHref.match(/^([^?#]*)([?#].*)?$/);
  const pathname = markdown.utils.unescapeAll(match?.[1] ?? "");
  if (!pathname) return null;
  const canonicalSource = normalizeSource(sourceFile);
  const canonicalDestination = routeMap[canonicalSource] ?? canonicalSource;
  const absolute = pathname.startsWith("/");
  const sourceIsEnglish = String(sourceFile).replace(/\\/g, "/").replace(/^\/+/, "").startsWith("en/");
  const localized = absolute && (sourceIsEnglish || /^\/en\//i.test(pathname));
  const withoutLocale = /^\/en\//i.test(pathname) ? pathname.replace(/^\/en\//i, "") : pathname;
  const localPath = absolute ? withoutLocale.replace(/^\/+/, "") : path.posix.join(path.posix.dirname(canonicalSource), withoutLocale);
  const targetSource = normalizeSource(path.posix.normalize(localPath));
  const candidates = [targetSource];
  if (/\.html?$/i.test(targetSource)) candidates.push(targetSource.replace(/\.html?$/i, ".md"));
  if (!/\.[^/]+$/.test(targetSource)) {
    const cleanSource = targetSource.replace(/\/$/, "");
    candidates.push(`${cleanSource}.md`, `${cleanSource}/README.md`);
  }
  const mapped = candidates.map((candidate) => routeMap[candidate]).find(Boolean);
  if (!mapped) return null;
  const targetFrom = normalizeSource(canonicalDestination);
  const normalizedMapped = normalizeSource(mapped);
  const originalClean = !/\.[^/]+$/.test(pathname.replace(/\/$/, ""));
  const mappedPath = /\/README\.md$/i.test(normalizedMapped)
    ? `${path.posix.dirname(normalizedMapped).replace(/^\.$/, "")}/`
    : /^README\.md$/i.test(normalizedMapped) ? "/" : normalizedMapped;
  const routeStylePath = /\.html?$/i.test(pathname) && /\.md$/i.test(normalizedMapped)
    ? mappedPath.replace(/\.md$/i, ".html")
    : originalClean && /\.md$/i.test(mappedPath) ? mappedPath.replace(/\.md$/i, "") : mappedPath;
  const relative = path.posix.relative(path.posix.dirname(targetFrom), normalizedMapped);
  const styledRelative = /\/README\.md$/i.test(normalizedMapped)
    ? `${path.posix.relative(path.posix.dirname(targetFrom), path.posix.dirname(normalizedMapped)) || "."}/`
    : /^README\.md$/i.test(normalizedMapped) ? "./" : /\.html?$/i.test(pathname) && /\.md$/i.test(normalizedMapped)
      ? relative.replace(/\.md$/i, ".html")
      : originalClean && /\.md$/i.test(relative) ? relative.replace(/\.md$/i, "") : relative;
  const replacement = absolute
    ? `${localized ? "/en" : ""}/${routeStylePath.replace(/^\/+/, "")}`
    : pathname.startsWith("./") && !styledRelative.startsWith(".") ? `./${styledRelative}` : styledRelative;
  return `${replacement}${match?.[2] ?? ""}`;
}

function tokenDestinations(tokens, found = []) {
  for (const token of tokens) {
    if (token.type === "link_open" && token.attrGet("href")) found.push(token.attrGet("href"));
    if (token.type === "image" && token.attrGet("src")) found.push(token.attrGet("src"));
    if (token.children) tokenDestinations(token.children, found);
  }
  return found;
}

function maskCode(source, tokens) {
  const masked = source.split("");
  const offsets = [0];
  for (let index = 0; index < source.length; index++) if (source[index] === "\n") offsets.push(index + 1);
  for (const token of tokens) {
    if (!token.map || !["fence", "code_block"].includes(token.type)) continue;
    const start = offsets[token.map[0]] ?? source.length;
    const end = offsets[token.map[1]] ?? source.length;
    for (let index = start; index < end; index++) if (masked[index] !== "\n" && masked[index] !== "\r") masked[index] = " ";
  }
  for (let index = 0; index < masked.length;) {
    if (masked[index] !== "`") { index++; continue; }
    let end = index;
    while (masked[end] === "`") end++;
    const marker = source.slice(index, end);
    let close = end;
    let matched = -1;
    while (close < masked.length) {
      if (masked[close] !== "`") { close++; continue; }
      let runEnd = close;
      while (masked[runEnd] === "`") runEnd++;
      if (source.slice(close, runEnd) === marker) { matched = runEnd; break; }
      close = runEnd;
    }
    if (matched < 0) { index = end; continue; }
    for (let cursor = index; cursor < matched; cursor++) if (masked[cursor] !== "\n" && masked[cursor] !== "\r") masked[cursor] = " ";
    index = matched;
  }
  return masked.join("");
}

function destinationSpans(source, masked) {
  const spans = [];
  const add = (start, end, kind = "inline") => { if (start < end) spans.push({ start, end, kind }); };
  const findLabelOpen = (close) => {
    let depth = 0;
    for (let index = close; index >= 0; index--) {
      if (masked[index] === "\\") { index--; continue; }
      if (masked[index] === "]") depth++;
      else if (masked[index] === "[") {
        if (--depth === 0) return index;
      }
    }
    return -1;
  };
  for (let close = 0; close < masked.length; close++) {
    if (masked[close] !== "]") continue;
    let cursor = close + 1;
    while (/\s/.test(masked[cursor] ?? "")) cursor++;
    if (masked[cursor] !== "(") continue;
    const labelOpen = findLabelOpen(close);
    if (labelOpen < 0) continue;
    cursor++;
    while (/\s/.test(masked[cursor] ?? "")) cursor++;
    if (masked[cursor] === "<") {
      const end = masked.indexOf(">", cursor + 1);
      if (end >= 0) add(cursor + 1, end);
      continue;
    }
    const start = cursor;
    let nesting = 0;
    while (cursor < masked.length) {
      if (masked[cursor] === "\\") { cursor += 2; continue; }
      if (masked[cursor] === "(" ) nesting++;
      else if (masked[cursor] === ")") {
        if (nesting === 0) break;
        nesting--;
      } else if (/\s/.test(masked[cursor])) break;
      cursor++;
    }
    add(start, cursor);
  }
  const lines = source.split(/(?<=\n)/);
  let lineStart = 0;
  for (const line of lines) {
    const definition = line.match(/^\s{0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|((?:\\.|[^\s])+))/);
    if (definition) {
      const captured = definition[1] ?? definition[2];
      const offset = line.indexOf(captured, line.indexOf("]:") + 2);
      add(lineStart + offset, lineStart + offset + captured.length, "reference");
    }
    lineStart += line.length;
  }
  for (const tag of masked.matchAll(/<[A-Za-z][^<>]*>/g)) {
    const tagStart = tag.index;
    for (const attribute of tag[0].matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi)) {
      const valueOffset = attribute.index + attribute[0].indexOf(attribute[2]);
      add(tagStart + valueOffset, tagStart + valueOffset + attribute[2].length, "html");
    }
  }
  return spans;
}

export function rewriteInternalLinks(markdownText, routeMap, sourceFile) {
  const normalizedMap = Object.fromEntries(mapEntries(routeMap));
  const tokens = markdown.parse(markdownText, {});
  const allowed = new Set(tokenDestinations(tokens).map((href) => markdown.normalizeLink(href)));
  const masked = maskCode(markdownText, tokens);
  const spans = destinationSpans(markdownText, masked)
    .sort((left, right) => left.start - right.start);
  const edits = [];
  for (const span of spans) {
    const rawHref = markdownText.slice(span.start, span.end);
    const parsedHref = markdown.normalizeLink(markdown.utils.unescapeAll(rawHref));
    if (span.kind === "inline" && !allowed.has(parsedHref)) continue;
    const replacement = resolveMappedTarget(rawHref, sourceFile, normalizedMap);
    if (replacement && replacement !== rawHref) edits.push({ ...span, replacement });
  }
  let result = markdownText;
  for (const edit of edits.reverse()) result = `${result.slice(0, edit.start)}${edit.replacement}${result.slice(edit.end)}`;
  return result;
}
