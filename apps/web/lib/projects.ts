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
  const q = query(
    collection(db, "projects"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const projects: Project[] = [];
    snapshot.forEach((doc) => {
      projects.push({ id: doc.id, ...doc.data() } as Project);
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

  const docRef = await addDoc(collection(db, "projects"), projectData);

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
  projectId: string,
  data: Partial<NewProject>
): Promise<void> {
  const projectRef = doc(db, "projects", projectId);
  await updateDoc(projectRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Toggle project active status
 */
export async function toggleProjectActive(
  projectId: string,
  isActive: boolean
): Promise<void> {
  const projectRef = doc(db, "projects", projectId);
  await updateDoc(projectRef, {
    isActive,
    updatedAt: serverTimestamp(),
  });
}
