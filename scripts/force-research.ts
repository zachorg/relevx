/**
 * Force Research Run Script
 *
 * Forces a research run on a project by ID, regardless of when it's scheduled to run.
 * Useful for testing research functionality and debugging issues.
 *
 * Usage:
 *   pnpm tsx scripts/force-research.ts <projectId> <userId>
 *
 * Example:
 *   pnpm tsx scripts/force-research.ts abc123 user_xyz789
 *
 * Environment variables required:
 *   OPENAI_API_KEY
 *   BRAVE_SEARCH_API_KEY
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_ADMIN_CLIENT_EMAIL (or FIREBASE_SERVICE_ACCOUNT_PATH)
 *   FIREBASE_ADMIN_PRIVATE_KEY (or FIREBASE_SERVICE_ACCOUNT_PATH)
 *   RESEND_API_KEY (for email delivery)
 *   RESEND_FROM_EMAIL (for email delivery)
 */

// Load environment variables from .env file
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

import {
  executeResearchForProject,
  setDefaultProviders,
  db,
} from "../packages/core/src";
import { createOpenAIProvider } from "../packages/core/src/services/llm";
import { createBraveSearchProvider } from "../packages/core/src/services/search";
import { sendReportEmail } from "../packages/core/src/services/email";
import type { Project } from "../packages/core/src";

/**
 * Force research execution for a project
 */
async function forceResearch(
  userId: string,
  projectId: string,
  options?: {
    maxIterations?: number;
    skipScheduleCheck?: boolean;
    markAsDelivered?: boolean;
  }
): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("  FORCE RESEARCH RUN");
  console.log("=".repeat(60) + "\n");

  const skipScheduleCheck = options?.skipScheduleCheck ?? true;
  const markAsDelivered = options?.markAsDelivered ?? false;
  const maxIterations = options?.maxIterations ?? 3;

  console.log(`User ID:        ${userId}`);
  console.log(`Project ID:     ${projectId}`);
  console.log(`Max Iterations: ${maxIterations}`);
  console.log(
    `Skip Schedule:  ${skipScheduleCheck ? "Yes (force run now)" : "No"}`
  );
  console.log(
    `Mark Delivered: ${markAsDelivered ? "Yes (mark as success)" : "No (mark as pending)"}\n`
  );

  const startTime = Date.now();

  try {
    // 1. Load project to verify it exists
    console.log("📋 Loading project...");
    const projectRef = db
      .collection("users")
      .doc(userId)
      .collection("projects")
      .doc(projectId);

    const projectDoc = await projectRef.get();

    if (!projectDoc.exists) {
      throw new Error(`Project not found: ${projectId} for user ${userId}`);
    }

    const project = {
      id: projectDoc.id,
      ...projectDoc.data(),
    } as Project;

    console.log(`✓ Project found: "${project.title}"`);
    console.log(`  Status:      ${project.status}`);
    console.log(`  Frequency:   ${project.frequency}`);
    if (project.nextRunAt) {
      console.log(
        `  Next Run:    ${new Date(project.nextRunAt).toISOString()}`
      );
    }
    if (project.lastRunAt) {
      console.log(
        `  Last Run:    ${new Date(project.lastRunAt).toISOString()}`
      );
    }

    console.log();

    // 1.5 Load user to get email for delivery fallback
    console.log("👤 Loading user profile...");
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    let userEmail: string | undefined;

    if (userDoc.exists) {
      const userData = userDoc.data();
      userEmail = userData?.email;
      if (userEmail) {
        console.log(`✓ User found: ${userEmail}\n`);
      } else {
        console.log("⚠️ User found but no email address in profile\n");
      }
    } else {
      console.log("⚠️ User profile not found\n");
    }

    // 2. Update project status to running
    console.log("🔄 Updating project status to running...");
    await projectRef.update({
      status: "running",
      researchStartedAt: Date.now(),
      updatedAt: Date.now(),
    });
    console.log("✓ Status updated\n");

    // 3. Execute research
    console.log("🔍 Executing research...\n");
    console.log("-".repeat(60));

    const result = await executeResearchForProject(userId, projectId, {
      maxIterations,
      ignoreFrequencyCheck: skipScheduleCheck,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("-".repeat(60));
    console.log("\n" + "=".repeat(60));
    console.log("  RESEARCH RESULTS");
    console.log("=".repeat(60) + "\n");

    console.log(`Status:     ${result.success ? "✓ SUCCESS" : "✗ FAILED"}`);
    console.log(`Duration:   ${duration}s`);
    console.log(`Iterations: ${result.iterationsUsed}\n`);

    console.log("Queries:");
    console.log(`  Generated: ${result.queriesGenerated.length}`);
    console.log(`  Executed:  ${result.queriesExecuted.length}\n`);

    console.log("URLs:");
    console.log(`  Fetched:     ${result.urlsFetched}`);
    console.log(`  Successful:  ${result.urlsSuccessful}`);
    console.log(`  Relevant:    ${result.urlsRelevant}\n`);

    console.log("Results:");
    console.log(`  Total Analyzed:       ${result.totalResultsAnalyzed}`);
    console.log(`  Included in Report:   ${result.relevantResults.length}\n`);

    if (result.relevantResults.length > 0) {
      console.log("Top Results:");
      result.relevantResults.slice(0, 5).forEach((r, idx) => {
        console.log(
          `  ${idx + 1}. [${r.relevancyScore}] ${r.metadata.title}`
        );
        console.log(`     ${r.url}`);
      });
      console.log();
    }

    if (result.report) {
      console.log("Report:");
      console.log(`  Title:         ${result.report.title}`);
      console.log(`  Result Count:  ${result.relevantResults.length}`);
      console.log(`  Average Score: ${result.report.averageScore}\n`);
    }

    if (result.deliveryLogId) {
      console.log(`Delivery Log ID: ${result.deliveryLogId}\n`);

      // 4. Send email if configured and requested
      // NOTE: executeResearchForProject now handles email sending internally, 
      // so we don't need to send it again here.
      
      const deliveryEmail = project.deliveryConfig?.email?.address || userEmail;
      
      if (result.report && !deliveryEmail) {
        console.log(
          `⚠️  Email not configured. Set deliveryConfig.email.address in project settings or ensure user profile has an email.\n`
        );
      }


      // 5. Update delivery log status if needed
      if (markAsDelivered) {
        console.log("📨 Marking delivery log as delivered...");
        const deliveryLogRef = projectRef
          .collection("deliveryLogs")
          .doc(result.deliveryLogId);

        await deliveryLogRef.update({
          status: "success",
          deliveredAt: Date.now(),
        });
        console.log("✓ Delivery log marked as delivered\n");
      } else {
        console.log("📋 Setting delivery log to pending status...");
        const deliveryLogRef = projectRef
          .collection("deliveryLogs")
          .doc(result.deliveryLogId);

        await deliveryLogRef.update({
          status: "pending",
          preparedAt: Date.now(),
          deliveredAt: null,
        });
        console.log("✓ Delivery log marked as pending\n");
      }
    }

    // 5. Update project status back to active
    console.log("✅ Updating project status to active...");
    const updates: any = {
      status: "active",
      researchStartedAt: null,
      lastError: null,
      updatedAt: Date.now(),
    };

    if (!markAsDelivered && result.deliveryLogId) {
      // Store prepared delivery log for later delivery
      updates.preparedDeliveryLogId = result.deliveryLogId;
    }

    await projectRef.update(updates);
    console.log("✓ Project status updated\n");

    // 6. Show summary
    console.log("=".repeat(60));
    console.log("  SUMMARY");
    console.log("=".repeat(60) + "\n");
    console.log(
      `Research completed successfully in ${duration}s with ${result.relevantResults.length} relevant results.`
    );
    if (!markAsDelivered && result.deliveryLogId) {
      console.log(
        `Results are ready but marked as pending. They will be delivered at the scheduled time.`
      );
    } else if (markAsDelivered) {
      console.log(`Results have been marked as delivered.`);
    }
    console.log();

    if (result.error) {
      console.error(`\n  Error: ${result.error}\n`);
    }
  } catch (error: any) {
    console.error("\n" + "=".repeat(60));
    console.error("  ERROR");
    console.error("=".repeat(60) + "\n");
    console.error(error.message);
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }

    // Try to update project status to error
    try {
      const projectRef = db
        .collection("users")
        .doc(userId)
        .collection("projects")
        .doc(projectId);

      await projectRef.update({
        status: "error",
        lastError: error.message,
        researchStartedAt: null,
        updatedAt: Date.now(),
      });
      console.error("\n✓ Project status updated to error\n");
    } catch (updateError) {
      console.error("\n✗ Failed to update project status\n");
    }

    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Check arguments
  if (args.length < 2) {
    console.error("\n✗ Error: Missing required arguments\n");
    console.error("Usage:");
    console.error(
      "  pnpm tsx scripts/force-research.ts <projectId> <userId>\n"
    );
    console.error("Example:");
    console.error(
      "  pnpm tsx scripts/force-research.ts abc123 user_xyz789\n"
    );
    console.error("Options:");
    console.error("  --delivered     Mark results as delivered immediately");
    console.error("  --iterations=N  Set max iterations (default: 3)\n");
    process.exit(1);
  }

  const [projectId, userId] = args;

  // Parse options
  const markAsDelivered = args.includes("--delivered");
  const iterationsArg = args.find((arg) => arg.startsWith("--iterations="));
  const maxIterations = iterationsArg
    ? parseInt(iterationsArg.split("=")[1], 10)
    : 3;

  // Validate environment variables
  const requiredEnvVars = [
    "OPENAI_API_KEY",
    "BRAVE_SEARCH_API_KEY",
    "FIREBASE_PROJECT_ID",
  ];

  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
  if (missingVars.length > 0) {
    console.error("\n✗ Error: Missing required environment variables\n");
    console.error("Missing:");
    missingVars.forEach((v) => console.error(`  - ${v}`));
    console.error("\nPlease set these in your .env file.\n");
    process.exit(1);
  }

  // Check Firebase Admin credentials
  if (
    !process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    !process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ) {
    console.error("\n✗ Error: Missing Firebase Admin credentials\n");
    console.error(
      "Set either FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY\n"
    );
    process.exit(1);
  }

  // Initialize providers
  console.log("\n✓ Initializing providers...");
  const openaiKey = process.env.OPENAI_API_KEY!;
  const braveKey = process.env.BRAVE_SEARCH_API_KEY!;

  const llmProvider = createOpenAIProvider(openaiKey);
  const searchProvider = createBraveSearchProvider(braveKey);
  setDefaultProviders(llmProvider, searchProvider);
  console.log("✓ Providers initialized (OpenAI + Brave Search)");

  try {
    await forceResearch(userId, projectId, {
      maxIterations,
      markAsDelivered,
    });

    console.log("=".repeat(60));
    console.log("  ✓ FORCE RESEARCH COMPLETED SUCCESSFULLY");
    console.log("=".repeat(60) + "\n");
  } catch (error: any) {
    console.error("\n=".repeat(60));
    console.error("  ✗ FORCE RESEARCH FAILED");
    console.error("=".repeat(60) + "\n");
    console.error("Error:", error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
