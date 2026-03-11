export type UserRole = 'admin' | 'teacher' | 'student' | 'parent';

export interface User {
  id: number;
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status?: 'active' | 'inactive';
}
