import argparse
import json
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

FIRST_PARTY_DOMAIN = "leisiyu.dev"
TINY_PROJECTS_URL = "https://tiny.leisiyu.dev/"


def frontmatter(paths):
    helper = Path(__file__).with_name("read-frontmatter.mjs")
    files = [{"id": str(path.resolve()), "path": str(path.resolve())} for path in paths]
    result = subprocess.run(
        ["node", str(helper)],
        input=json.dumps(files),
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=True,
    )
    parsed = json.loads(result.stdout)
    return {
        filename: {key.lower(): value for key, value in metadata.items()}
        for filename, metadata in parsed.items()
    }


def flag(values, name, default=False):
    value = values.get(name)
    if name not in values:
        return default
    if not isinstance(value, bool):
        raise AssertionError(f"Frontmatter {name} must be a YAML boolean")
    return value


def visible_markdown(root):
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() != ".md":
            continue
        relative = path.relative_to(root)
        if any(part.startswith((".", "_")) for part in relative.parts):
            continue
        yield path, relative.as_posix()


def staged_path(relative, routes):
    english = relative.startswith("en/")
    canonical = relative[3:] if english else relative
    canonical = routes.get(canonical, canonical)
    return f"en/{canonical}" if english else canonical


def public_route(staged):
    prefix = "/en" if staged.startswith("en/") else ""
    canonical = staged[3:] if prefix else staged
    if canonical == "README.md":
        route = "/"
    elif canonical.lower().endswith("/readme.md"):
        route = f"/{canonical.rsplit('/', 1)[0]}/"
    else:
        route = f"/{canonical[:-3]}.html"
    return f"{prefix}{route}"


def route_file(dist, route):
    parsed = urlsplit(route)
    if parsed.scheme or parsed.netloc:
        return None
    relative = unquote(parsed.path).lstrip("/")
    candidate = (dist / relative).resolve()
    try:
        candidate.relative_to(dist.resolve())
    except ValueError:
        return None
    if candidate.is_dir() or parsed.path.endswith("/"):
        candidate = candidate / "index.html"
    if candidate.is_file():
        return candidate
    if not Path(relative).suffix and candidate.with_suffix(".html").is_file():
        return candidate.with_suffix(".html")
    return None


def is_first_party_https(href):
    try:
        parsed = urlsplit(href)
        hostname = parsed.hostname
        parsed.port
    except ValueError:
        return False
    if not parsed.scheme and not parsed.netloc:
        return True
    hostname = hostname.lower() if hostname else ""
    return (
        parsed.scheme == "https"
        and parsed.username is None
        and parsed.password is None
        and (hostname == FIRST_PARTY_DOMAIN or hostname.endswith(f".{FIRST_PARTY_DOMAIN}"))
    )


def is_safe_https(href):
    if not href or any(character.isspace() or ord(character) < 32 for character in href):
        return False
    try:
        parsed = urlsplit(href)
        hostname = parsed.hostname
        parsed.port
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and bool(parsed.netloc)
        and bool(hostname)
        and parsed.username is None
        and parsed.password is None
    )


class AnchorScanner(HTMLParser):
    def __init__(self, filename):
        super().__init__(convert_charrefs=True)
        self.filename = filename
        self.external = []
        self.nav_depth = 0
        self.article_depth = 0
        self.navigation_links = set()

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        attributes = dict(attrs)
        if tag == "nav":
            self.nav_depth += 1
        if tag == "div":
            if self.article_depth:
                self.article_depth += 1
            elif "vp-content" in attributes:
                self.article_depth = 1
        if tag != "a":
            return
        href = attributes.get("href", "").strip()
        if href == TINY_PROJECTS_URL and self.nav_depth:
            self.navigation_links.add(href)
        if not is_first_party_https(href) and not (
            self.article_depth and is_safe_https(href)
        ):
            self.external.append((self.filename, self.getpos()[0], href))

    def handle_endtag(self, tag):
        if tag.lower() == "nav":
            self.nav_depth = max(0, self.nav_depth - 1)
        if tag.lower() == "div" and self.article_depth:
            self.article_depth -= 1

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)


def inspect(args):
    docs = args.docs.resolve()
    prepared = args.prepared.resolve()
    dist = args.dist.resolve()
    routes_path = docs / ".vuepress" / "content-routes.json"
    routes = json.loads(routes_path.read_text(encoding="utf-8")) if routes_path.is_file() else {}

    html_files = list(dist.rglob("*.html"))
    if not html_files:
        raise AssertionError(f"No built HTML files found under {dist}")
    external = []
    nav_links_by_page = {}
    for filename in html_files:
        relative = filename.relative_to(dist).as_posix()
        scanner = AnchorScanner(relative)
        scanner.feed(filename.read_text(encoding="utf-8"))
        external.extend(scanner.external)
        nav_links_by_page[relative] = scanner.navigation_links
    if external:
        raise AssertionError(f"Built site contains offsite anchors: {external[:10]}")
    for homepage in ("index.html", "en/index.html"):
        if TINY_PROJECTS_URL not in nav_links_by_page.get(homepage, set()):
            raise AssertionError(f"Missing Tiny Projects navigation link on {homepage}: {TINY_PROJECTS_URL}")

    redirects_file = dist / "_redirects"
    if not redirects_file.is_file():
        raise AssertionError("Built site is missing Cloudflare _redirects")
    redirects = []
    for number, line in enumerate(redirects_file.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        fields = line.split()
        if len(fields) != 3:
            raise AssertionError(f"Invalid _redirects line {number}: {line}")
        source, target, status = fields
        if status not in {"301", "302", "303", "307", "308"}:
            raise AssertionError(f"Invalid redirect status on line {number}: {status}")
        if route_file(dist, target) is None:
            raise AssertionError(f"Redirect target does not exist: {source} -> {target}")
        redirects.append((source, target, status))
    if not redirects:
        raise AssertionError("Built site has no redirects")
    redirect_set = set(redirects)
    for old_source, new_source in routes.items():
        old_route = public_route(old_source) if old_source.lower().endswith(".md") else f"/{old_source.lstrip('/')}"
        new_route = public_route(new_source) if new_source.lower().endswith(".md") else f"/{new_source.lstrip('/')}"
        if route_file(dist, new_route) is not None and (old_route, new_route, "301") not in redirect_set:
            raise AssertionError(f"Missing legacy redirect: {old_route} -> {new_route}")

    manifest_path = prepared / ".vuepress" / "translation-manifest.json"
    if not manifest_path.is_file():
        raise AssertionError(f"Missing prepared translation manifest: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    pages = manifest.get("pages")
    if not isinstance(pages, dict):
        raise AssertionError("Prepared translation manifest has no pages map")

    source_pages = list(visible_markdown(docs))
    prepared_pages = [(prepared / staged, staged) for staged in pages]
    metadata_by_path = frontmatter(
        [path for path, _ in source_pages] + [path for path, _ in prepared_pages]
    )
    draft_pages = []
    eligible_sources = {}
    for path, relative in source_pages:
        metadata = metadata_by_path[str(path.resolve())]
        lang = metadata.get("lang", "en-US" if relative.startswith("en/") else "zh-CN")
        if lang not in ("zh-CN", "en-US"):
            continue
        staged = staged_path(relative, routes)
        logical = staged[3:] if staged.startswith("en/") else staged
        if flag(metadata, "is_draft"):
            draft_pages.append((relative, staged, logical, lang))
        else:
            eligible_sources.setdefault(logical, {})[lang] = {
                "metadata": metadata,
                "staged": staged,
                "lang": lang,
                "translation_enabled": flag(metadata, "is_translate", True)
                and not any(flag(metadata, key) for key in ("private", "encrypted", "encrypt"))
                and not metadata.get("password"),
            }

    def check_manifest_keys(value, path="manifest"):
        if isinstance(value, dict):
            for key, item in value.items():
                if key.lower().startswith("is_"):
                    raise AssertionError(f"Custom frontmatter key leaked into {path}: {key}")
                check_manifest_keys(item, f"{path}.{key}")
        elif isinstance(value, list):
            for index, item in enumerate(value):
                check_manifest_keys(item, f"{path}[{index}]")

    check_manifest_keys(manifest)
    for prepared_page, staged in prepared_pages:
        if not prepared_page.is_file():
            raise AssertionError(f"Manifest page was not prepared: {staged}")
        for key in metadata_by_path[str(prepared_page.resolve())]:
            if key.startswith("is_"):
                raise AssertionError(f"Custom frontmatter key leaked into prepared page: {staged} ({key})")

    for relative, staged, logical, lang in draft_pages:
        counterpart_lang = "en-US" if lang == "zh-CN" else "zh-CN"
        counterpart = eligible_sources.get(logical, {}).get(counterpart_lang)
        if counterpart and not counterpart["translation_enabled"]:
            counterpart = None
        draft_route = public_route(staged)
        route_present = route_file(dist, draft_route) is not None
        manifest_entry = pages.get(staged)
        if counterpart:
            valid_generated_counterpart = (
                isinstance(manifest_entry, dict)
                and manifest_entry.get("lang") == lang
                and manifest_entry.get("translationSource") == counterpart_lang
            )
            if route_present and valid_generated_counterpart:
                continue
        if route_present or manifest_entry is not None:
            raise AssertionError(f"Draft source participated in output: {relative} -> {draft_route}")

    print(
        f"Verified {len(html_files)} HTML files, {len(redirects)} existing redirect targets, "
        f"{len(draft_pages)} draft sources excluded, and prepared frontmatter/manifest controls stripped."
    )


def main():
    parser = argparse.ArgumentParser(description="Verify generated static blog output before publish.")
    parser.add_argument("--docs", type=Path, default=Path("docs"))
    parser.add_argument("--prepared", type=Path, default=Path(".prepared"))
    parser.add_argument("--dist", type=Path, default=Path("docs/.vuepress/dist"))
    try:
        inspect(parser.parse_args())
    except (AssertionError, OSError, json.JSONDecodeError) as error:
        print(f"Publish verification failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
