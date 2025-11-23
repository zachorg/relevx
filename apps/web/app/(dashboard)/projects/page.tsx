"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, FolderOpen } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useProjects } from "@/hooks/use-projects";
import { Button } from "@/components/ui/button";
import { ProjectCard } from "@/components/projects/project-card";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";

export default function ProjectsPage() {
  const { user } = useAuth();
  const { projects, loading } = useProjects(user?.uid);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Sort projects: active projects first, then paused projects
  const sortedProjects = [...projects].sort((a, b) => {
    // If both have same active status, maintain original order (by createdAt)
    if (a.isActive === b.isActive) return 0;
    // Active projects come first
    return a.isActive ? -1 : 1;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-4xl font-bold mb-2">Your Projects</h1>
          <p className="text-muted-foreground">
            Manage your research projects and track ongoing investigations
          </p>
        </div>
        <Button
          size="lg"
          className="gap-2"
          onClick={() => setCreateDialogOpen(true)}
        >
          <Plus className="w-5 h-5" />
          New Project
        </Button>
      </motion.div>

      {/* Loading State */}
      {loading && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && projects.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="col-span-full text-center py-20 border-2 border-dashed border-border rounded-xl"
        >
          <FolderOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
          <p className="text-muted-foreground mb-6">
            Create your first project to start tracking research topics
          </p>
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Create Project
          </Button>
        </motion.div>
      )}

      {/* Projects Grid */}
      {!loading && projects.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          <AnimatePresence mode="popLayout">
            {sortedProjects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                layout
              >
                <ProjectCard project={project} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Create Project Dialog */}
      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}
