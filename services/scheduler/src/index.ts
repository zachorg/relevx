/**
 * Research Scheduler Service
 * 
 * Runs cron jobs every 15 minutes to execute research for projects
 * that are due based on their delivery time and timezone.
 */

import * as dotenv from "dotenv";
import * as cron from "node-cron";
import { initializeFirebaseAdmin, getFirestore } from "./firebase-admin";
import { logger } from "./logger";

// Load environment variables
dotenv.config();

/**
 * Project interface (minimal fields needed for scheduling)
 */
interface Project {
  id: string;
  userId: string;
  title: string;
  frequency: "daily" | "weekly" | "monthly";
  deliveryTime: string;
  timezone: string;
  status: "active" | "paused" | "error" | "draft";
  nextRunAt?: number;
  lastRunAt?: number;
}

/**
 * Query active projects that are due for execution
 */
async function getDueProjects(): Promise<Array<{ userId: string; project: Project }>> {
  const db = getFirestore();
  const now = Date.now();
  const dueProjects: Array<{ userId: string; project: Project }> = [];

  try {
    logger.debug("Querying for due projects", { timestamp: now });

    // Query all users (in production, you might want to paginate this)
    const usersSnapshot = await db.collection("users").get();

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      // Query active projects for this user where nextRunAt <= now
      const projectsSnapshot = await db
        .collection("users")
        .doc(userId)
        .collection("projects")
        .where("status", "==", "active")
        .where("nextRunAt", "<=", now)
        .get();

      for (const projectDoc of projectsSnapshot.docs) {
        const project = {
          id: projectDoc.id,
          ...projectDoc.data(),
        } as Project;

        dueProjects.push({ userId, project });
      }
    }

    logger.info(`Found ${dueProjects.length} due projects`, {
      count: dueProjects.length,
    });

    return dueProjects;
  } catch (error: any) {
    logger.error("Failed to query due projects", {
      error: error.message,
      stack: error.stack,
    });
    return [];
  }
}

/**
 * Execute research for a single project
 */
async function executeProjectResearch(
  userId: string,
  project: Project
): Promise<void> {
  logger.info("Starting research execution", {
    userId,
    projectId: project.id,
    title: project.title,
    frequency: project.frequency,
  });

  try {
    // Import the research engine dynamically to avoid loading it at startup
    const { executeResearchForProject } = await import(
      "../../../packages/core/src/services/research-engine"
    );
    
    // Import service initializations
    const { initializeOpenAI } = await import(
      "../../../packages/core/src/services/openai"
    );
    const { initializeBraveSearch } = await import(
      "../../../packages/core/src/services/brave-search"
    );

    // Initialize services if not already done
    const openaiKey = process.env.OPENAI_API_KEY;
    const braveKey = process.env.BRAVE_SEARCH_API_KEY;

    if (!openaiKey || !braveKey) {
      throw new Error("Missing required API keys (OPENAI_API_KEY or BRAVE_SEARCH_API_KEY)");
    }

    initializeOpenAI(openaiKey);
    initializeBraveSearch(braveKey);

    // Execute research
    const result = await executeResearchForProject(userId, project.id);

    if (result.success) {
      logger.info("Research execution completed successfully", {
        userId,
        projectId: project.id,
        resultsCount: result.relevantResults.length,
        durationMs: result.durationMs,
      });
    } else {
      logger.error("Research execution failed", {
        userId,
        projectId: project.id,
        error: result.error,
      });
    }
  } catch (error: any) {
    logger.error("Research execution error", {
      userId,
      projectId: project.id,
      error: error.message,
      stack: error.stack,
    });

    // Update project with error status
    try {
      const db = getFirestore();
      await db
        .collection("users")
        .doc(userId)
        .collection("projects")
        .doc(project.id)
        .update({
          status: "error",
          lastError: error.message,
          updatedAt: Date.now(),
        });
    } catch (updateError: any) {
      logger.error("Failed to update project error status", {
        userId,
        projectId: project.id,
        error: updateError.message,
      });
    }
  }
}

/**
 * Main scheduler job - runs every 15 minutes
 */
async function runSchedulerJob(): Promise<void> {
  logger.info("Scheduler job started");
  const startTime = Date.now();

  try {
    // Get all due projects
    const dueProjects = await getDueProjects();

    if (dueProjects.length === 0) {
      logger.info("No projects due for execution");
      return;
    }

    // Get max concurrent jobs from env (default: 3)
    const maxConcurrent = parseInt(
      process.env.MAX_CONCURRENT_RESEARCH_JOBS || "3",
      10
    );

    logger.info(`Processing ${dueProjects.length} projects`, {
      maxConcurrent,
    });

    // Process projects in batches to avoid overwhelming the system
    for (let i = 0; i < dueProjects.length; i += maxConcurrent) {
      const batch = dueProjects.slice(i, i + maxConcurrent);
      
      logger.debug(`Processing batch ${i / maxConcurrent + 1}`, {
        batchSize: batch.length,
      });

      // Execute research for all projects in batch concurrently
      await Promise.all(
        batch.map(({ userId, project }) =>
          executeProjectResearch(userId, project)
        )
      );
    }

    const duration = Date.now() - startTime;
    logger.info("Scheduler job completed", {
      projectsProcessed: dueProjects.length,
      durationMs: duration,
    });
  } catch (error: any) {
    logger.error("Scheduler job failed", {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Start the scheduler service
 */
async function startScheduler(): Promise<void> {
  logger.info("Starting Research Scheduler Service");

  // Validate required environment variables
  const requiredEnvVars = [
    "OPENAI_API_KEY",
    "BRAVE_SEARCH_API_KEY",
    "FIREBASE_PROJECT_ID",
  ];

  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
  if (missingVars.length > 0) {
    logger.error("Missing required environment variables", {
      missing: missingVars,
    });
    process.exit(1);
  }

  // Initialize Firebase Admin
  try {
    initializeFirebaseAdmin();
  } catch (error: any) {
    logger.error("Failed to initialize Firebase Admin", {
      error: error.message,
    });
    process.exit(1);
  }

  // Check if scheduler is enabled
  if (process.env.SCHEDULER_ENABLED === "false") {
    logger.warn("Scheduler is disabled by configuration");
    return;
  }

  // Run once at startup (optional, can be disabled)
  if (process.env.RUN_ON_STARTUP !== "false") {
    logger.info("Running initial scheduler job");
    await runSchedulerJob();
  }

  // Set up cron job to run every 15 minutes
  // Cron format: */15 * * * * = every 15 minutes
  const cronExpression = "*/15 * * * *";
  
  logger.info("Setting up cron job", { schedule: cronExpression });

  cron.schedule(cronExpression, async () => {
    await runSchedulerJob();
  });

  logger.info("Scheduler service started successfully", {
    schedule: "Every 15 minutes",
    timezone: process.env.SCHEDULER_TIMEZONE || "UTC",
  });

  // Keep the process running
  process.on("SIGINT", () => {
    logger.info("Received SIGINT, shutting down gracefully");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM, shutting down gracefully");
    process.exit(0);
  });
}

// Start the scheduler
startScheduler().catch((error) => {
  logger.error("Failed to start scheduler", {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

