"use client";

import React, { useState } from "react";
import { usePlans } from "@/hooks/use-plans";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { signInWithGoogle } from "@/lib/auth";
import { PlanInfo } from "core/models/plans";
import { ActivateFreeTrialRequest, BillingPaymentLinkResponse } from "core/models/billing";


import { relevx_api } from "@/lib/client";

function PricingContent() {
  const { plans, loading, error } = usePlans();
  const { user, userProfile, loading: userLoading, reloadUser } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<PlanInfo | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);

  const handleSelectPlanStart = async (planId: string) => {
    if (userLoading) return;
    if (!user) {
      signInWithGoogle();
      return;
    }
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;

    if (userProfile?.planId === planId) return;
    if (plan.infoPrice === 0 && userProfile?.freeTrailRedeemed) {
      alert("You have already redeemed the free trial");
      return;
    }

    if (plan.infoPrice !== 0) {
      // fetch a customer specific payment link..
      const response = await relevx_api.get<BillingPaymentLinkResponse>(
        `/api/v1/user/billing/payment-link`,
        {
          planId: planId,
        }
      );
      if (!response.ok) {
        throw new Error("Failed to create or update user");
      }

      setPaymentLink(response.stripePaymentLink);
    }
    setSelectedPlan(plan);
  };

  const handleActivateFreePlan = async () => {
    if (userLoading) return;
    if (!user) {
      signInWithGoogle();
      return;
    }
    const plan = plans.find(p => p.infoPrice === 0);
    if (!plan) return;

    if (plan.infoPrice === 0) {
      const request = {
        planId: plan.id,
      } as ActivateFreeTrialRequest;
      // fetch a customer specific payment link..
      const response = await relevx_api.post<{ ok: boolean }>(
        `/api/v1/user/billing/activate-free-trial`,
        {
          ...request,
        }
      );
      if (!response.ok) {
        throw new Error("Failed to activate free plan");
      }

      await reloadUser();

      setSelectedPlan(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-500 py-10">
        <p>Error: {error}</p>
      </div>
    );
  }

  return (
    <>

      <div className="container py-8 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Pricing Plans</h1>
          <p className="text-muted-foreground">
            Choose the plan that best fits your research needs.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-xl capitalize">{plan.infoName}</CardTitle>
                <CardDescription>
                  {plan.infoDescription}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="space-y-4">
                  <div className="flex items-baseline justify-start pb-4">
                    <span className="text-xl font-medium text-muted-foreground mr-1 self-start">US</span>
                    <span className="text-5xl font-bold">
                      ${plan.infoPrice ?? "0"}
                    </span>
                  </div>

                  {userProfile && userProfile.planId == plan.id ? (
                    <Button className="rounded-lg px-6 bg-gradient-to-r from-white-500 to-green-700 text-white w-full" disabled>
                      Current Plan
                    </Button>
                  ) : (
                    <Button
                      className="rounded-lg px-6 bg-gradient-to-r from-white-500 to-red-600 text-white shadow-md hover:shadow-lg hover:from-white-500 hover:to-green-700 hover:scale-105 transition-all duration-300 w-full"
                      onClick={() => handleSelectPlanStart(plan.id)}
                    >
                      Select Plan
                    </Button>
                  )}
                </div>

                <div className="mt-6">
                  <p className="font-semibold text-sm mb-3">{plan.infoPerksHeader}</p>
                  <ul className="space-y-3 text-sm">
                    {plan.infoPerks?.map((perk, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Dialog open={!!selectedPlan} onOpenChange={(open) => !open && setSelectedPlan(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              {(selectedPlan?.infoPrice ?? 0) > 0 ? (
                <DialogTitle>Subscribe to {selectedPlan?.infoName}</DialogTitle>
              ) : (
                <DialogTitle>Start your Free Trial</DialogTitle>
              )}
              {(selectedPlan?.infoPrice ?? 0) > 0 && (
                <DialogDescription>
                  Complete your purchase securely with Stripe.
                </DialogDescription>
              )}
            </DialogHeader>
            {(selectedPlan?.infoPrice ?? 0) > 0 && (
              <div className="py-4 flex justify-center w-full">
                <Button
                  className="w-full bg-[#635BFF] hover:bg-[#5851E1] text-white font-semibold py-2 px-4 rounded shadow-sm transition-all"
                  onClick={() => {
                    if (paymentLink) {
                      window.location.href = paymentLink;
                    }
                  }}
                  disabled={!paymentLink}
                >
                  Subscribe to {selectedPlan?.infoName}
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedPlan(null)}>Cancel</Button>
              {/* Button might not be needed if Buy Button handles it, or for free plan only */}
              {(selectedPlan?.infoPrice ?? 0) === 0 && (
                <Button
                  className="bg-gradient-to-r from-green-500 to-green-700 text-white shadow-md hover:shadow-lg hover:from-green-600 hover:to-green-800 hover:scale-105 transition-all duration-300"
                  onClick={() => handleActivateFreePlan()}
                >
                  Activate Free Plan
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {plans.length === 0 && !loading && (
          <div className="text-center py-10 text-muted-foreground">
            No plans available at the moment.
          </div>
        )}
      </div>
    </>
  );
}

export default function PricingPage() {
  return (
    <PricingContent />
  );
}
