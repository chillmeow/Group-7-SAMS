export interface Subject {
  id?: string;
  subjectCode: string;
  subjectName: string;
  program: string;
  yearLevel: string;
  semester: string;
  units: number;
  lectureHours: number;
  labHours: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}
