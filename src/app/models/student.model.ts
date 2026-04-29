export interface Student {
  id?: string;
  userId: string;
  parentId?: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  sectionId: string;
  yearLevel: string;
  status: string;

  parentFirstName?: string;
  parentLastName?: string;
  parentEmail?: string;
  parentContactNumber?: string;
  parentRelationship?: string;
}
