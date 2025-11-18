/**
 * Test Script: Add Mock Project to Firestore
 *
 * Creates a test project in Firestore that will be picked up by the scheduler
 * at the next closest 15-minute increment.
 *
 * Usage:
 *   pnpm tsx services/scheduler/scripts/add-test-project.ts [userId] [--now]
 *
 * Options:
 *   --now    Set nextRunAt to current time (scheduler picks it up immediately)
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as admin from "firebase-admin";

// Load environment variables from scheduler's .env file
dotenv.config({ path: path.join(__dirname, "..", ".env") });

/**
 * Calculate the next 15-minute increment from now
 */
function getNext15MinIncrement(): number {
  const now = new Date();
  const minutes = now.getMinutes();

  // If we're already on a 15-minute mark or past it, find the next one
  const currentQuarter = Math.floor(minutes / 15);
  const nextQuarter = (currentQuarter + 1) % 4;

  // Create a new date at the next 15-minute mark
  const nextRun = new Date(now);

  if (nextQuarter === 0) {
    // Wrap to next hour
    nextRun.setHours(nextRun.getHours() + 1);
    nextRun.setMinutes(0);
  } else {
    nextRun.setMinutes(nextQuarter * 15);
  }

  nextRun.setSeconds(0);
  nextRun.setMilliseconds(0);

  return nextRun.getTime();
}

/**
 * Get delivery time in HH:MM format for the next 15-minute increment
 */
function getDeliveryTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Initialize Firebase Admin
 */
function initializeFirebase(): admin.firestore.Firestore {
  if (admin.apps.length > 0) {
    return admin.firestore();
  }

  try {
    if (
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
      process.env.FIREBASE_ADMIN_PRIVATE_KEY
    ) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(
            /\\n/g,
            "\n"
          ),
        }),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });

      console.log("✓ Firebase Admin initialized with environment variables");
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });

      console.log("✓ Firebase Admin initialized with service account file");
    } else {
      throw new Error(
        "Missing Firebase Admin credentials. Set either FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY"
      );
    }

    const db = admin.firestore();
    db.settings({ ignoreUndefinedProperties: true });

    return db;
  } catch (error: any) {
    console.error("✗ Failed to initialize Firebase:", error.message);
    process.exit(1);
  }
}

/**
 * Create a mock project
 */
async function createMockProject(
  userId: string,
  runNow: boolean
): Promise<void> {
  const db = initializeFirebase();
  const now = Date.now();

  // Set nextRunAt based on --now flag
  const nextRunAt = runNow ? now : getNext15MinIncrement();
  const deliveryTime = getDeliveryTime(nextRunAt);

  // Create mock project data
  const mockProject = {
    userId,
    title: "Test Research Project - AI Industry News",
    description:
      "Automated test project to track latest developments in artificial intelligence, machine learning, and LLM technologies",
    frequency: "daily" as const,
    resultsDestination: "email" as const,
    deliveryTime,
    timezone: "America/New_York",
    searchParameters: {
      priorityDomains: ["techcrunch.com", "theverge.com", "arstechnica.com"],
      dateRangePreference: "last_24h" as const,
      language: "en",
      region: "US",
      requiredKeywords: ["AI", "artificial intelligence"],
    },
    settings: {
      relevancyThreshold: 70,
      minResults: 5,
      maxResults: 20,
    },
    deliveryConfig: {
      email: {
        address: "test@example.com",
        subject: "Your Daily AI Research Digest",
      },
    },
    status: "active" as const,
    nextRunAt,
    createdAt: now,
    updatedAt: now,
  };

  try {
    // Ensure user document exists
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log("\n⚠️  User document doesn't exist, creating it...");
      await userRef.set({
        email: `${userId}@test.example.com`,
        createdAt: now,
        updatedAt: now,
      });
      console.log("✓ User document created");
    } else {
      console.log("\n✓ User document already exists");
    }

    // Add project to Firestore
    const projectRef = await db
      .collection("users")
      .doc(userId)
      .collection("projects")
      .add(mockProject);

    console.log("\n✓ Mock project created successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Project Details:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  User ID:          ${userId}`);
    console.log(`  Project ID:       ${projectRef.id}`);
    console.log(`  Title:            ${mockProject.title}`);
    console.log(`  Frequency:        ${mockProject.frequency}`);
    console.log(
      `  Delivery Time:    ${mockProject.deliveryTime} ${mockProject.timezone}`
    );
    console.log(`  Status:           ${mockProject.status}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Scheduling:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  Current Time:     ${new Date(now).toISOString()}`);
    console.log(`  Next Run At:      ${new Date(nextRunAt).toISOString()}`);

    const minutesUntil = Math.round((nextRunAt - now) / 1000 / 60);
    if (minutesUntil <= 0) {
      console.log(
        `  Time Until Run:   DUE NOW (scheduler will pick up immediately)`
      );
    } else {
      console.log(`  Time Until Run:   ${minutesUntil} minutes`);
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\nScheduler Query Check:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(
      `  status == "active":  ${mockProject.status === "active" ? "✓" : "✗"}`
    );
    console.log(
      `  nextRunAt <= now:    ${mockProject.nextRunAt <= now ? "✓" : "✗"}`
    );
    console.log(
      `  Will be picked up:   ${
        mockProject.status === "active" && mockProject.nextRunAt <= now
          ? "✓ YES"
          : "✗ Not yet"
      }`
    );
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    console.log("\nImportant: Firestore Composite Index Required!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("The scheduler query requires a composite index:");
    console.log("  Collection: projects");
    console.log("  Fields: status (Ascending), nextRunAt (Ascending)");
    console.log("\nIf not created, create it in Firebase Console:");
    console.log("  Firestore Database > Indexes > Create Index");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    console.log("\nNext Steps:");
    console.log("  1. Ensure composite index exists in Firestore");
    console.log("  2. Start scheduler: pnpm --filter scheduler dev");
    console.log("  3. Check projects: pnpm test:list-projects");
    console.log("  4. Watch scheduler logs for execution");
  } catch (error: any) {
    console.error("\n✗ Failed to create mock project:", error.message);
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  console.log("\n🧪 Mock Project Creation Script");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Parse command line arguments
  const args = process.argv.slice(2);
  const runNow = args.includes("--now");
  const userId = args.find((arg) => !arg.startsWith("--")) || "test-user-123";

  if (args.length > 0 && !args[0].startsWith("--")) {
    console.log(`Using provided User ID: ${userId}`);
  } else {
    console.log(`No User ID provided, using default: ${userId}`);
  }

  if (runNow) {
    console.log("Mode: RUN NOW (nextRunAt set to current time)");
  } else {
    console.log("Mode: Next 15-min increment");
  }

  console.log("Usage: pnpm tsx scripts/add-test-project.ts [userId] [--now]\n");

  // Validate required environment variables
  const requiredEnvVars = ["FIREBASE_PROJECT_ID"];
  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

  if (missingVars.length > 0) {
    console.error("✗ Missing required environment variables:");
    missingVars.forEach((v) => console.error(`  - ${v}`));
    console.error("\nMake sure you have a .env file in services/scheduler/");
    process.exit(1);
  }

  if (
    !process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    !process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ) {
    console.error("✗ Missing Firebase Admin credentials");
    console.error(
      "  Set either FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY"
    );
    process.exit(1);
  }

  await createMockProject(userId, runNow);

  process.exit(0);
}

// Run the script
main().catch((error) => {
  console.error("\n✗ Script failed:", error.message);
  process.exit(1);
});
