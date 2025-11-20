/**
 * Debug Script: List All Projects in Firestore
 *
 * Lists all projects with their scheduling information to help debug
 * why the scheduler might not be picking them up.
 *
 * Usage:
 *   pnpm tsx services/scheduler/scripts/list-projects.ts [userId]
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as admin from "firebase-admin";

// Load environment variables from scheduler's .env file
dotenv.config({ path: path.join(__dirname, "..", ".env") });

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
 * Format timestamp for display
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toISOString();
}

/**
 * Check if project is due
 */
function isDue(nextRunAt: number | undefined, now: number): string {
  if (!nextRunAt) return "NO SCHEDULE";
  if (nextRunAt <= now) return "DUE NOW";
  const minutesUntil = Math.round((nextRunAt - now) / 1000 / 60);
  return `in ${minutesUntil} min`;
}

/**
 * List all projects for a specific user
 */
async function listUserProjects(
  db: admin.firestore.Firestore,
  userId: string
): Promise<void> {
  console.log(`\n📋 Projects for user: ${userId}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const projectsSnapshot = await db
    .collection("users")
    .doc(userId)
    .collection("projects")
    .get();

  if (projectsSnapshot.empty) {
    console.log("  No projects found");
    return;
  }

  const now = Date.now();

  projectsSnapshot.docs.forEach((doc, index) => {
    const data = doc.data();
    console.log(`\n[${index + 1}] Project ID: ${doc.id}`);
    console.log(`    Title:       ${data.title || "N/A"}`);
    console.log(`    Status:      ${data.status || "N/A"}`);
    console.log(`    Frequency:   ${data.frequency || "N/A"}`);
    console.log(
      `    Next Run:    ${
        data.nextRunAt ? formatTimestamp(data.nextRunAt) : "Not set"
      }`
    );
    console.log(
      `    Last Run:    ${
        data.lastRunAt ? formatTimestamp(data.lastRunAt) : "Never"
      }`
    );
    console.log(`    Due Status:  ${isDue(data.nextRunAt, now)}`);

    // Show if it would match the scheduler query
    const wouldMatch =
      data.status === "active" && data.nextRunAt && data.nextRunAt <= now;
    console.log(
      `    Scheduler:   ${wouldMatch ? "✓ WILL PICK UP" : "✗ Won't pick up"}`
    );

    if (!wouldMatch) {
      if (data.status !== "active") {
        console.log(
          `               (status is '${data.status}', needs 'active')`
        );
      }
      if (!data.nextRunAt) {
        console.log(`               (nextRunAt not set)`);
      }
      if (data.nextRunAt && data.nextRunAt > now) {
        console.log(`               (nextRunAt is in the future)`);
      }
    }
  });

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

/**
 * List all users and their projects
 */
async function listAllProjects(db: admin.firestore.Firestore): Promise<void> {
  console.log("\n📋 All Projects in Firestore");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const usersSnapshot = await db.collection("users").get();

  if (usersSnapshot.empty) {
    console.log("  No users found");
    return;
  }

  console.log(`\nFound ${usersSnapshot.size} user(s)\n`);

  for (const userDoc of usersSnapshot.docs) {
    await listUserProjects(db, userDoc.id);
  }
}

/**
 * Test the scheduler query
 */
async function testSchedulerQuery(
  db: admin.firestore.Firestore
): Promise<void> {
  console.log("\n🔍 Testing Scheduler Query");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const now = Date.now();
  console.log(`Current time: ${formatTimestamp(now)}\n`);
  console.log("Query: status == 'active' AND nextRunAt <= now\n");

  const usersSnapshot = await db.collection("users").get();
  let totalDue = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;

    const projectsSnapshot = await db
      .collection("users")
      .doc(userId)
      .collection("projects")
      .where("status", "==", "active")
      .where("nextRunAt", "<=", now)
      .get();

    if (!projectsSnapshot.empty) {
      console.log(`User ${userId}: ${projectsSnapshot.size} due project(s)`);
      projectsSnapshot.forEach((doc) => {
        const data = doc.data();
        console.log(`  - ${doc.id}: ${data.title}`);
        totalDue++;
      });
    }
  }

  if (totalDue === 0) {
    console.log("No projects found that match the scheduler query.");
    console.log(
      "\nThis means the scheduler would not execute any projects right now."
    );
  } else {
    console.log(
      `\nTotal: ${totalDue} project(s) would be executed by the scheduler.`
    );
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

/**
 * Main function
 */
async function main() {
  console.log("\n🔍 Firestore Projects Diagnostic Tool");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const db = initializeFirebase();
  const specificUserId = process.argv[2];

  if (specificUserId) {
    console.log(`\nListing projects for specific user: ${specificUserId}`);
    await listUserProjects(db, specificUserId);
  } else {
    await listAllProjects(db);
  }

  // Always test the scheduler query
  await testSchedulerQuery(db);

  process.exit(0);
}

// Run the script
main().catch((error) => {
  console.error("\n✗ Script failed:", error.message);
  console.error(error.stack);
  process.exit(1);
});
