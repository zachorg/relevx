/**
 * Brave Search API service
 *
 * Handles web search via Brave Search API with:
 * - Rate limiting (1 request per second)
 * - Query filtering and parameter support
 * - Result deduplication
 * - Error handling and retries
 */

// Brave Search API client
let braveApiKey: string | null = null;
const BRAVE_SEARCH_API_URL = "https://api.search.brave.com/res/v1/web/search";

// Rate limiting state
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2500; // 2.5 seconds between requests

/**
 * Initialize Brave Search API
 */
export function initializeBraveSearch(apiKey: string): void {
  braveApiKey = apiKey;
}

/**
 * Get the API key
 */
function getApiKey(): string {
  if (!braveApiKey) {
    throw new Error(
      "Brave Search API key not initialized. Call initializeBraveSearch() first."
    );
  }
  return braveApiKey;
}

/**
 * Rate limiting delay
 */
async function applyRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastRequestTime = Date.now();
}

/**
 * Search filters for customizing queries
 */
export interface SearchFilters {
  // Date filtering
  dateFrom?: string; // ISO date string (YYYY-MM-DD)
  dateTo?: string; // ISO date string (YYYY-MM-DD)

  // Location/language
  country?: string; // ISO 3166-1 alpha-2 country code (e.g., "US", "GB")
  language?: string; // ISO 639-1 language code (e.g., "en", "es")

  // Result configuration
  count?: number; // Number of results to return (default: 20, max: 20)
  offset?: number; // Pagination offset

  // Content filtering
  safesearch?: "off" | "moderate" | "strict"; // Safe search level

  // Site filtering (applied to query string)
  includeDomains?: string[]; // Domains to prioritize
  excludeDomains?: string[]; // Domains to exclude
}

/**
 * Single search result from Brave
 */
export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  published_date?: string; // ISO date string
  thumbnail?: {
    src: string;
    alt?: string;
  };
  language?: string;
  meta_url?: {
    hostname: string;
    path: string;
  };
}

/**
 * Brave Search API response
 */
export interface BraveSearchResponse {
  query: string;
  results: BraveSearchResult[];
  totalResults: number;
}

/**
 * Normalize URL for deduplication
 * Removes query params, fragments, trailing slashes, and www prefix
 */
export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // Remove www prefix
    let hostname = urlObj.hostname.toLowerCase();
    if (hostname.startsWith("www.")) {
      hostname = hostname.substring(4);
    }

    // Remove trailing slash from pathname
    let pathname = urlObj.pathname;
    if (pathname.endsWith("/") && pathname.length > 1) {
      pathname = pathname.slice(0, -1);
    }

    // Reconstruct without query params and hash
    return `${urlObj.protocol}//${hostname}${pathname}`;
  } catch (error) {
    // If URL parsing fails, return original URL
    return url.toLowerCase();
  }
}

/**
 * Build query string with site filters
 */
function buildQueryWithFilters(query: string, filters?: SearchFilters): string {
  let modifiedQuery = query;

  // Add site: operators for included domains
  if (filters?.includeDomains && filters.includeDomains.length > 0) {
    const siteFilters = filters.includeDomains
      .map((domain) => `site:${domain}`)
      .join(" OR ");
    modifiedQuery = `${modifiedQuery} (${siteFilters})`;
  }

  // Add -site: operators for excluded domains
  if (filters?.excludeDomains && filters.excludeDomains.length > 0) {
    const excludeFilters = filters.excludeDomains
      .map((domain) => `-site:${domain}`)
      .join(" ");
    modifiedQuery = `${modifiedQuery} ${excludeFilters}`;
  }

  return modifiedQuery.trim();
}

/**
 * Search the web using Brave Search API
 */
export async function searchWeb(
  query: string,
  filters?: SearchFilters
): Promise<BraveSearchResponse> {
  const apiKey = getApiKey();

  // Apply rate limiting
  await applyRateLimit();

  // Build query with site filters
  const modifiedQuery = buildQueryWithFilters(query, filters);

  // Build URL parameters
  const params = new URLSearchParams({
    q: modifiedQuery,
    count: (filters?.count || 20).toString(),
  });

  if (filters?.offset) {
    params.append("offset", filters.offset.toString());
  }

  if (filters?.country) {
    params.append("country", filters.country);
  }

  if (filters?.language) {
    params.append("search_lang", filters.language);
  }

  if (filters?.safesearch) {
    params.append("safesearch", filters.safesearch);
  }

  // Add date filters using freshness parameter
  if (filters?.dateFrom || filters?.dateTo) {
    // Brave uses "freshness" parameter with values like "pd" (past day), "pw" (past week), etc.
    // For custom date ranges, we'll calculate relative time
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      const now = new Date();
      const daysDiff = Math.floor(
        (now.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff <= 1) {
        params.append("freshness", "pd"); // Past day
      } else if (daysDiff <= 7) {
        params.append("freshness", "pw"); // Past week
      } else if (daysDiff <= 30) {
        params.append("freshness", "pm"); // Past month
      } else if (daysDiff <= 365) {
        params.append("freshness", "py"); // Past year
      }
    }
  }

  const url = `${BRAVE_SEARCH_API_URL}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Brave Search API error (${response.status}): ${errorText}`
      );
    }

    const data: any = await response.json();

    // Extract web results
    const webResults = data.web?.results || [];

    return {
      query: modifiedQuery,
      results: webResults.map((result: any) => ({
        title: result.title || "",
        url: result.url || "",
        description: result.description || "",
        published_date: result.age,
        thumbnail: result.thumbnail
          ? {
              src: result.thumbnail.src,
              alt: result.thumbnail.alt,
            }
          : undefined,
        language: result.language,
        meta_url: result.meta_url,
      })),
      totalResults: webResults.length,
    };
  } catch (error) {
    console.error("Error searching with Brave:", error);
    throw error;
  }
}

/**
 * Search with retry logic
 */
export async function searchWithRetry(
  query: string,
  filters?: SearchFilters,
  maxRetries: number = 3
): Promise<BraveSearchResponse> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await searchWeb(query, filters);
    } catch (error) {
      lastError = error as Error;
      console.warn(
        `Search attempt ${attempt}/${maxRetries} failed for query "${query}":`,
        error
      );

      if (attempt < maxRetries) {
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed to search after ${maxRetries} attempts: ${lastError?.message}`
  );
}

/**
 * Execute multiple search queries
 */
export async function searchMultipleQueries(
  queries: string[],
  filters?: SearchFilters
): Promise<Map<string, BraveSearchResponse>> {
  const results = new Map<string, BraveSearchResponse>();

  for (const query of queries) {
    try {
      const response = await searchWithRetry(query, filters);
      results.set(query, response);
    } catch (error) {
      console.error(`Failed to search query "${query}":`, error);
      // Continue with other queries even if one fails
    }
  }

  return results;
}

/**
 * Deduplicate search results across multiple responses
 */
export function deduplicateResults(
  responses: BraveSearchResponse[],
  alreadyProcessedUrls?: Set<string>
): BraveSearchResult[] {
  const seenUrls = new Set<string>(alreadyProcessedUrls || []);
  const uniqueResults: BraveSearchResult[] = [];

  for (const response of responses) {
    for (const result of response.results) {
      const normalizedUrl = normalizeUrl(result.url);

      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.add(normalizedUrl);
        uniqueResults.push(result);
      }
    }
  }

  return uniqueResults;
}
