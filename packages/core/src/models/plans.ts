export interface Plan {
  id: string;
  infoName: string;
  infoDescription: string;
  infoStripeSubscriptionId: string;
  infoPerksHeader: string;
  infoPerks: string[];
  infoPrice: number;
  settingsMaxDailyRuns: number;
}

export interface PlanInfo
  extends Omit<
    Plan,
    | "infoStripeSubscriptionId"
  > { }

export interface FetchPlansResponse {
  ok: boolean;
  plans: PlanInfo[];
}

