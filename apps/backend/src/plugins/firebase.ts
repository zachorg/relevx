import fp from "fastify-plugin";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { join } from "path";

export default fp(async (app: any) => {
  // Read Firebase service account from file
  const serviceAccountPath = join(process.cwd(), 'secrets', 'relevx-service-account.json');
  let serviceAccountJson;

  try {
    const serviceAccountFile = readFileSync(serviceAccountPath, 'utf8');
    serviceAccountJson = JSON.parse(serviceAccountFile);
  } catch (error) {
    throw new Error(`Failed to read Firebase service account from ${serviceAccountPath}: ${error instanceof Error ? error.message : String(error)}. Please ensure the file exists and contains valid JSON.`);
  }

  // Initialize Firebase Admin with service account credentials
  const firebaseApp = initializeApp({
    credential: cert(serviceAccountJson),
    projectId: serviceAccountJson.project_id,
  });

  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);

  if (!auth || !db) {
    throw new Error("Failed to initialize Firebase Admin");
  }
  else {
    console.log("Firebase Admin initialized successfully");
  }

  app.decorate("firebase", { auth, db });

  app.decorate("introspectIdToken", async (token: string) => {
    try {
      const authToken = token.startsWith("Bearer ") ? token.slice(7).trim() : token;
      const decodedToken = await auth.verifyIdToken(authToken);
      const uid = decodedToken.uid;
      const email = decodedToken.email;
      const emailVerified = decodedToken.email_verified || false;

      // let user: any;
      let plan: any;
      try {
        // Get user document from Firestore
        const userDoc = await db.collection("users").doc(uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();

          // Get plan if user has one
          if (userData?.plan_id) {
            const planDoc = await db.collection("plans").doc(userData.plan_id).get();
            if (planDoc.exists) {
              const planData = planDoc.data();
              if (planData) {
                plan = planData;
              }
            }
          }
        }
      } catch (error) {
        // Log error but don't fail authentication
        app.log.warn({ error, uid }, "Failed to fetch user data from Firestore");
      }

      return {
        user: {
          uid,
          email,
          emailVerified,
          plan,
        }
      };
    } catch (error) {
      throw new Error(`Invalid Firebase ID token (${token}): ${error instanceof Error ? error.message : String(error)}`);
    }
  });
});
