export interface Parent {
  id?: string;
  userId?: string | null;

  studentId?: string;
  studentIds?: string[];

  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  relationship: string;
  status: string;

  isArchived?: boolean;
  archivedAt?: string;

  createdAt?: string;
  updatedAt?: string;
}
