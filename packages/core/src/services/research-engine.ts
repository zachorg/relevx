/**
 * Research Engine service
 *
 * Core orchestrator that coordinates the full research flow:
 * 1. Generate search queries (OpenAI)
 * 2. Execute searches (Brave Search)
 * 3. Extract content from URLs
 * 4. Analyze relevancy (OpenAI)
 * 5. Compile report (OpenAI)
 * 6. Save results and update project
 *
 * Includes retry logic and deduplication.
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  addDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Project } from "../models/project";
import type {
  SearchResult,
  NewSearchResult,
} from "../models/search-result";
import type {
  SearchHistory,
  NewSearchHistory,
  ProcessedUrl,
  QueryPerformance,
} from "../models/search-history";
import {
  generateSearchQueriesWithRetry,
  analyzeRelevancyWithRetry,
  compileReportWithRetry,
  type GeneratedQuery,
  type ContentToAnalyze,
  type ResultForReport,
} from "./openai";
import {
  searchMultipleQueries,
  deduplicateResults,
  normalizeUrl as normalizeSearchUrl,
  type BraveSearchResult,
  type SearchFilters,
} from "./brave-search";
import {
  extractMultipleContents,
  type ExtractedContent,
} from "./content-extractor";

/**
 * Research execution options
 */
export interface ResearchOptions {
  maxIterations?: number; // Max retry iterations (default: 3)
  minResults?: number; // Min results to find (default: from project.settings)
  maxResults?: number; // Max results to include (default: from project.settings)
  relevancyThreshold?: number; // Min score (default: from project.settings)
  concurrentExtractions?: number; // Parallel extractions (default: 3)
}

/**
 * Research execution result
 */
export interface ResearchResult {
  success: boolean;
  projectId: string;
  
  // Results
  relevantResults: SearchResult[];
  totalResultsAnalyzed: number;
  iterationsUsed: number;
  
  // Queries
  queriesGenerated: string[];
  queriesExecuted: string[];
  
  // URLs
  urlsFetched: number;
  urlsSuccessful: number;
  urlsRelevant: number;
  
  // Report
  report?: {
    markdown: string;
    title: string;
    summary: string;
    averageScore: number;
  };
  
  // Errors
  error?: string;
  
  // Timing
  startedAt: number;
  completedAt: number;
  durationMs: number;
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
 * Get or create search history for a project
 */
async function getSearchHistory(
  userId: string,
  projectId: string
): Promise<SearchHistory> {
  const historyRef = doc(
    db,
    "users",
    userId,
    "projects",
    projectId,
    "metadata",
    "searchHistory"
  );
  
  const historyDoc = await getDoc(historyRef);
  
  if (historyDoc.exists()) {
    return historyDoc.data() as SearchHistory;
  }
  
  // Create new history
  const newHistory: NewSearchHistory = {
    projectId,
    userId,
    processedUrls: [],
    urlIndex: {},
    queryPerformance: [],
    queryIndex: {},
    totalUrlsProcessed: 0,
    totalSearchesExecuted: 0,
    totalReportsGenerated: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  await setDoc(historyRef, newHistory);
  return newHistory as SearchHistory;
}

/**
 * Update search history with new data
 */
async function updateSearchHistory(
  userId: string,
  projectId: string,
  newUrls: ProcessedUrl[],
  queryPerformance: Map<string, { relevant: number; total: number }>
): Promise<void> {
  const historyRef = doc(
    db,
    "users",
    userId,
    "projects",
    projectId,
    "metadata",
    "searchHistory"
  );
  
  const history = await getSearchHistory(userId, projectId);
  
  // Update processed URLs
  const updatedUrls = [...history.processedUrls];
  const updatedUrlIndex = { ...history.urlIndex };
  
  for (const newUrl of newUrls) {
    const existing = updatedUrls.find(
      (u) => u.normalizedUrl === newUrl.normalizedUrl
    );
    
    if (existing) {
      existing.timesFound++;
      existing.lastRelevancyScore = newUrl.lastRelevancyScore;
      existing.wasIncluded = existing.wasIncluded || newUrl.wasIncluded;
    } else {
      updatedUrls.push(newUrl);
      updatedUrlIndex[newUrl.normalizedUrl] = true;
    }
  }
  
  // Update query performance
  const updatedQueryPerformance = [...history.queryPerformance];
  const updatedQueryIndex = { ...history.queryIndex };
  
  for (const [query, stats] of queryPerformance.entries()) {
    const existingIdx = updatedQueryIndex[query];
    
    if (existingIdx !== undefined) {
      const existing = updatedQueryPerformance[existingIdx];
      existing.timesUsed++;
      existing.urlsFound += stats.total;
      existing.relevantUrlsFound += stats.relevant;
      existing.lastUsedAt = Date.now();
      
      const totalRelevant = existing.relevantUrlsFound;
      const totalFound = existing.urlsFound;
      existing.successRate = totalFound > 0 ? (totalRelevant / totalFound) * 100 : 0;
      existing.averageRelevancyScore =
        totalRelevant > 0 ? existing.averageRelevancyScore : 0;
    } else {
      const newPerf: QueryPerformance = {
        query,
        timesUsed: 1,
        urlsFound: stats.total,
        relevantUrlsFound: stats.relevant,
        averageRelevancyScore: 0,
        lastUsedAt: Date.now(),
        successRate: stats.total > 0 ? (stats.relevant / stats.total) * 100 : 0,
      };
      updatedQueryPerformance.push(newPerf);
      updatedQueryIndex[query] = updatedQueryPerformance.length - 1;
    }
  }
  
  await updateDoc(historyRef, {
    processedUrls: updatedUrls,
    urlIndex: updatedUrlIndex,
    queryPerformance: updatedQueryPerformance,
    queryIndex: updatedQueryIndex,
    totalUrlsProcessed: updatedUrls.length,
    totalSearchesExecuted: history.totalSearchesExecuted + queryPerformance.size,
    updatedAt: Date.now(),
  });
}

/**
 * Save search results to Firestore
 */
async function saveSearchResults(
  userId: string,
  projectId: string,
  results: SearchResult[]
): Promise<void> {
  const resultsCollection = collection(
    db,
    "users",
    userId,
    "projects",
    projectId,
    "searchResults"
  );
  
  for (const result of results) {
    const resultData: NewSearchResult = {
      projectId: result.projectId,
      userId: result.userId,
      url: result.url,
      normalizedUrl: result.normalizedUrl,
      sourceQuery: result.sourceQuery,
      searchEngine: result.searchEngine,
      snippet: result.snippet,
      fullContent: result.fullContent,
      relevancyScore: result.relevancyScore,
      relevancyReason: result.relevancyReason,
      metadata: result.metadata,
      fetchedAt: result.fetchedAt,
      analyzedAt: result.analyzedAt,
      fetchStatus: result.fetchStatus,
      fetchError: result.fetchError,
    };
    
    await addDoc(resultsCollection, resultData);
  }
}

/**
 * Execute research for a project
 */
export async function executeResearch(
  projectId: string,
  options?: ResearchOptions
): Promise<ResearchResult> {
  const startedAt = Date.now();
  
  try {
    // Load project
    const projectDoc = await getDoc(doc(db, "users"));
    // We need to find the project across all users - this is a simplified version
    // In production, you'd pass userId or have a different lookup mechanism
    
    // For now, we'll assume we have the project data
    // This is a placeholder - in real implementation, userId should be passed
    throw new Error(
      "executeResearch needs userId parameter - implementation incomplete"
    );
  } catch (error: any) {
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
 * Execute research with full context (main implementation)
 */
export async function executeResearchForProject(
  userId: string,
  projectId: string,
  options?: ResearchOptions
): Promise<ResearchResult> {
  const startedAt = Date.now();
  const maxIterations = options?.maxIterations || 3;
  
  try {
    // 1. Load project
    const projectRef = doc(db, "users", userId, "projects", projectId);
    const projectDoc = await getDoc(projectRef);
    
    if (!projectDoc.exists()) {
      throw new Error(`Project ${projectId} not found`);
    }
    
    const project = { id: projectDoc.id, ...projectDoc.data() } as Project;
    
    // Get settings
    const minResults = options?.minResults || project.settings.minResults;
    const maxResults = options?.maxResults || project.settings.maxResults;
    const relevancyThreshold =
      options?.relevancyThreshold || project.settings.relevancyThreshold;
    const concurrentExtractions = options?.concurrentExtractions || 3;
    
    // 2. Load search history
    const history = await getSearchHistory(userId, projectId);
    const processedUrlsSet = new Set(
      history.processedUrls.map((u) => u.normalizedUrl)
    );
    
    // 3. Prepare search filters
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
    
    // Tracking
    let allRelevantResults: SearchResult[] = [];
    let totalUrlsFetched = 0;
    let totalUrlsSuccessful = 0;
    let allQueriesGenerated: string[] = [];
    let allQueriesExecuted: string[] = [];
    const queryPerformanceMap = new Map<
      string,
      { relevant: number; total: number }
    >();
    
    // 4. Iteration loop (max 3 times)
    let iteration = 1;
    
    while (iteration <= maxIterations) {
      console.log(
        `\n=== Research Iteration ${iteration}/${maxIterations} ===`
      );
      
      // 4.1 Generate search queries
      console.log("Generating search queries...");
      const generatedQueries = await generateSearchQueriesWithRetry(
        project.description,
        project.searchParameters,
        history.queryPerformance,
        iteration
      );
      
      const queries = generatedQueries.map((q) => q.query);
      allQueriesGenerated.push(...queries);
      console.log(`Generated ${queries.length} queries`);
      
      // 4.2 Execute searches
      console.log("Executing searches...");
      const searchResponses = await searchMultipleQueries(
        queries,
        searchFilters
      );
      allQueriesExecuted.push(...searchResponses.keys());
      
      // 4.3 Deduplicate results
      console.log("Deduplicating results...");
      const allBraveResults = Array.from(searchResponses.values());
      const uniqueResults = deduplicateResults(
        allBraveResults,
        processedUrlsSet
      );
      
      console.log(
        `Found ${uniqueResults.length} unique URLs (after deduplication)`
      );
      
      if (uniqueResults.length === 0) {
        console.log("No new URLs found, stopping iterations");
        break;
      }
      
      // 4.4 Extract content
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
      
      // 4.5 Analyze relevancy
      console.log("Analyzing relevancy...");
      const contentsToAnalyze: ContentToAnalyze[] = successfulContents.map(
        (content) => ({
          url: content.url,
          title: content.title,
          snippet: content.snippet,
          publishedDate: content.metadata.publishedDate,
          metadata: content.metadata,
        })
      );
      
      const relevancyResults = await analyzeRelevancyWithRetry(
        contentsToAnalyze,
        project.description,
        project.searchParameters,
        relevancyThreshold
      );
      
      // 4.6 Filter and create SearchResult objects
      const relevantResults = relevancyResults.filter((r) => r.isRelevant);
      console.log(
        `Found ${relevantResults.length} relevant results (threshold: ${relevancyThreshold})`
      );
      
      // Create SearchResult objects
      for (const relevancyResult of relevantResults) {
        const extractedContent = successfulContents.find(
          (c) => c.url === relevancyResult.url
        );
        
        if (!extractedContent) continue;
        
        // Find source query
        let sourceQuery = "unknown";
        for (const [query, response] of searchResponses.entries()) {
          if (response.results.some((r) => r.url === relevancyResult.url)) {
            sourceQuery = query;
            break;
          }
        }
        
        const searchResult: SearchResult = {
          id: "", // Will be set by Firestore
          projectId,
          userId,
          url: extractedContent.url,
          normalizedUrl: extractedContent.normalizedUrl,
          sourceQuery,
          searchEngine: "brave",
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
        
        // Update processed URLs
        processedUrlsSet.add(extractedContent.normalizedUrl);
      }
      
      // Track query performance
      for (const [query, response] of searchResponses.entries()) {
        const relevantCount = relevantResults.filter((r) =>
          response.results.some((br) => br.url === r.url)
        ).length;
        
        queryPerformanceMap.set(query, {
          relevant: relevantCount,
          total: response.results.length,
        });
      }
      
      // 4.7 Check if we have enough results
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
    
    // 5. Sort and limit results
    const sortedResults = allRelevantResults
      .sort((a, b) => b.relevancyScore - a.relevancyScore)
      .slice(0, maxResults);
    
    console.log(
      `\nFinal: ${sortedResults.length} results (from ${allRelevantResults.length} total relevant)`
    );
    
    // 6. Compile report (if we have results)
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
      
      const compiledReport = await compileReportWithRetry(
        resultsForReport,
        project.title,
        project.description,
        project.searchParameters
      );
      
      report = {
        markdown: compiledReport.markdown,
        title: compiledReport.title,
        summary: compiledReport.summary,
        averageScore: compiledReport.averageScore,
      };
    }
    
    // 7. Save results to Firestore
    console.log("Saving results...");
    if (sortedResults.length > 0) {
      await saveSearchResults(userId, projectId, sortedResults);
    }
    
    // 8. Update search history
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
    
    // 9. Update project execution tracking
    await updateDoc(projectRef, {
      lastRunAt: startedAt,
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
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
    };
  } catch (error: any) {
    console.error("Research execution error:", error);
    
    // Update project with error
    try {
      await updateDoc(doc(db, "users", userId, "projects", projectId), {
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

