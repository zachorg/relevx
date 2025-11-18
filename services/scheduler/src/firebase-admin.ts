/**
 * Firebase Admin SDK initialization for server-side operations
 *
 * This allows the scheduler to query Firestore without user authentication.
 */

import * as admin from "firebase-admin";
import { logger } from "./logger";

let db: admin.firestore.Firestore | null = null;

/**
 * Initialize Firebase Admin SDK
 */
export function initializeFirebaseAdmin(): admin.firestore.Firestore {
  if (db) {
    return db;
  }

  try {
    // Check if app is already initialized
    if (admin.apps.length === 0) {
      // Initialize with service account from environment or file
      if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        // Load from file
        const serviceAccount = require(process.env
          .FIREBASE_SERVICE_ACCOUNT_PATH);

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID,
        });

        logger.info("Firebase Admin initialized with service account file");
      } else if (
        process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
        process.env.FIREBASE_ADMIN_PRIVATE_KEY
      ) {
        // Load from environment variables
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

        logger.info("Firebase Admin initialized with environment variables");
      } else {
        throw new Error(
          "Missing Firebase Admin credentials. Set either FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY"
        );
      }
    }

    db = admin.firestore();

    // Configure Firestore settings
    db.settings({
      ignoreUndefinedProperties: true,
    });

    logger.info("Firestore initialized successfully");

    return db;
  } catch (error: any) {
    logger.error("Failed to initialize Firebase Admin", {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get Firestore instance (must be initialized first)
 */
export function getFirestore(): admin.firestore.Firestore {
  if (!db) {
    throw new Error(
      "Firebase Admin not initialized. Call initializeFirebaseAdmin() first"
    );
  }
  return db;
}
