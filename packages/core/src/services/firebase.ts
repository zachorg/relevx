/**
 * Firebase initialization
 *
 * This file initializes Firebase and exports auth and firestore instances.
 *
 * Environment-aware implementation:
 * - Uses Firebase Admin SDK (with full permissions) when running in Node.js server
 * - Uses Firebase Client SDK (with user auth) when running in browser/mobile
 *
 * Configuration is loaded from environment variables.
 * See env.example for required variables.
 */

// Load environment variables from .env file (for test scripts)
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Detect environment
// Check if running in Node.js (not browser)
const isNode =
  typeof process !== "undefined" &&
  process.versions != null &&
  process.versions.node != null;

let useAdminSDK = false;

// Type definitions for unified exports
type Auth = any; // Will be firebase/auth Auth or null for admin
type Firestore = any; // Will be firebase/firestore Firestore or firebase-admin Firestore

let auth: Auth = null;
let db: Firestore = null;
let initialized = false;

/**
 * Initialize Firebase (lazy initialization)
 * This function is called automatically when auth or db is first accessed
 */
function initializeFirebase(): void {
  if (initialized) {
    return;
  }

  initialized = true;

  const hasAdminCredentials =
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  useAdminSDK = !!(isNode && hasAdminCredentials);

  if (useAdminSDK) {
    // ============================================================================
    // SERVER-SIDE: Use Firebase Admin SDK
    // ============================================================================
    console.log("Initializing Firebase Admin SDK for server-side use");

    // Dynamic import to avoid bundling issues
    const admin = require("firebase-admin");

    try {
      // Check if app is already initialized
      if (admin.apps.length === 0) {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
          // Load from file
          const serviceAccount = require(process.env
            .FIREBASE_SERVICE_ACCOUNT_PATH);

          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: process.env.FIREBASE_PROJECT_ID,
          });

          console.log("Firebase Admin initialized with service account file");
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

          console.log("Firebase Admin initialized with environment variables");
        }
      }

      db = admin.firestore();

      // Configure Firestore settings
      db.settings({
        ignoreUndefinedProperties: true,
      });

      console.log("Firestore Admin initialized successfully");
    } catch (error: any) {
      console.error("Failed to initialize Firebase Admin:", error.message);
      throw error;
    }

    // Auth is not available in Admin SDK context
    auth = null;
  } else {
    // ============================================================================
    // CLIENT-SIDE: Use Firebase Client SDK
    // ============================================================================
    console.log("Initializing Firebase Client SDK for browser/mobile use");

    // Only import when needed (lazy loading)
    const { initializeApp, getApps } = require("firebase/app");
    const { getAuth } = require("firebase/auth");
    const { getFirestore } = require("firebase/firestore");

    // Load Firebase configuration from environment variables
    const firebaseConfig = {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
    };

    // Validate required environment variables
    const requiredEnvVars = [
      "FIREBASE_API_KEY",
      "FIREBASE_AUTH_DOMAIN",
      "FIREBASE_PROJECT_ID",
      "FIREBASE_STORAGE_BUCKET",
      "FIREBASE_MESSAGING_SENDER_ID",
      "FIREBASE_APP_ID",
    ];

    const missingEnvVars = requiredEnvVars.filter(
      (varName) => !process.env[varName]
    );

    if (missingEnvVars.length > 0) {
      throw new Error(
        `Missing required Firebase environment variables: ${missingEnvVars.join(
          ", "
        )}. Please check your .env file and env.example for reference.`
      );
    }

    // Initialize Firebase (only once)
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

    // Export auth and firestore instances
    auth = getAuth(app);
    db = getFirestore(app);

    console.log("Firebase Client SDK initialized successfully");
  }
}

// Use Proxy to provide lazy initialization
const authProxy = new Proxy(
  {},
  {
    get(target, prop) {
      if (!initialized) {
        initializeFirebase();
      }
      return auth ? (auth as any)[prop] : null;
    },
  }
) as Auth;

const dbProxy = new Proxy(
  {},
  {
    get(target, prop) {
      if (!initialized) {
        initializeFirebase();
      }
      if (!db) {
        throw new Error("Firestore not initialized");
      }
      return (db as any)[prop];
    },
    apply(target, thisArg, argumentsList) {
      if (!initialized) {
        initializeFirebase();
      }
      if (!db) {
        throw new Error("Firestore not initialized");
      }
      return (db as any).apply(thisArg, argumentsList);
    },
  }
) as Firestore;

// Export the proxied instances
export { authProxy as auth, dbProxy as db };

// Export a flag to check which SDK is being used
export { useAdminSDK as isUsingAdminSDK };
