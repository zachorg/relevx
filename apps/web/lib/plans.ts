/**
 * Projects management for web app
 */

// Import types from core package
import type {
    FetchPlansResponse,
    PlanInfo,
} from "core";
import { relevx_api } from "./client";

/**
 * Fetch all available plans
 */
export async function fetchPlans(): Promise<PlanInfo[]> {
    const response = await relevx_api.get<FetchPlansResponse>(
        "/api/v1/products/plans"
    );

    if (!response.ok) {
        throw new Error("Failed to fetch plans");
    }

    return response.plans;
}
