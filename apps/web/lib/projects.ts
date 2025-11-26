/**
 * Projects management for web app
 */

import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { calculateNextRunAt } from "core/utils";

// Import types from core package
export type {
  Project,
  NewProject,
  Frequency,
  ResultsDestination,
  ProjectStatus,
  SearchParameters,
  ProjectSettings,
} from "core";

/**
 * Subscribe to real-time updates for a user's projects
 */
export function subscribeToProjects(
  userId: string,
  callback: (projects: any[]) => void
): Unsubscribe {
  // Projects are stored as a subcollection under each user
  const q = query(
    collection(db, "users", userId, "projects"),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const projects: any[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      projects.push({
        id: doc.id,
        ...data,
        // Convert timestamps to numbers for consistency with core model
        createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
        updatedAt: data.updatedAt?.toMillis?.() || data.updatedAt || Date.now(),
      });
    });
    callback(projects);
  });
}

/**
 * Create a new project
 */
export async function createProject(
  userId: string,
  data: {
    title: string;
    description: string;
    frequency: string;
    resultsDestination: string;
    deliveryTime: string;
    timezone: string;
    searchParameters?: any;
  }
): Promise<any> {
  const now = Date.now();

  // Calculate next run time based on frequency, delivery time, and timezone
  const nextRunAt = calculateNextRunAt(
    data.frequency as any,
    data.deliveryTime,
    data.timezone
  );

  const projectData: any = {
    userId,
    title: data.title,
    description: data.description,
    frequency: data.frequency,
    resultsDestination: data.resultsDestination,
    deliveryTime: data.deliveryTime,
    timezone: data.timezone,
    status: "active",
    nextRunAt,
    settings: {
      relevancyThreshold: 70,
      minResults: 5,
      maxResults: 20,
    },
    createdAt: now,
    updatedAt: now,
  };

  // Include searchParameters if provided
  if (data.searchParameters) {
    projectData.searchParameters = data.searchParameters;
  }

  // Store project in user's subcollection
  const docRef = await addDoc(
    collection(db, "users", userId, "projects"),
    projectData
  );

  return {
    id: docRef.id,
    ...projectData,
  };
}

/**
 * Update an existing project
 */
export async function updateProject(
  userId: string,
  projectId: string,
  data: any
): Promise<void> {
  const projectRef = doc(db, "users", userId, "projects", projectId);
  await updateDoc(projectRef, {
    ...data,
    updatedAt: Date.now(),
  });
}

/**
 * Toggle project active status
 */
export async function toggleProjectActive(
  userId: string,
  projectId: string,
  status: string
): Promise<void> {
  const projectRef = doc(db, "users", userId, "projects", projectId);
  await updateDoc(projectRef, {
    status,
    updatedAt: Date.now(),
  });
}

/**
 * Delete a project
 */
export async function deleteProject(
  userId: string,
  projectId: string
): Promise<void> {
  const projectRef = doc(db, "users", userId, "projects", projectId);
  await deleteDoc(projectRef);
}
