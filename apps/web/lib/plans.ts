/**
 * Projects management for web app
 */

import {
    collection,
    doc,
    getDocs,
} from "firebase/firestore";
import { db } from "./firebase";

// Import types from core package
import type {
    PlanInfo
} from "core";

/**
 * Fetch all available plans
 */
export async function fetchPlans(): Promise<Array<PlanInfo>> {
    const plansRef = collection(db, "plans");
    const snapshot = await getDocs(plansRef);

    return snapshot.docs.map((doc) => ({
        ...(doc.data() as any as PlanInfo),
    }));
}

/**
 * Update an existing project
 */
export async function updateUserPlan(
    userId: string,
    projectId: string,
    data: any
): Promise<void> {
    const projectRef = doc(db, "users", userId, "projects", projectId);
}
