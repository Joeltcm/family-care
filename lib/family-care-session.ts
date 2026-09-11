export type FamilyCareSession = {
  user: {
    id: string;
    email: string;
    displayName: string;
    passwordAccessConfigured: boolean;
    supervised: boolean;
  };
  family: {
    id: string;
    name: string;
    role: 'owner' | 'caregiver' | 'adult' | 'dependent' | 'viewer';
  };
  patients: Array<{
    id: string;
    legalName: string;
    preferredName: string | null;
    birthDate: string | null;
    bloodType: string | null;
    emergencySummary: string | null;
    allergiesSummary: string | null;
    relationship: 'self' | 'spouse' | 'child' | 'dependent' | 'other' | null;
    linkedToCurrentUser: boolean;
    canWrite: boolean;
    canShare: boolean;
  }>;
  created: boolean;
};

export type FamilyCarePatient = FamilyCareSession['patients'][number];
