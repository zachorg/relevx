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
  const [deliveryTime, setDeliveryTime] = useState(
    project.deliveryTime || "09:00"
  );
  const [timezone, setTimezone] = useState(
    project.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [priorityDomains, setPriorityDomains] = useState("");
  const [excludedDomains, setExcludedDomains] = useState("");
  const [requiredKeywords, setRequiredKeywords] = useState("");
  const [excludedKeywords, setExcludedKeywords] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState("");

  // Helper function to convert array to comma-separated string
  const arrayToString = (arr: string[] | undefined): string => {
    return arr ? arr.join(", ") : "";
  };

  // Helper function to parse comma-separated or newline-separated values
  const parseList = (value: string): string[] => {
    if (!value.trim()) return [];
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  };

  // Reset form when project changes or dialog opens
  useEffect(() => {
    if (open) {
      setTitle(project.title);
      setDescription(project.description);
      setFrequency(project.frequency);
      setResultsDestination(project.resultsDestination);
      setDeliveryTime(project.deliveryTime || "09:00");
      setTimezone(
        project.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      );
      setPriorityDomains(
        arrayToString(project.searchParameters?.priorityDomains)
      );
      setExcludedDomains(
        arrayToString(project.searchParameters?.excludedDomains)
      );
      setRequiredKeywords(
        arrayToString(project.searchParameters?.requiredKeywords)
      );
      setExcludedKeywords(
        arrayToString(project.searchParameters?.excludedKeywords)
      );
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
      // Build searchParameters object
      const priorityDomainsList = parseList(priorityDomains);
      const excludedDomainsList = parseList(excludedDomains);
      const requiredKeywordsList = parseList(requiredKeywords);
      const excludedKeywordsList = parseList(excludedKeywords);

      const searchParameters: any = {
        ...project.searchParameters,
      };

      if (priorityDomainsList.length > 0) {
        searchParameters.priorityDomains = priorityDomainsList;
      } else {
        delete searchParameters.priorityDomains;
      }

      if (excludedDomainsList.length > 0) {
        searchParameters.excludedDomains = excludedDomainsList;
      } else {
        delete searchParameters.excludedDomains;
      }

      if (requiredKeywordsList.length > 0) {
        searchParameters.requiredKeywords = requiredKeywordsList;
      } else {
        delete searchParameters.requiredKeywords;
      }

      if (excludedKeywordsList.length > 0) {
        searchParameters.excludedKeywords = excludedKeywordsList;
      } else {
        delete searchParameters.excludedKeywords;
      }

      const updateData: any = {
        title: title.trim(),
        description: description.trim(),
        frequency,
        resultsDestination,
        deliveryTime,
        timezone,
      };

      // Only include searchParameters if it has any properties or we need to clear it
      if (
        Object.keys(searchParameters).length > 0 ||
        project.searchParameters
      ) {
        updateData.searchParameters = searchParameters;
      }

      const success = await updateProject(project.id, updateData);

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
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] flex flex-col">
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

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="space-y-6 py-4 px-1 overflow-y-auto flex-1">
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
                <option value="sms">SMS</option>
                <option value="none">In-App Only</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                Where should we send your research updates?
              </p>
            </div>

            {/* Delivery Time and Timezone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-deliveryTime">Delivery Time</Label>
                <Input
                  id="edit-deliveryTime"
                  type="time"
                  value={deliveryTime}
                  onChange={(e) => setDeliveryTime(e.target.value)}
                  disabled={isUpdating}
                />
                <p className="text-xs text-muted-foreground">
                  What time should we deliver your research updates?
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-timezone">Timezone</Label>
                <Select
                  id="edit-timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  disabled={isUpdating}
                >
                  <option value="America/New_York">Eastern Time (ET)</option>
                  <option value="America/Chicago">Central Time (CT)</option>
                  <option value="America/Denver">Mountain Time (MT)</option>
                  <option value="America/Los_Angeles">Pacific Time (PT)</option>
                  <option value="America/Anchorage">Alaska Time (AKT)</option>
                  <option value="Pacific/Honolulu">Hawaii Time (HT)</option>
                  <option value="Europe/London">London (GMT/BST)</option>
                  <option value="Europe/Paris">Paris (CET/CEST)</option>
                  <option value="Europe/Berlin">Berlin (CET/CEST)</option>
                  <option value="Asia/Tokyo">Tokyo (JST)</option>
                  <option value="Asia/Shanghai">Shanghai (CST)</option>
                  <option value="Asia/Hong_Kong">Hong Kong (HKT)</option>
                  <option value="Asia/Singapore">Singapore (SGT)</option>
                  <option value="Asia/Dubai">Dubai (GST)</option>
                  <option value="Asia/Kolkata">India (IST)</option>
                  <option value="Australia/Sydney">Sydney (AEDT/AEST)</option>
                  <option value="Australia/Melbourne">
                    Melbourne (AEDT/AEST)
                  </option>
                  <option value="Pacific/Auckland">Auckland (NZDT/NZST)</option>
                  <option value="UTC">UTC</option>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select your timezone for accurate scheduling
                </p>
              </div>
            </div>

            {/* Priority Domains */}
            <div className="space-y-2">
              <Label htmlFor="edit-priorityDomains">Priority Domains</Label>
              <Textarea
                id="edit-priorityDomains"
                placeholder="e.g., example.com, news.site.com"
                value={priorityDomains}
                onChange={(e) => setPriorityDomains(e.target.value)}
                disabled={isUpdating}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Domains to prioritize in search results (one per line or
                comma-separated). We will prioritize content from these domains.
              </p>
            </div>

            {/* Excluded Domains */}
            <div className="space-y-2">
              <Label htmlFor="edit-excludedDomains">Excluded Domains</Label>
              <Textarea
                id="edit-excludedDomains"
                placeholder="e.g., spam-site.com, unreliable.com"
                value={excludedDomains}
                onChange={(e) => setExcludedDomains(e.target.value)}
                disabled={isUpdating}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Domains to exclude from search results (one per line or
                comma-separated). Results from these domains will be filtered
                out.
              </p>
            </div>

            {/* Required Keywords */}
            <div className="space-y-2">
              <Label htmlFor="edit-requiredKeywords">
                Keywords to Search For
              </Label>
              <Textarea
                id="edit-requiredKeywords"
                placeholder="e.g., machine learning, neural networks, AI"
                value={requiredKeywords}
                onChange={(e) => setRequiredKeywords(e.target.value)}
                disabled={isUpdating}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Keywords to include in searches to improve result quality (one
                per line or comma-separated). These will be used to enhance
                search queries.
              </p>
            </div>

            {/* Excluded Keywords */}
            <div className="space-y-2">
              <Label htmlFor="edit-excludedKeywords">Excluded Keywords</Label>
              <Textarea
                id="edit-excludedKeywords"
                placeholder="e.g., advertisement, sponsored, clickbait"
                value={excludedKeywords}
                onChange={(e) => setExcludedKeywords(e.target.value)}
                disabled={isUpdating}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Keywords to exclude from results (one per line or
                comma-separated). Content containing these keywords will be
                filtered out.
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
