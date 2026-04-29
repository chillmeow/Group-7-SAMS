export interface Section {
  id?: string;
  sectionCode: string;
  sectionName: string;
  program: string;
  yearLevel: string;
  semester: string;
  adviserId: string;
  adviserName: string;
  schoolYear: string;
  capacity: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}
