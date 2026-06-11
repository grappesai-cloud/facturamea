/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly DATABASE_URL: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL: string;
  readonly RESEND_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    user: {
      id: string;
      platformId: string;
      email: string;
      name: string;
      userType: 'transportator' | 'intermediar' | 'client_direct' | 'partener' | 'admin';
      companyId: string | null;
      parentUserId: string | null;
      isSubUser: boolean;
      isAdmin: boolean;
      avatarUrl: string | null;
      phone: string | null;
      onboardingSeenAt: Date | null;
      isFounder: boolean;
      founderNumber: number | null;
    } | null;
    company: {
      id: string;
      name: string;
      subscriptionTier: string;
      role?: string;
    } | null;
    license: {
      plan: 'trial' | 'lifetime';
      status: string;
      active: boolean;
      trialDaysLeft: number;
    } | null;
    anafConnected: boolean | null;
    locale: 'ro' | 'en';
    requestId: string;
  }
}
