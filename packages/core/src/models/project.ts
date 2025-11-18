/**
 * Project data model
 *
 * Represents a research project that the user wants to track.
 */

export type Frequency = "daily" | "weekly" | "monthly";

export type ResultsDestination = "email" | "slack" | "sms" | "none";

export type ProjectStatus = "active" | "paused" | "error" | "draft";

export type DateRangePreference = "last_24h" | "last_week" | "last_month" | "last_3months" | "last_year" | "custom";

/**
 * Search parameters for customizing research queries
 */
export interface SearchParameters {
  priorityDomains?: string[]; // Domains to prioritize in results
  excludedDomains?: string[]; // Domains to exclude from results
  dateRangePreference?: DateRangePreference; // Preferred date range for results
  language?: string; // ISO language code (e.g., "en", "es")
  region?: string; // ISO region code (e.g., "US", "GB")
  requiredKeywords?: string[]; // Keywords that must appear in results
  excludedKeywords?: string[]; // Keywords to exclude from results
  customParameters?: Record<string, any>; // Extensible for future parameters
}

/**
 * Project settings for research execution
 */
export interface ProjectSettings {
  relevancyThreshold: number; // 0-100, minimum score to include result
  minResults: number; // Minimum results required before stopping retries
  maxResults: number; // Maximum results to include in report
}

/**
 * Delivery configuration based on destination type
 */
export interface DeliveryConfig {
  email?: {
    address: string;
    subject?: string; // Optional custom subject line
  };
  slack?: {
    webhookUrl: string;
    channel?: string; // Optional channel override
  };
  sms?: {
    phoneNumber: string; // E.164 format (e.g., +1234567890)
  };
}

/**
 * Full project type as stored in Firestore
 */
export interface Project {
  id: string;
  userId: string;
  title: string;
  description: string;
  frequency: Frequency;
  resultsDestination: ResultsDestination;
  
  // Scheduling configuration
  deliveryTime: string; // HH:MM format (24-hour), e.g., "09:15", "14:30" - must be in 15-min increments
  timezone: string; // IANA timezone identifier, e.g., "America/New_York", "Europe/London"
  
  // Search configuration
  searchParameters?: SearchParameters;
  
  // Project settings
  settings: ProjectSettings;
  
  // Delivery configuration
  deliveryConfig?: DeliveryConfig;
  
  // Execution tracking
  status: ProjectStatus;
  lastRunAt?: number; // Timestamp of last research execution
  nextRunAt?: number; // Timestamp of next scheduled execution
  lastError?: string; // Error message from last failed execution
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
}

/**
 * Project data needed to create a new project
 * (omits auto-generated fields)
 */
export interface NewProject
  extends Omit<Project, "id" | "createdAt" | "updatedAt" | "status" | "lastRunAt" | "nextRunAt" | "lastError"> {}
