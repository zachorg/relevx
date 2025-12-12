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
  Plan,
  PlanInfo,
  FetchPlansResponse
} from "./models/plans";

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
  AdminNotification,
  NewAdminNotification,
  NotificationType,
  NotificationSeverity,
  NotificationStatus,
} from "./models/admin-notification";

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
  executeResearchForProject,
  executeResearchBatch,
  setDefaultProviders,
} from "./services/research-engine";
export type {
  ResearchResult,
  ResearchOptions,
} from "./services/research-engine";

// Provider Interfaces
export type {
  LLMProvider,
  SearchProvider,
  GeneratedQuery,
  SearchFilters,
  SearchResultItem,
  SearchResponse,
} from "./interfaces";

// Provider Implementations
export { OpenAIProvider, createOpenAIProvider } from "./services/llm";
export {
  BraveSearchProvider,
  createBraveSearchProvider,
} from "./services/search";

// Provider Factories
export {
  createLLMProvider,
  createSearchProvider,
  createProviders,
} from "./providers";
export type {
  LLMProviderType,
  SearchProviderType,
  LLMProviderConfig,
  SearchProviderConfig,
} from "./providers";

// Utils
export { normalizeUrl as utilNormalizeUrl } from "./utils/deduplication";

export {
  calculateDateRange,
  calculateDateRangeByFrequency,
  calculateDateRangeByPreference,
} from "./utils/date-filters";
export type { DateRange } from "./utils/date-filters";

export {
  calculateNextRunAt,
  validateFrequency,
  isProjectDue,
} from "./utils/scheduling";

export {
  saveDeliveryLog,
  saveSearchResults,
} from "./services/research-engine/result-storage";

// Hooks
export { useAuth } from "./hooks/useAuth";
export { useProjects } from "./hooks/useProjects";
