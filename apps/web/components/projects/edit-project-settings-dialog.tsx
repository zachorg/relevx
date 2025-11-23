"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useProjects } from "@/hooks/use-projects";
import type { Project, Frequency, ResultsDestination } from "@/lib/projects";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Settings } from "lucide-react";

interface EditProjectSettingsDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProjectSettingsDialog({
  project,
  open,
  onOpenChange,
}: EditProjectSettingsDialogProps) {
  const { user } = useAuth();
  const { updateProject } = useProjects(user?.uid);

  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description);
  const [frequency, setFrequency] = useState<Frequency>(project.frequency);
  const [resultsDestination, setResultsDestination] =
    useState<ResultsDestination>(project.resultsDestination);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState("");

  // Reset form when project changes or dialog opens
  useEffect(() => {
    if (open) {
      setTitle(project.title);
      setDescription(project.description);
      setFrequency(project.frequency);
      setResultsDestination(project.resultsDestination);
      setError("");
    }
  }, [open, project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!title.trim()) {
      setError("Please enter a project title");
      return;
    }

    if (!description.trim()) {
      setError("Please enter a description");
      return;
    }

    setIsUpdating(true);
    try {
      const success = await updateProject(project.id, {
        title: title.trim(),
        description: description.trim(),
        frequency,
        resultsDestination,
      });

      if (success) {
        onOpenChange(false);
      } else {
        setError("Failed to update project. Please try again.");
      }
    } catch (err) {
      console.error("Failed to update project:", err);
      setError("Failed to update project. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isUpdating) {
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <DialogTitle>Project Settings</DialogTitle>
          </div>
          <DialogDescription>
            Update your project settings. Changes will take effect on the next
            scheduled research run.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 py-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="edit-title">
                Project Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-title"
                placeholder="e.g., AI Research Updates"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isUpdating}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="edit-description">
                What to Research <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="edit-description"
                placeholder="e.g., Latest developments in AI and machine learning, focusing on practical applications and breakthrough research"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isUpdating}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Be specific about what you want to track. The more detailed, the
                better the results.
              </p>
            </div>

            {/* Frequency */}
            <div className="space-y-2">
              <Label htmlFor="edit-frequency">Research Frequency</Label>
              <Select
                id="edit-frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as Frequency)}
                disabled={isUpdating}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                How often should we search for new information?
              </p>
            </div>

            {/* Results Destination */}
            <div className="space-y-2">
              <Label htmlFor="edit-destination">Delivery Method</Label>
              <Select
                id="edit-destination"
                value={resultsDestination}
                onChange={(e) =>
                  setResultsDestination(e.target.value as ResultsDestination)
                }
                disabled={isUpdating}
              >
                <option value="email">Email</option>
                <option value="slack">Slack</option>
                <option value="none">In-App Only</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                Where should we send your research updates?
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isUpdating}>
              {isUpdating ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
