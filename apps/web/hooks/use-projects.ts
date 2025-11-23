/**
 * useProjects hook for web app
 */

import { useState, useEffect, useCallback } from "react";
import type { Project, NewProject } from "@/lib/projects";
import {
  subscribeToProjects,
  createProject as createProjectService,
  updateProject as updateProjectService,
  toggleProjectActive as toggleProjectActiveService,
} from "@/lib/projects";

interface UseProjectsResult {
  projects: Project[];
  loading: boolean;
  error: string | null;
  createProject: (data: NewProject) => Promise<Project | null>;
  updateProject: (
    projectId: string,
    data: Partial<NewProject>
  ) => Promise<boolean>;
  toggleProjectActive: (
    projectId: string,
    isActive: boolean
  ) => Promise<boolean>;
}

export function useProjects(userId: string | undefined): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setProjects([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToProjects(userId, (newProjects) => {
      setProjects(newProjects);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  const createProject = useCallback(
    async (data: NewProject): Promise<Project | null> => {
      if (!userId) {
        setError("User must be logged in to create a project");
        return null;
      }

      try {
        const newProject = await createProjectService(userId, data);
        return newProject;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create project";
        setError(errorMessage);
        return null;
      }
    },
    [userId]
  );

  const updateProject = useCallback(
    async (projectId: string, data: Partial<NewProject>): Promise<boolean> => {
      try {
        await updateProjectService(projectId, data);
        return true;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to update project";
        setError(errorMessage);
        return false;
      }
    },
    []
  );

  const toggleProjectActive = useCallback(
    async (projectId: string, isActive: boolean): Promise<boolean> => {
      try {
        await toggleProjectActiveService(projectId, isActive);
        return true;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to toggle project status";
        setError(errorMessage);
        return false;
      }
    },
    []
  );

  return {
    projects,
    loading,
    error,
    createProject,
    updateProject,
    toggleProjectActive,
  };
}
