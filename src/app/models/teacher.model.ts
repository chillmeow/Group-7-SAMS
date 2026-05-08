export interface Teacher {
  id?: string;
  employeeNo: string;
  userId?: string | null;
  firstName: string;
  lastName: string;
  department: string;
  email: string;
  facultyType: string;
  status: string;

  isArchived?: boolean;
  archivedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}
