from urllib.parse import quote_plus


def create_youtube_search_url(search_terms: str) -> str:
    query = quote_plus(search_terms.strip())
    return f"https://www.youtube.com/results?search_query={query}"
