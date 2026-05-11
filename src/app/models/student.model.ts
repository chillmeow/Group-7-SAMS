export interface Student {
  id?: string;

  userId?: string;
  parentId?: string;

  studentNumber: string;
  firstName: string;
  lastName: string;
  email?: string;

  program?: string;
  sectionId: string;
  yearLevel: string;
  status?: string;

  parentFirstName?: string;
  parentLastName?: string;
  parentEmail?: string;
  parentContactNumber?: string;
  parentRelationship?: string;

  isArchived?: boolean;
  archivedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}
