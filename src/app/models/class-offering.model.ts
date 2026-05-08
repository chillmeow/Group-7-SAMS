export type ScheduleType = 'Lecture' | 'Laboratory';

export interface ClassSchedule {
  type: ScheduleType;
  day: string;
  startTime: string;
  endTime: string;
  room: string;
}

export interface ClassOffering {
  id?: string;
  offeringCode: string;

  subjectId: string;
  subjectCode: string;
  subjectName: string;

  sectionId: string;
  sectionName: string;

  teacherId: string;
  teacherName: string;

  schoolYear: string;
  semester: string;

  schedules: ClassSchedule[];

  status: string;

  isArchived?: boolean;
  archivedAt?: string;

  createdAt?: string;
  updatedAt?: string;
}
