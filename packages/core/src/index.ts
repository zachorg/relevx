/**
 * Core package entry point
 *
 * Exports all shared business logic, types, and hooks.
 */

// Models
export type {
  Project,
  NewProject,
  Frequency,
  ResultsDestination,
  ProjectStatus,
  DateRangePreference,
  SearchParameters,
  ProjectSettings,
  DeliveryConfig,
} from "./models/project";

export type {
  SearchResult,
  NewSearchResult,
  SearchResultSummary,
  SearchResultMetadata,
} from "./models/search-result";

export type {
  DeliveryLog,
  NewDeliveryLog,
  DeliveryLogSummary,
  DeliveryStats,
} from "./models/delivery-log";

export type {
  SearchHistory,
  NewSearchHistory,
  ProcessedUrl,
  QueryPerformance,
  DuplicateCheckResult,
} from "./models/search-history";

// Services
export { auth, db } from "./services/firebase";
export { signInWithGoogle, signOut } from "./services/auth";
export {
  createProject,
  listProjects,
  subscribeToProjects,
  updateProjectStatus,
  updateProjectExecution,
  activateProject,
} from "./services/projects";

export {
  initializeOpenAI,
  generateSearchQueries,
  generateSearchQueriesWithRetry,
  analyzeRelevancy,
  analyzeRelevancyWithRetry,
  compileReport,
  compileReportWithRetry,
} from "./services/openai";
export type {
  GeneratedQuery,
  ContentToAnalyze,
  RelevancyResult,
  ResultForReport,
  CompiledReport,
} from "./services/openai";

export {
  initializeBraveSearch,
  searchWeb,
  searchWithRetry,
  searchMultipleQueries,
  deduplicateResults,
  normalizeUrl,
} from "./services/brave-search";
export type {
  SearchFilters,
  BraveSearchResult,
  BraveSearchResponse,
} from "./services/brave-search";

export {
  extractContent,
  extractContentWithRetry,
  extractMultipleContents,
  getContentPreview,
} from "./services/content-extractor";
export type {
  ExtractedContent,
  ExtractionOptions,
} from "./services/content-extractor";

export {
  executeResearch,
  executeResearchForProject,
  executeResearchBatch,
} from "./services/research-engine";
export type {
  ResearchResult,
  ResearchOptions,
} from "./services/research-engine";

// Hooks
export { useAuth } from "./hooks/useAuth";
export { useProjects } from "./hooks/useProjects";
