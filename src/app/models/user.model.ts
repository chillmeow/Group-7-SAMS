export type UserRole = 'admin' | 'teacher' | 'student' | 'parent';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status?: 'active' | 'inactive';

  username?: string;
  contactNumber?: string;
  address?: string;
  photoUrl?: string;
}
