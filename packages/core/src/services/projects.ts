/**
 * Project CRUD service
 *
 * Handles all Firestore operations for projects.
 * Uses subcollection pattern: users/{userId}/projects/{projectId}
 */

import { db } from "./firebase";
import type { Project, NewProject, ProjectStatus } from "../models/project";
import { calculateNextRunAt as calculateNextRunAtWithTimezone } from "../utils/scheduling";

/**
 * Get the projects collection reference for a user
 */
function getProjectsCollection(userId: string) {
  return db.collection("users").doc(userId).collection("projects");
}

/**
 * Create a new project for a user
 */
export async function createProject(
  userId: string,
  data: Omit<NewProject, "userId">
): Promise<Project> {
  try {
    const now = Date.now();

    // Set default settings if not provided
    const settings = data.settings || {
      relevancyThreshold: 60,
      minResults: 5,
      maxResults: 20,
    };

    const projectData: Omit<Project, "id"> = {
      userId,
      title: data.title,
      description: data.description,
      frequency: data.frequency,
      resultsDestination: data.resultsDestination,
      deliveryTime: data.deliveryTime,
      timezone: data.timezone,
      searchParameters: data.searchParameters,
      settings,
      deliveryConfig: data.deliveryConfig,
      status: "draft", // New projects start as draft
      nextRunAt: calculateNextRunAtWithTimezone(
        data.frequency,
        data.deliveryTime,
        data.timezone
      ),
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await getProjectsCollection(userId).add(projectData);

    return {
      id: docRef.id,
      ...projectData,
    };
  } catch (error) {
    console.error("Error creating project:", error);
    throw error;
  }
}

/**
 * List all projects for a user (one-time fetch)
 */
export async function listProjects(userId: string): Promise<Project[]> {
  try {
    const snapshot = await getProjectsCollection(userId)
      .orderBy("createdAt", "desc")
      .get();

    return snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    })) as Project[];
  } catch (error) {
    console.error("Error listing projects:", error);
    throw error;
  }
}

/**
 * Subscribe to projects for a user (real-time updates)
 * Returns an unsubscribe function
 */
export function subscribeToProjects(
  userId: string,
  callback: (projects: Project[]) => void
): () => void {
  return getProjectsCollection(userId)
    .orderBy("createdAt", "desc")
    .onSnapshot(
      (snapshot: any) => {
        const projects = snapshot.docs.map((doc: any) => ({
          id: doc.id,
          ...doc.data(),
        })) as Project[];
        callback(projects);
      },
      (error: any) => {
        console.error("Error subscribing to projects:", error);
      }
    );
}

/**
 * Update project status
 */
export async function updateProjectStatus(
  userId: string,
  projectId: string,
  status: ProjectStatus
): Promise<void> {
  try {
    const projectRef = db
      .collection("users")
      .doc(userId)
      .collection("projects")
      .doc(projectId);
    await projectRef.update({
      status,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error("Error updating project status:", error);
    throw error;
  }
}

/**
 * Update project execution tracking after a research run
 */
export async function updateProjectExecution(
  userId: string,
  projectId: string,
  updates: {
    status?: ProjectStatus;
    lastRunAt?: number;
    nextRunAt?: number;
    lastError?: string;
  }
): Promise<void> {
  try {
    const projectRef = db
      .collection("users")
      .doc(userId)
      .collection("projects")
      .doc(projectId);
    await projectRef.update({
      ...updates,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error("Error updating project execution:", error);
    throw error;
  }
}

/**
 * Activate a project (change from draft to active)
 */
export async function activateProject(
  userId: string,
  projectId: string
): Promise<void> {
  try {
    const projectRef = db
      .collection("users")
      .doc(userId)
      .collection("projects")
      .doc(projectId);
    await projectRef.update({
      status: "active",
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error("Error activating project:", error);
    throw error;
  }
}
