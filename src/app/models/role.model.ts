export type UserRole = 'admin' | 'teacher' | 'student' | 'parent';

export interface Role {
  id: UserRole;
  name: string;
  description: string;
  dashboardRoute: string;
  isCoreRole: boolean;
}

export const SYSTEM_ROLES: Role[] = [
  {
    id: 'admin',
    name: 'Admin',
    description: 'Manages school records, users, class setup, attendance monitoring, and reports.',
    dashboardRoute: '/dashboard',
    isCoreRole: true,
  },
  {
    id: 'teacher',
    name: 'Teacher',
    description:
      'Creates attendance sessions, manages class attendance, and reviews attendance requests.',
    dashboardRoute: '/dashboard',
    isCoreRole: true,
  },
  {
    id: 'student',
    name: 'Student',
    description:
      'Scans attendance QR codes, submits attendance, and views personal attendance records.',
    dashboardRoute: '/dashboard',
    isCoreRole: true,
  },
  {
    id: 'parent',
    name: 'Parent',
    description: 'Monitors linked child attendance records, summaries, and attendance status.',
    dashboardRoute: '/dashboard',
    isCoreRole: true,
  },
];

export function getRoleById(roleId: UserRole): Role | undefined {
  return SYSTEM_ROLES.find((role) => role.id === roleId);
}

export function getRoleName(roleId: UserRole): string {
  return getRoleById(roleId)?.name ?? 'Unknown Role';
}
