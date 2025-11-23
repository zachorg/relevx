/**
 * Projects management for web app
 */

import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export type Frequency = "daily" | "weekly" | "monthly";
export type ResultsDestination = "email" | "slack" | "none";

export interface Project {
  id: string;
  userId: string;
  title: string;
  description: string;
  frequency: Frequency;
  resultsDestination: ResultsDestination;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NewProject {
  title: string;
  description: string;
  frequency: Frequency;
  resultsDestination: ResultsDestination;
}

/**
 * Subscribe to real-time updates for a user's projects
 */
export function subscribeToProjects(
  userId: string,
  callback: (projects: Project[]) => void
): Unsubscribe {
  // Projects are stored as a subcollection under each user
  const q = query(
    collection(db, "users", userId, "projects"),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const projects: Project[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      projects.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      } as Project);
    });
    callback(projects);
  });
}

/**
 * Create a new project
 */
export async function createProject(
  userId: string,
  data: NewProject
): Promise<Project> {
  const projectData = {
    ...data,
    userId,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // Store project in user's subcollection
  const docRef = await addDoc(
    collection(db, "users", userId, "projects"),
    projectData
  );

  return {
    id: docRef.id,
    ...projectData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Project;
}

/**
 * Update an existing project
 */
export async function updateProject(
  userId: string,
  projectId: string,
  data: Partial<NewProject>
): Promise<void> {
  const projectRef = doc(db, "users", userId, "projects", projectId);
  await updateDoc(projectRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Toggle project active status
 */
export async function toggleProjectActive(
  userId: string,
  projectId: string,
  isActive: boolean
): Promise<void> {
  const projectRef = doc(db, "users", userId, "projects", projectId);
  await updateDoc(projectRef, {
    isActive,
    updatedAt: serverTimestamp(),
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
