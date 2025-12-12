import { RelevxUserBilling } from "./billing";

export interface RelevxUserProfile {
    email: string;
    displayName: string;
    photoURL: string | null;
    phoneNumber: string | null;
    planId: string;
    freeTrailRedeemed: boolean;
    createdAt: string;
    updatedAt: string;
    lastLoginAt: string;
    billing: RelevxUserBilling;
}

export interface CreateProfileRequest {
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    phoneNumber: string | null;
}

export interface CreateProfileResponse
    extends Omit<
        RelevxUserProfile,
        | "billing"
    > {
    ok: boolean;
}

export interface RelevxUser
    extends Omit<
        RelevxUserProfile,
        | "billing"
    > {
    uid: string;
}

