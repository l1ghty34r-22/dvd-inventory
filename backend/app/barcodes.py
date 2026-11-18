"""Turn a DVD barcode (UPC / EAN) into a title we can search TMDB with."""

import re
from typing import Any

import httpx

from app.config import settings

TRIAL_URL = "https://api.upcitemdb.com/prod/trial/lookup"
PAID_URL = "https://api.upcitemdb.com/prod/v1/lookup"


class BarcodeError(Exception):
    """The barcode lookup service could not be reached or refused the request."""


class BarcodeRateLimitedError(BarcodeError):
    """The lookup service's daily limit has been used up."""


def _check_digit_ok(digits: str) -> bool:
    # GS1 check digit: weights 3,1,3,1... from the right, starting at the digit before the check.
    body, check = digits[:-1], int(digits[-1])
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def normalize(code: str) -> str:
    """Return the barcode as EAN-8 or EAN-13 digits, or raise ValueError.

    UPC-A (12 digits) becomes EAN-13 with a leading zero, so a disc scanned as UPC-A and the
    same disc scanned as EAN-13 are stored the same way.
    """
    digits = re.sub(r"[\s-]", "", code)
    if not digits.isdigit():
        raise ValueError("A barcode is made of digits only")
    if len(digits) == 14 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 12:
        digits = "0" + digits
    if len(digits) not in (8, 13):
        raise ValueError("A barcode has 8, 12 or 13 digits")
    if not _check_digit_ok(digits):
        raise ValueError("That barcode's check digit is wrong. Check for a typo.")
    return digits


# Words that describe the disc rather than the film or show.
_NOISE = re.compile(
    r"""\b(
        dvd | blu[\s-]?ray | bluray | 4k | ultra\s+hd | uhd | hd\s+dvd | digital\s+copy |
        wide\s*screen | full\s*screen | ntsc | pal | region\s*\d | multi[\s-]?region |
        \d+[\s-]?(disc|disk)s?(\s+set)? | box\s*set | steelbook | slipcover |
        (special|collector'?s|limited|deluxe|anniversary|ultimate|definitive|platinum|
         extended|unrated|theatrical|criterion)(\s+\w+)?\s+(edition|cut|collection) |
        director'?s\s+cut | edition
    )\b""",
    re.IGNORECASE | re.VERBOSE,
)
# "Friends: The Complete First Season" -> "Friends", "Lost Season 2" -> "Lost".
# Only cut where a season number or "complete" makes it clear, so a title like
# "A Series of Unfortunate Events" survives.
_ORDINAL = (
    r"(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|final|\d+(st|nd|rd|th))"
)
_NUMBER = r"(\d+|one|two|three|four|five|six|seven|eight|nine|ten)"
_SEASON = re.compile(
    rf"""[\s:,\-–]*(the\s+)?(
        complete\s+((\w+\s+)?(season|series)s?|collection|box) |
        {_ORDINAL}\s+seasons? |
        (seasons?|series)\s+{_NUMBER}
    )\b.*$""",
    re.IGNORECASE | re.VERBOSE,
)


def clean_title(product_title: str) -> str:
    """Strip packaging words from a shop's product name, leaving something TMDB can find."""
    title = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", product_title)
    title = _SEASON.sub("", title)
    title = _NOISE.sub(" ", title)
    title = re.sub(r"\s+", " ", title).strip(" -–:,/|+&")
    return title or product_title.strip()


def lookup_product_title(barcode: str) -> str | None:
    """Ask UPCitemdb what product has this barcode. Returns None when it does not know."""
    if settings.upcitemdb_user_key:
        url = PAID_URL
        headers = {"user_key": settings.upcitemdb_user_key, "key_type": "3scale"}
    else:
        url, headers = TRIAL_URL, {}
    try:
        response = httpx.get(url, params={"upc": barcode}, headers=headers, timeout=10)
    except httpx.HTTPError as exc:
        raise BarcodeError("The barcode database could not be reached.") from exc

    if response.status_code == 429:
        try:
            reason = response.json().get("code")
        except ValueError:
            reason = None
        if reason == "TOO_FAST":
            raise BarcodeRateLimitedError("The barcode database is busy. Try again in a minute.")
        raise BarcodeRateLimitedError("The barcode database's daily limit has been reached.")
    if response.status_code in (400, 404):
        return None  # Unknown or invalid code.
    if response.is_error:
        raise BarcodeError("Barcode lookup failed")

    try:
        items = response.json().get("items") or []
    except ValueError as exc:
        raise BarcodeError("Barcode lookup failed") from exc
    title = (items[0].get("title") or "").strip() if items else ""
    return title or None


_YEAR = re.compile(r"\b(19[0-9]{2}|20[0-9]{2})\b")


def looks_like_tv(product_title: str) -> bool:
    return bool(_SEASON.search(product_title))


def _simplify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def pick_best(product_title: str, title_guess: str, results: list[Any]) -> Any | None:
    """Pick the search result most likely to be the product on the disc.

    `results` are TMDB search results in relevance order (anything with title, year and
    media_type). An exact title beats a partial one; a year near the one printed on the product
    helps (DVD releases trail the film by a year or so); a "season" in the name means TV.
    """
    if not results:
        return None
    wanted = _simplify(title_guess)
    years = [int(y) for y in _YEAR.findall(product_title)]
    tv_hint = looks_like_tv(product_title)

    def score(pair: tuple[int, Any]) -> float:
        index, result = pair
        name = _simplify(result.title)
        points = -0.2 * index  # Keep TMDB's own relevance order as the tie-breaker.
        if name == wanted:
            points += 3
        elif name.startswith(wanted) or wanted.startswith(name):
            points += 1
        if years and result.year and any(0 <= y - result.year <= 2 for y in years):
            points += 1.5
        if tv_hint == (result.media_type == "tv"):
            points += 1
        return points

    return max(enumerate(results), key=score)[1]


def guess_format(product_title: str) -> str | None:
    """Read the disc format from a shop's product name, or None when it does not say."""
    name = product_title.lower()
    if re.search(r"\b(4k|uhd|ultra\s*hd)\b", name):
        return "uhd"
    if re.search(r"blu[\s-]?ray", name):
        return "bluray"
    if re.search(r"\bdvd\b", name):
        return "dvd"
    return None
