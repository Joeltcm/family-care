export type FamilyCareSession = {
  user: {
    id: string;
    email: string;
    displayName: string;
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
    linkedToCurrentUser: boolean;
    canShare: boolean;
  }>;
  created: boolean;
};
