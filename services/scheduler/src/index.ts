/**
 * Research Scheduler Service
 *
 * Runs cron jobs every minute to:
 * 1. Execute research 15 minutes before delivery time (pre-run)
 * 2. Deliver results when delivery time arrives
 * 3. Retry research for projects that missed pre-run
 */

import * as dotenv from "dotenv";
import * as cron from "node-cron";
import { logger } from "./logger";

// Load environment variables
dotenv.config();

// Import types from core package
import type { Project } from "core";

// Provider instances (initialized once at startup)
let providersInitialized = false;

/**
 * Get check window in milliseconds (default: 15 minutes)
 */
function getCheckWindowMs(): number {
  const minutes = parseInt(
    process.env.SCHEDULER_CHECK_WINDOW_MINUTES || "15",
    10
  );
  return minutes * 60 * 1000;
}

/**
 * Initialize providers once at startup
 */
async function initializeProviders(): Promise<void> {
  if (providersInitialized) {
    return;
  }

  logger.info("Initializing research providers");

  try {
    // Validate API keys
    const openaiKey = process.env.OPENAI_API_KEY;
    const braveKey = process.env.BRAVE_SEARCH_API_KEY;

    if (!openaiKey || !braveKey) {
      throw new Error(
        "Missing required API keys (OPENAI_API_KEY or BRAVE_SEARCH_API_KEY)"
      );
    }

    // Import provider classes and setup function from core package
    const { OpenAIProvider, BraveSearchProvider, setDefaultProviders } =
      await import("core");

    // Create provider instances
    const llmProvider = new OpenAIProvider(openaiKey);
    const searchProvider = new BraveSearchProvider(braveKey);

    // Set as defaults for research engine
    setDefaultProviders(llmProvider, searchProvider);

    providersInitialized = true;
    logger.info("Research providers initialized successfully", {
      llmProvider: "OpenAI",
      searchProvider: "Brave Search",
    });
  } catch (error: any) {
    logger.error("Failed to initialize providers", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Execute research for a single project and return delivery log ID
 */
async function executeProjectResearch(
  userId: string,
  project: Project,
  status: "pending" | "success" = "pending"
): Promise<string | null> {
  logger.info("Starting research execution", {
    userId,
    projectId: project.id,
    title: project.title,
    frequency: project.frequency,
    deliveryStatus: status,
  });

  try {
    // Ensure providers are initialized
    await initializeProviders();

    // Import the research engine from core package
    const { executeResearchForProject, db } = await import("core");

    // Update project status to running
    const projectRef = db
      .collection("users")
      .doc(userId)
      .collection("projects")
      .doc(project.id);

    await projectRef.update({
      status: "running",
      researchStartedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Import result-storage to override status
    const { saveDeliveryLog } = await import(
      "core/src/services/research-engine/result-storage"
    );

    // Execute research (this will save with default "success" status)
    // We need to pass the status through the options
    const result = await executeResearchForProject(userId, project.id);

    if (result.success && result.deliveryLogId) {
      // If we need pending status, update the delivery log
      if (status === "pending") {
        const deliveryLogRef = db
          .collection("users")
          .doc(userId)
          .collection("projects")
          .doc(project.id)
          .collection("deliveryLogs")
          .doc(result.deliveryLogId);

        await deliveryLogRef.update({
          status: "pending",
          preparedAt: Date.now(),
          deliveredAt: null,
        });
      }

      logger.info("Research execution completed successfully", {
        userId,
        projectId: project.id,
        resultsCount: result.relevantResults.length,
        durationMs: result.durationMs,
        deliveryLogId: result.deliveryLogId,
        status,
      });

      return result.deliveryLogId;
    } else {
      logger.error("Research execution failed", {
        userId,
        projectId: project.id,
        error: result.error,
      });
      return null;
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
      const { db } = await import("core");
      await db
        .collection("users")
        .doc(userId)
        .collection("projects")
        .doc(project.id)
        .update({
          status: "error",
          lastError: error.message,
          researchStartedAt: null,
          updatedAt: Date.now(),
        });
    } catch (updateError: any) {
      logger.error("Failed to update project error status", {
        userId,
        projectId: project.id,
        error: updateError.message,
      });
    }

    return null;
  }
}

/**
 * Create admin notification for research failure
 */
async function createAdminNotification(
  userId: string,
  project: Project,
  error: string,
  retryCount: number
): Promise<void> {
  try {
    const { db } = await import("core");

    await db.collection("adminNotifications").add({
      type: "research_failure",
      severity: "high",
      projectId: project.id,
      userId,
      projectTitle: project.title,
      errorMessage: error,
      retryCount,
      occurredAt: Date.now(),
      status: "pending",
    });

    logger.info("Admin notification created", {
      projectId: project.id,
      userId,
      retryCount,
    });
  } catch (err: any) {
    logger.error("Failed to create admin notification", {
      error: err.message,
      projectId: project.id,
    });
  }
}

/**
 * Research Pre-run Job
 * Check for projects that need research 13-15 minutes ahead
 */
async function runResearchPrerunJob(): Promise<void> {
  try {
    const { db } = await import("core");
    const now = Date.now();
    const checkWindowMs = getCheckWindowMs();
    const minTime = now + (checkWindowMs - 2 * 60 * 1000); // 13 minutes ahead
    const maxTime = now + checkWindowMs; // 15 minutes ahead

    logger.debug("Running research pre-run job", {
      minTime: new Date(minTime).toISOString(),
      maxTime: new Date(maxTime).toISOString(),
    });

    // Query all users
    const usersSnapshot = await db.collection("users").get();
    let projectsToRun: Array<{ userId: string; project: Project }> = [];

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      // Query active projects where nextRunAt is between minTime and maxTime
      // AND preparedDeliveryLogId is null (no results prepared yet)
      const projectsSnapshot = await db
        .collection("users")
        .doc(userId)
        .collection("projects")
        .where("status", "==", "active")
        .where("nextRunAt", ">=", minTime)
        .where("nextRunAt", "<=", maxTime)
        .get();

      for (const projectDoc of projectsSnapshot.docs) {
        const project = {
          id: projectDoc.id,
          ...projectDoc.data(),
        } as Project;

        // Only include if no prepared delivery log
        if (!project.preparedDeliveryLogId) {
          projectsToRun.push({ userId, project });
        }
      }
    }

    if (projectsToRun.length === 0) {
      logger.debug("No projects need pre-run research");
      return;
    }

    logger.info(`Pre-running research for ${projectsToRun.length} projects`);

    // Execute research for each project
    for (const { userId, project } of projectsToRun) {
      try {
        const deliveryLogId = await executeProjectResearch(
          userId,
          project,
          "pending"
        );

        if (deliveryLogId) {
          // Update project with prepared delivery log ID
          await db
            .collection("users")
            .doc(userId)
            .collection("projects")
            .doc(project.id)
            .update({
              preparedDeliveryLogId: deliveryLogId,
              status: "active",
              researchStartedAt: null,
              updatedAt: Date.now(),
            });

          logger.info("Pre-run research completed and saved", {
            userId,
            projectId: project.id,
            deliveryLogId,
          });
        } else {
          // Research failed, just clear running status
          await db
            .collection("users")
            .doc(userId)
            .collection("projects")
            .doc(project.id)
            .update({
              status: "active",
              researchStartedAt: null,
              updatedAt: Date.now(),
            });
        }
      } catch (error: any) {
        logger.error("Pre-run research failed", {
          userId,
          projectId: project.id,
          error: error.message,
        });
      }
    }
  } catch (error: any) {
    logger.error("Research pre-run job failed", {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Delivery Job
 * Check for projects ready to deliver (have preparedDeliveryLogId)
 */
async function runDeliveryJob(): Promise<void> {
  try {
    const { db } = await import("core");
    const now = Date.now();

    logger.debug("Running delivery job");

    // Query all users
    const usersSnapshot = await db.collection("users").get();
    let projectsToDeliver: Array<{ userId: string; project: Project }> = [];

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      // Query active projects where nextRunAt <= now AND preparedDeliveryLogId is not null
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

        // Only include if has prepared delivery log
        if (project.preparedDeliveryLogId) {
          projectsToDeliver.push({ userId, project });
        }
      }
    }

    if (projectsToDeliver.length === 0) {
      logger.debug("No projects ready for delivery");
      return;
    }

    logger.info(`Delivering results for ${projectsToDeliver.length} projects`);

    // Import scheduling utility
    const { calculateNextRunAt } = await import("core/src/utils/scheduling");

    // Update delivery logs and projects
    for (const { userId, project } of projectsToDeliver) {
      try {
        // Update delivery log status from pending to success
        await db
          .collection("users")
          .doc(userId)
          .collection("projects")
          .doc(project.id)
          .collection("deliveryLogs")
          .doc(project.preparedDeliveryLogId!)
          .update({
            status: "success",
            deliveredAt: Date.now(),
          });

        // Calculate next run time
        const nextRunAt = calculateNextRunAt(
          project.frequency,
          project.deliveryTime,
          project.timezone,
          now
        );

        // Update project
        await db
          .collection("users")
          .doc(userId)
          .collection("projects")
          .doc(project.id)
          .update({
            lastRunAt: now,
            nextRunAt,
            preparedDeliveryLogId: null,
            updatedAt: Date.now(),
          });

        logger.info("Results delivered successfully", {
          userId,
          projectId: project.id,
          deliveryLogId: project.preparedDeliveryLogId,
          nextRunAt: new Date(nextRunAt).toISOString(),
        });
      } catch (error: any) {
        logger.error("Delivery failed", {
          userId,
          projectId: project.id,
          error: error.message,
        });
      }
    }
  } catch (error: any) {
    logger.error("Delivery job failed", {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Retry Job
 * Check for projects that are due but don't have prepared results
 */
async function runRetryJob(): Promise<void> {
  try {
    const { db } = await import("core");
    const now = Date.now();

    logger.debug("Running retry job");

    // Query all users
    const usersSnapshot = await db.collection("users").get();
    let projectsToRetry: Array<{ userId: string; project: Project }> = [];

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      // Query active projects where nextRunAt <= now AND preparedDeliveryLogId is null
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

        // Only include if no prepared delivery log (pre-run missed or failed)
        if (!project.preparedDeliveryLogId) {
          projectsToRetry.push({ userId, project });
        }
      }
    }

    if (projectsToRetry.length === 0) {
      logger.debug("No projects need retry research");
      return;
    }

    logger.info(`Retrying research for ${projectsToRetry.length} projects`);

    // Import scheduling utility
    const { calculateNextRunAt } = await import("core/src/utils/scheduling");

    // Execute research for each project immediately
    for (const { userId, project } of projectsToRetry) {
      try {
        const deliveryLogId = await executeProjectResearch(
          userId,
          project,
          "success"
        );

        if (deliveryLogId) {
          // Success - calculate next run time and update project
          const nextRunAt = calculateNextRunAt(
            project.frequency,
            project.deliveryTime,
            project.timezone,
            now
          );

          await db
            .collection("users")
            .doc(userId)
            .collection("projects")
            .doc(project.id)
            .update({
              lastRunAt: now,
              nextRunAt,
              status: "active",
              researchStartedAt: null,
              lastError: null,
              updatedAt: Date.now(),
            });

          logger.info("Retry research succeeded and delivered", {
            userId,
            projectId: project.id,
            deliveryLogId,
            nextRunAt: new Date(nextRunAt).toISOString(),
          });
        } else {
          // Failed - this is the second failure, create admin notification
          logger.error("Retry research failed - creating admin notification", {
            userId,
            projectId: project.id,
          });

          await createAdminNotification(
            userId,
            project,
            project.lastError || "Research execution failed",
            2
          );

          // Calculate next run time anyway to avoid retrying immediately
          const nextRunAt = calculateNextRunAt(
            project.frequency,
            project.deliveryTime,
            project.timezone,
            now
          );

          await db
            .collection("users")
            .doc(userId)
            .collection("projects")
            .doc(project.id)
            .update({
              lastRunAt: now,
              nextRunAt,
              status: "error",
              researchStartedAt: null,
              updatedAt: Date.now(),
            });
        }
      } catch (error: any) {
        logger.error("Retry research error", {
          userId,
          projectId: project.id,
          error: error.message,
        });
      }
    }
  } catch (error: any) {
    logger.error("Retry job failed", {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Main scheduler job - runs every minute
 */
async function runSchedulerJob(): Promise<void> {
  logger.info("Scheduler job started");
  const startTime = Date.now();

  try {
    // Run all three jobs in parallel
    await Promise.all([
      runResearchPrerunJob(),
      runDeliveryJob(),
      runRetryJob(),
    ]);

    const duration = Date.now() - startTime;
    logger.info("Scheduler job completed", {
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

  // Add Admin SDK credential requirement
  if (
    !process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    !process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ) {
    logger.error(
      "Missing Firebase Admin credentials. Set either FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY"
    );
    process.exit(1);
  }

  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
  if (missingVars.length > 0) {
    logger.error("Missing required environment variables", {
      missing: missingVars,
    });
    process.exit(1);
  }

  // Firebase Admin is automatically initialized by core package when imported
  logger.info("Firebase Admin SDK will be used (initialized by core package)");

  // Initialize providers at startup
  try {
    await initializeProviders();
  } catch (error: any) {
    logger.error("Failed to initialize providers, cannot start scheduler", {
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

  // Set up cron job to run every minute
  // Cron format: * * * * * = every minute
  const cronExpression = "* * * * *";

  logger.info("Setting up cron job", { schedule: cronExpression });

  cron.schedule(cronExpression, async () => {
    await runSchedulerJob();
  });

  logger.info("Scheduler service started successfully", {
    schedule: "Every minute",
    checkWindowMinutes: parseInt(
      process.env.SCHEDULER_CHECK_WINDOW_MINUTES || "15",
      10
    ),
    timezone: process.env.SCHEDULER_TIMEZONE || "UTC",
    providers: {
      llm: "OpenAI",
      search: "Brave Search",
    },
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
