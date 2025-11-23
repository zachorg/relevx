"use client";

import React, { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useProjects } from "@/hooks/use-projects";
import type { Project } from "@/lib/projects";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  MoreVertical,
  Settings,
  Trash2,
  Clock,
  Mail,
  Calendar,
  CheckCircle2,
  Circle,
  Pause,
  Play,
} from "lucide-react";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { EditProjectSettingsDialog } from "./edit-project-settings-dialog";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const { user } = useAuth();
  const { toggleProjectActive } = useProjects(user?.uid);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const frequencyLabels = {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
  };

  const destinationLabels = {
    email: "Email",
    slack: "Slack",
    none: "In-App Only",
  };

  const getDestinationIcon = () => {
    switch (project.resultsDestination) {
      case "email":
        return <Mail className="w-4 h-4" />;
      case "slack":
        return <Mail className="w-4 h-4" />; // You could use a Slack icon here
      default:
        return <Circle className="w-4 h-4" />;
    }
  };

  const handleToggleActive = async () => {
    setIsToggling(true);
    try {
      await toggleProjectActive(project.id, !project.isActive);
    } catch (err) {
      console.error("Failed to toggle project status:", err);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <>
      <Card className="group hover:shadow-lg transition-all duration-300 glass-dark h-full flex flex-col">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {project.isActive ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className="text-xs font-medium text-muted-foreground">
                  {project.isActive ? "Active" : "Paused"}
                </span>
              </div>
              <CardTitle className="text-xl mb-2 line-clamp-2">
                {project.title}
              </CardTitle>
            </div>

            {/* 3-Dot Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="w-4 h-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => setSettingsDialogOpen(true)}
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={`gap-2 ${
                    isToggling ? "opacity-50 pointer-events-none" : ""
                  }`}
                  onClick={isToggling ? undefined : handleToggleActive}
                >
                  {project.isActive ? (
                    <>
                      <Pause className="w-4 h-4" />
                      {isToggling ? "Pausing..." : "Pause"}
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      {isToggling ? "Resuming..." : "Resume"}
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 text-destructive focus:text-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <CardDescription className="line-clamp-3">
            {project.description}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex-1">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Frequency:</span>
              <span className="font-medium">
                {frequencyLabels[project.frequency]}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              {getDestinationIcon()}
              <span className="text-muted-foreground">Delivery:</span>
              <span className="font-medium">
                {destinationLabels[project.resultsDestination]}
              </span>
            </div>
          </div>
        </CardContent>

        <CardFooter className="border-t border-border/50 pt-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground w-full">
            <Calendar className="w-3 h-3" />
            <span>
              Created {new Date(project.createdAt).toLocaleDateString()}
            </span>
          </div>
        </CardFooter>
      </Card>

      {/* Delete Confirmation Dialog */}
      <DeleteProjectDialog
        project={project}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />

      {/* Edit Settings Dialog */}
      <EditProjectSettingsDialog
        project={project}
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
      />
    </>
  );
}
