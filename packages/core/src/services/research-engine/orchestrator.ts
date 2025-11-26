/**
 * Research orchestrator
 * Core logic for executing the research flow
 *
 * Now uses provider interfaces for LLM and Search providers,
 * allowing easy switching between OpenAI/Gemini and Brave/ScrapingBee
 */

import { db } from "../firebase";
import type { Project } from "../../models/project";
import type { SearchResult } from "../../models/search-result";
import type { ProcessedUrl } from "../../models/search-history";
import type { DeliveryStats } from "../../models/delivery-log";
import type {
  LLMProvider,
  ContentToAnalyze,
  ResultForReport,
} from "../../interfaces/llm-provider";
import type {
  SearchProvider,
  SearchFilters,
} from "../../interfaces/search-provider";
import { extractMultipleContents } from "../content-extractor";
import { calculateNextRunAt, validateFrequency } from "../../utils/scheduling";
import { getSearchHistory, updateSearchHistory } from "./search-history";
import { saveSearchResults, saveDeliveryLog } from "./result-storage";
import type { ResearchOptions, ResearchResult } from "./types";

// Default providers (can be overridden via options)
let defaultLLMProvider: LLMProvider | null = null;
let defaultSearchProvider: SearchProvider | null = null;

/**
 * Set default providers for research execution
 * Call this during initialization to set up default providers
 */
export function setDefaultProviders(
  llmProvider: LLMProvider,
  searchProvider: SearchProvider
): void {
  defaultLLMProvider = llmProvider;
  defaultSearchProvider = searchProvider;
}

/**
 * Get or create default providers
 */
function getDefaultProviders(): { llm: LLMProvider; search: SearchProvider } {
  if (!defaultLLMProvider || !defaultSearchProvider) {
    throw new Error(
      "Default providers not set. Call setDefaultProviders() or provide providers in options."
    );
  }
  return {
    llm: defaultLLMProvider,
    search: defaultSearchProvider,
  };
}

/**
 * Calculate date range based on project frequency
 */
function calculateDateRange(frequency: "daily" | "weekly" | "monthly"): {
  dateFrom: string;
  dateTo: string;
} {
  const now = new Date();
  const dateTo = now.toISOString().split("T")[0]; // Today

  let dateFrom: Date;
  switch (frequency) {
    case "daily":
      dateFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "weekly":
      dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "monthly":
      dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  return {
    dateFrom: dateFrom.toISOString().split("T")[0],
    dateTo,
  };
}

/**
 * Execute research with full context (main implementation)
 */
export async function executeResearchForProject(
  userId: string,
  projectId: string,
  options?: ResearchOptions
): Promise<ResearchResult> {
  const startedAt = Date.now();
  const maxIterations = options?.maxIterations || 3;

  // Get providers (use injected or defaults)
  const defaults = getDefaultProviders();
  const llmProvider = options?.llmProvider || defaults.llm;
  const searchProvider = options?.searchProvider || defaults.search;

  try {
    // 1. Load project
    const projectRef = db
      .collection("users")
      .doc(userId)
      .collection("projects")
      .doc(projectId);
    const projectDoc = await projectRef.get();

    if (!projectDoc.exists) {
      throw new Error(`Project ${projectId} not found`);
    }

    const project = { id: projectDoc.id, ...projectDoc.data() } as Project;

    // 2. Validate frequency (prevent running too often)
    if (!validateFrequency(project.frequency, project.lastRunAt)) {
      throw new Error(
        `Project cannot be run more than once per day. Last run: ${new Date(
          project.lastRunAt!
        ).toISOString()}`
      );
    }

    // 3. Get settings
    const minResults = options?.minResults || project.settings.minResults;
    const maxResults = options?.maxResults || project.settings.maxResults;
    const relevancyThreshold =
      options?.relevancyThreshold || project.settings.relevancyThreshold;
    const concurrentExtractions = options?.concurrentExtractions || 3;

    // 4. Load search history
    const history = await getSearchHistory(userId, projectId);
    const processedUrlsSet = new Set(
      history.processedUrls.map((u) => u.normalizedUrl)
    );

    // 5. Prepare search filters
    const dateRange = project.searchParameters?.dateRangePreference
      ? calculateDateRange(project.frequency)
      : undefined;

    const searchFilters: SearchFilters = {
      country: project.searchParameters?.region,
      language: project.searchParameters?.language,
      includeDomains: project.searchParameters?.priorityDomains,
      excludeDomains: project.searchParameters?.excludedDomains,
      dateFrom: dateRange?.dateFrom,
      dateTo: dateRange?.dateTo,
    };

    // 6. Tracking
    let allRelevantResults: SearchResult[] = [];
    let totalUrlsFetched = 0;
    let totalUrlsSuccessful = 0;
    let allQueriesGenerated: string[] = [];
    let allQueriesExecuted: string[] = [];
    const queryPerformanceMap = new Map<
      string,
      { relevant: number; total: number }
    >();

    // 7. Iteration loop (max 3 times)
    let iteration = 1;

    while (iteration <= maxIterations) {
      console.log(`\n=== Research Iteration ${iteration}/${maxIterations} ===`);

      // 7.1 Generate search queries
      console.log("Generating search queries...");

      // Build additional context with keywords if provided
      let additionalContext: string | undefined = undefined;
      if (
        project.searchParameters?.requiredKeywords &&
        project.searchParameters.requiredKeywords.length > 0
      ) {
        additionalContext = `Please incorporate the following keywords into the search queries: ${project.searchParameters.requiredKeywords.join(
          ", "
        )}. These keywords are important for improving search result relevance.`;
      }

      const generatedQueries = await llmProvider.generateSearchQueries(
        project.description,
        additionalContext,
        {
          count: 7,
          focusRecent:
            project.searchParameters?.dateRangePreference === "last_24h" ||
            project.searchParameters?.dateRangePreference === "last_week",
        }
      );

      const queries = generatedQueries.map((q) => q.query);
      allQueriesGenerated.push(...queries);
      console.log(`Generated ${queries.length} queries`);

      // 7.2 Execute searches
      console.log("Executing searches...");
      const searchResponses = await searchProvider.searchMultiple(
        queries,
        searchFilters
      );
      allQueriesExecuted.push(...searchResponses.keys());

      // 7.3 Deduplicate results
      console.log("Deduplicating results...");
      const allSearchResponses = Array.from(searchResponses.values());

      // Convert generic search results to URLs for deduplication
      const allUrlsWithMeta = allSearchResponses.flatMap((response) =>
        response.results.map((result) => ({
          url: result.url,
          title: result.title,
          description: result.description,
          publishedDate: result.publishedDate,
        }))
      );

      // Simple deduplication by URL
      const uniqueUrlsMap = new Map<string, (typeof allUrlsWithMeta)[0]>();
      for (const item of allUrlsWithMeta) {
        const normalizedUrl = item.url.toLowerCase().replace(/\/$/, "");
        if (
          !processedUrlsSet.has(normalizedUrl) &&
          !uniqueUrlsMap.has(normalizedUrl)
        ) {
          uniqueUrlsMap.set(normalizedUrl, item);
        }
      }
      const uniqueResults = Array.from(uniqueUrlsMap.values());

      console.log(
        `Found ${uniqueResults.length} unique URLs (after deduplication)`
      );

      if (uniqueResults.length === 0) {
        console.log("No new URLs found, stopping iterations");
        break;
      }

      // 7.4 Extract content
      console.log(`Extracting content from ${uniqueResults.length} URLs...`);
      const extractedContents = await extractMultipleContents(
        uniqueResults.map((r) => r.url),
        undefined,
        concurrentExtractions
      );

      totalUrlsFetched += extractedContents.length;
      const successfulContents = extractedContents.filter(
        (c) => c.fetchStatus === "success" && c.snippet.length > 0
      );
      totalUrlsSuccessful += successfulContents.length;

      console.log(
        `Successfully extracted ${successfulContents.length}/${extractedContents.length} URLs`
      );

      if (successfulContents.length === 0) {
        console.log("No successful extractions, continuing to next iteration");
        iteration++;
        continue;
      }

      // 7.4.5 Filter by keywords if specified
      let filteredContents = successfulContents;
      const requiredKeywords = project.searchParameters?.requiredKeywords || [];
      const excludedKeywords = project.searchParameters?.excludedKeywords || [];

      if (requiredKeywords.length > 0 || excludedKeywords.length > 0) {
        filteredContents = successfulContents.filter((content) => {
          // Check for excluded keywords first (case-insensitive)
          if (excludedKeywords.length > 0) {
            const contentText = `${content.title || ""} ${content.snippet} ${
              content.fullContent || ""
            }`.toLowerCase();
            const hasExcludedKeyword = excludedKeywords.some((keyword) =>
              contentText.includes(keyword.toLowerCase())
            );
            if (hasExcludedKeyword) {
              return false;
            }
          }

          // Check for required keywords (case-insensitive)
          if (requiredKeywords.length > 0) {
            const contentText = `${content.title || ""} ${content.snippet} ${
              content.fullContent || ""
            }`.toLowerCase();
            const hasRequiredKeyword = requiredKeywords.some((keyword) =>
              contentText.includes(keyword.toLowerCase())
            );
            if (!hasRequiredKeyword) {
              return false;
            }
          }

          return true;
        });

        console.log(
          `Filtered ${filteredContents.length}/${successfulContents.length} contents based on keyword filters`
        );
      }

      if (filteredContents.length === 0) {
        console.log(
          "No contents passed keyword filtering, continuing to next iteration"
        );
        iteration++;
        continue;
      }

      // 7.5 Analyze relevancy
      console.log("Analyzing relevancy...");
      const contentsToAnalyze: ContentToAnalyze[] = filteredContents.map(
        (content) => ({
          url: content.url,
          title: content.title,
          snippet: content.snippet,
          publishedDate: content.metadata.publishedDate,
          metadata: content.metadata,
        })
      );

      const relevancyResults = await llmProvider.analyzeRelevancy(
        project.description,
        contentsToAnalyze,
        {
          threshold: relevancyThreshold,
          batchSize: 10,
        }
      );

      // 7.6 Filter and create SearchResult objects
      const relevantResults = relevancyResults.filter((r) => r.isRelevant);
      console.log(
        `Found ${relevantResults.length} relevant results (threshold: ${relevancyThreshold})`
      );

      // 7.7 Create SearchResult objects
      for (const relevancyResult of relevantResults) {
        const extractedContent = filteredContents.find(
          (c) => c.url === relevancyResult.url
        );

        if (!extractedContent) continue;

        // 7.7.1 Find source query
        let sourceQuery = "unknown";
        for (const [query, response] of searchResponses.entries()) {
          if (response.results.some((r) => r.url === relevancyResult.url)) {
            sourceQuery = query;
            break;
          }
        }

        // 7.7.2 Create SearchResult
        const searchResult: SearchResult = {
          id: "", // Will be set by Firestore
          projectId,
          userId,
          url: extractedContent.url,
          normalizedUrl: extractedContent.normalizedUrl,
          sourceQuery,
          searchEngine: searchProvider.getName().toLowerCase(),
          snippet: extractedContent.snippet,
          fullContent: extractedContent.fullContent,
          relevancyScore: relevancyResult.score,
          relevancyReason: relevancyResult.reasoning,
          metadata: {
            title: extractedContent.title,
            description: extractedContent.metadata.description,
            author: extractedContent.metadata.author,
            publishedDate: extractedContent.metadata.publishedDate,
            imageUrl: extractedContent.images[0]?.src,
            imageAlt: extractedContent.images[0]?.alt,
            contentType: extractedContent.metadata.contentType,
            wordCount: extractedContent.wordCount,
          },
          fetchedAt: extractedContent.fetchedAt,
          analyzedAt: Date.now(),
          fetchStatus: extractedContent.fetchStatus,
        };

        allRelevantResults.push(searchResult);

        // 7.7.3 Update processed URLs
        processedUrlsSet.add(extractedContent.normalizedUrl);
      }

      // 7.8 Track query performance
      for (const [query, response] of searchResponses.entries()) {
        const relevantCount = relevantResults.filter((r) =>
          response.results.some((br) => br.url === r.url)
        ).length;

        queryPerformanceMap.set(query, {
          relevant: relevantCount,
          total: response.results.length,
        });
      }

      // 7.9 Check if we have enough results
      if (allRelevantResults.length >= minResults) {
        console.log(
          `Found ${allRelevantResults.length} results (minimum: ${minResults}), stopping iterations`
        );
        break;
      }

      console.log(
        `Only ${allRelevantResults.length}/${minResults} results found, continuing...`
      );
      iteration++;
    }

    // 8. Sort and limit results
    const sortedResults = allRelevantResults
      .sort((a, b) => b.relevancyScore - a.relevancyScore)
      .slice(0, maxResults);

    console.log(
      `\nFinal: ${sortedResults.length} results (from ${allRelevantResults.length} total relevant)`
    );

    // 9. Compile report (if we have results)
    let report;
    if (sortedResults.length > 0) {
      console.log("Compiling report...");
      const resultsForReport: ResultForReport[] = sortedResults.map((r) => ({
        url: r.url,
        title: r.metadata.title,
        snippet: r.snippet,
        score: r.relevancyScore,
        keyPoints: r.relevancyReason?.split(".").slice(0, 3) || [],
        publishedDate: r.metadata.publishedDate,
        author: r.metadata.author,
        imageUrl: r.metadata.imageUrl,
        imageAlt: r.metadata.imageAlt,
      }));

      const compiledReport = await llmProvider.compileReport(
        project.description,
        resultsForReport,
        {
          tone: "professional",
          maxLength: 5000,
        }
      );

      report = {
        markdown: compiledReport.markdown,
        title: compiledReport.title,
        summary: compiledReport.summary,
        averageScore: compiledReport.averageScore,
      };
    }

    // 10. Save results to Firestore
    console.log("Saving results...");
    let searchResultIds: string[] = [];
    if (sortedResults.length > 0) {
      searchResultIds = await saveSearchResults(
        userId,
        projectId,
        sortedResults
      );
    }

    // 10.5. Save delivery log (with compiled report)
    let deliveryLogId: string | undefined;
    if (report && sortedResults.length > 0) {
      console.log("Saving delivery log...");
      const stats: DeliveryStats = {
        totalResults: allRelevantResults.length,
        includedResults: sortedResults.length,
        averageRelevancyScore: report.averageScore,
        searchQueriesUsed: allQueriesExecuted.length,
        iterationsRequired: iteration,
        urlsFetched: totalUrlsFetched,
        urlsSuccessful: totalUrlsSuccessful,
      };

      deliveryLogId = await saveDeliveryLog(
        userId,
        projectId,
        project,
        report,
        stats,
        searchResultIds,
        startedAt,
        Date.now()
      );
    }

    // 11. Update search history
    const newProcessedUrls: ProcessedUrl[] = sortedResults.map((r) => ({
      url: r.url,
      normalizedUrl: r.normalizedUrl,
      firstSeenAt: r.fetchedAt,
      timesFound: 1,
      lastRelevancyScore: r.relevancyScore,
      wasIncluded: true,
    }));

    await updateSearchHistory(
      userId,
      projectId,
      newProcessedUrls,
      queryPerformanceMap
    );

    // 12. Calculate next run time
    const nextRunAt = calculateNextRunAt(
      project.frequency,
      project.deliveryTime,
      project.timezone,
      startedAt
    );

    // 13. Update project execution tracking
    await projectRef.update({
      lastRunAt: startedAt,
      nextRunAt,
      status: "active",
      updatedAt: Date.now(),
    });

    const completedAt = Date.now();

    return {
      success: true,
      projectId,
      relevantResults: sortedResults,
      totalResultsAnalyzed: allRelevantResults.length,
      iterationsUsed: iteration,
      queriesGenerated: allQueriesGenerated,
      queriesExecuted: allQueriesExecuted,
      urlsFetched: totalUrlsFetched,
      urlsSuccessful: totalUrlsSuccessful,
      urlsRelevant: allRelevantResults.length,
      report,
      deliveryLogId,
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
    };
  } catch (error: any) {
    console.error("Research execution error:", error);

    // Update project with error
    try {
      const projectRef = db
        .collection("users")
        .doc(userId)
        .collection("projects")
        .doc(projectId);
      await projectRef.update({
        lastRunAt: startedAt,
        status: "error",
        lastError: error.message,
        updatedAt: Date.now(),
      });
    } catch (updateError) {
      console.error("Failed to update project with error:", updateError);
    }

    return {
      success: false,
      projectId,
      relevantResults: [],
      totalResultsAnalyzed: 0,
      iterationsUsed: 0,
      queriesGenerated: [],
      queriesExecuted: [],
      urlsFetched: 0,
      urlsSuccessful: 0,
      urlsRelevant: 0,
      error: error.message,
      startedAt,
      completedAt: Date.now(),
      durationMs: Date.now() - startedAt,
    };
  }
}

/**
 * Execute research for multiple projects in batch
 */
export async function executeResearchBatch(
  projects: Array<{ userId: string; projectId: string }>,
  options?: ResearchOptions
): Promise<ResearchResult[]> {
  const results: ResearchResult[] = [];

  for (const { userId, projectId } of projects) {
    try {
      console.log(`\n=== Executing research for project ${projectId} ===`);
      const result = await executeResearchForProject(
        userId,
        projectId,
        options
      );
      results.push(result);
    } catch (error: any) {
      console.error(
        `Failed to execute research for project ${projectId}:`,
        error
      );
      results.push({
        success: false,
        projectId,
        relevantResults: [],
        totalResultsAnalyzed: 0,
        iterationsUsed: 0,
        queriesGenerated: [],
        queriesExecuted: [],
        urlsFetched: 0,
        urlsSuccessful: 0,
        urlsRelevant: 0,
        error: error.message,
        startedAt: Date.now(),
        completedAt: Date.now(),
        durationMs: 0,
      });
    }
  }

  return results;
}
