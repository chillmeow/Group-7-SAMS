import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../../services/auth.service';
import { User } from '../../../models/user.model';

type FaqAudience = 'all' | 'admin' | 'teacher' | 'student' | 'parent';

interface FaqItem {
  id: number;
  audience: FaqAudience;
  category: string;
  question: string;
  answer: string;
  steps?: string[];
}

@Component({
  selector: 'app-faqs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './faqs.html',
  styleUrl: './faqs.scss',
})
export class FaqsComponent implements OnInit {
  private readonly authService = inject(AuthService);

  currentUser: User | null = null;

  searchTerm = '';
  selectedAudience: FaqAudience = 'all';
  selectedCategory = 'All';
  expandedFaqId: number | null = 1;

  readonly audiences: { label: string; value: FaqAudience; icon: string }[] = [
    { label: 'All Guides', value: 'all', icon: 'pi pi-book' },
    { label: 'Admin', value: 'admin', icon: 'pi pi-shield' },
    { label: 'Faculty', value: 'teacher', icon: 'pi pi-briefcase' },
    { label: 'Student', value: 'student', icon: 'pi pi-graduation-cap' },
    { label: 'Parent', value: 'parent', icon: 'pi pi-users' },
  ];

  readonly faqs: FaqItem[] = [
    {
      id: 1,
      audience: 'all',
      category: 'Getting Started',
      question: 'What is SAMS?',
      answer:
        'SAMS means Student Attendance Monitoring System. It helps the school manage student attendance, class sessions, reports, and attendance monitoring in one organized system.',
    },
    {
      id: 2,
      audience: 'all',
      category: 'Getting Started',
      question: 'How do I log in to SAMS?',
      answer:
        'Use the username and password given by the school administrator. Some accounts may use the student number, faculty username, or parent username as the default login username.',
      steps: [
        'Open the SAMS login page.',
        'Enter your username.',
        'Enter your password.',
        'Click Login.',
      ],
    },
    {
      id: 3,
      audience: 'all',
      category: 'Account',
      question: 'Can I change my login username and password?',
      answer:
        'Yes. Go to Settings to update your login username or password. Changing your username does not change your official account ID, student number, attendance records, or linked school records.',
      steps: [
        'Open the profile dropdown in the topbar.',
        'Click Settings.',
        'Go to the Login tab.',
        'Update your username or password.',
      ],
    },
    {
      id: 4,
      audience: 'all',
      category: 'Account',
      question: 'What should I do if I forgot my password?',
      answer:
        'Contact the administrator or authorized school staff. For security, users should not ask classmates or other unauthorized people to reset or access their account.',
    },
    {
      id: 5,
      audience: 'student',
      category: 'Student Attendance',
      question: 'How do students submit attendance?',
      answer:
        'Students can submit attendance using the session code or QR code shown by the teacher during the active attendance session.',
      steps: [
        'Open the Student Attendance module.',
        'Choose Session Code or Scan QR.',
        'Enter the code or scan the QR code shown by the teacher.',
        'Submit attendance.',
        'Check your attendance history after submission.',
      ],
    },
    {
      id: 6,
      audience: 'student',
      category: 'Student Attendance',
      question: 'Why does my attendance show as late or absent?',
      answer:
        'Your attendance status depends on the class session settings and the time you submitted attendance. If the session expired or you did not submit on time, the system may mark the record as late or absent.',
    },
    {
      id: 7,
      audience: 'student',
      category: 'Student Attendance',
      question: 'Can I archive my old attendance history?',
      answer:
        'Yes. In the Student Attendance module, you can move active history records to your personal archive. This only hides them from your personal view. Official school records remain safe for faculty, admin, and parent monitoring.',
    },
    {
      id: 8,
      audience: 'student',
      category: 'Student Portal',
      question: 'Where can I view my enrolled subjects?',
      answer:
        'Open My Subjects from the student sidebar. This shows the subjects or classes linked to your student account.',
    },
    {
      id: 9,
      audience: 'teacher',
      category: 'Faculty Attendance',
      question: 'How does a faculty member create an attendance session?',
      answer:
        'Faculty can create an attendance session from the Attendance module. The teacher selects the class or subject, starts the session, and displays the QR code or session code to students.',
      steps: [
        'Open the Faculty Attendance module.',
        'Choose the correct class or subject.',
        'Set the attendance session duration.',
        'Start the session.',
        'Display the QR code or session code to students.',
      ],
    },
    {
      id: 10,
      audience: 'teacher',
      category: 'Faculty Attendance',
      question: 'What happens when a student is irregular or not part of the section?',
      answer:
        'If the student is not a regular enrolled student for that class or section, the system can create a pending attendance request for teacher approval or rejection.',
    },
    {
      id: 11,
      audience: 'teacher',
      category: 'Faculty Reports',
      question: 'What is the purpose of the Faculty Reports module?',
      answer:
        'Faculty Reports are for teacher-duty attendance monitoring only. It organizes records by month, year, subject, section, session, and student records so faculty can monitor their own classes clearly.',
    },
    {
      id: 12,
      audience: 'teacher',
      category: 'Faculty Reports',
      question: 'Can faculty generate reports?',
      answer:
        'Yes. Faculty can generate reports based on their assigned class or duty scope. These reports are separate from admin institutional reports.',
    },
    {
      id: 13,
      audience: 'parent',
      category: 'Parent Monitoring',
      question: 'What can parents see in SAMS?',
      answer:
        'Parents can monitor the attendance of their linked child or children. They can view attendance status, summaries, and attendance history, but they cannot edit official attendance records.',
    },
    {
      id: 14,
      audience: 'parent',
      category: 'Parent Monitoring',
      question: 'Why does my child not appear in the Parent portal?',
      answer:
        'The parent account must be linked to the student record by the administrator. If no child appears, contact the school administrator to check the parent-student linking.',
    },
    {
      id: 15,
      audience: 'admin',
      category: 'Admin Management',
      question: 'What is the role of the Admin portal?',
      answer:
        'The Admin portal manages users, students, instructors, parents, sections, academic records, and institutional reports. Admins monitor the system but should not manually take class attendance unless it is part of a specific authorized process.',
    },
    {
      id: 16,
      audience: 'admin',
      category: 'Admin Management',
      question: 'Can admin archive or restore records?',
      answer:
        'Yes. Admin modules can support archive, restore, and permanent delete workflows depending on the record type. Archiving keeps old records organized without immediately deleting them.',
    },
    {
      id: 17,
      audience: 'admin',
      category: 'Reports & Analytics',
      question: 'What is the purpose of Admin Reports & Analytics?',
      answer:
        'Admin Reports & Analytics provides system-wide attendance monitoring for the institution. It can generate daily, weekly, monthly, yearly, or custom report snapshots for organized monitoring.',
    },
    {
      id: 18,
      audience: 'all',
      category: 'Security',
      question: 'Should I share my SAMS account?',
      answer:
        'No. Each user must use their own account. Sharing accounts may cause incorrect attendance, monitoring issues, or unauthorized access to private records.',
    },
  ];

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();

    const role = String(this.currentUser?.role || '').toLowerCase();

    if (role === 'admin' || role === 'teacher' || role === 'student' || role === 'parent') {
      this.selectedAudience = role as FaqAudience;
    }
  }

  get categories(): string[] {
    const visibleFaqs = this.faqs.filter((faq) => this.matchesAudience(faq));
    const uniqueCategories = Array.from(new Set(visibleFaqs.map((faq) => faq.category)));

    return ['All', ...uniqueCategories];
  }

  get filteredFaqs(): FaqItem[] {
    const search = this.searchTerm.trim().toLowerCase();

    return this.faqs.filter((faq) => {
      const matchesAudience = this.matchesAudience(faq);
      const matchesCategory =
        this.selectedCategory === 'All' || faq.category === this.selectedCategory;

      const matchesSearch =
        !search ||
        faq.question.toLowerCase().includes(search) ||
        faq.answer.toLowerCase().includes(search) ||
        faq.category.toLowerCase().includes(search) ||
        faq.steps?.some((step) => step.toLowerCase().includes(search));

      return matchesAudience && matchesCategory && matchesSearch;
    });
  }

  get currentRoleLabel(): string {
    const role = String(this.currentUser?.role || '').toLowerCase();

    if (role === 'admin') return 'Admin';
    if (role === 'teacher') return 'Faculty';
    if (role === 'student') return 'Student';
    if (role === 'parent') return 'Parent';

    return 'User';
  }

  get totalVisibleFaqs(): number {
    return this.filteredFaqs.length;
  }

  getRoleIcon(): string {
    const role = String(this.currentUser?.role || '').toLowerCase();

    if (role === 'admin') return 'pi pi-shield';
    if (role === 'teacher') return 'pi pi-briefcase';
    if (role === 'student') return 'pi pi-graduation-cap';
    if (role === 'parent') return 'pi pi-users';

    return 'pi pi-user';
  }

  setAudience(audience: FaqAudience): void {
    this.selectedAudience = audience;
    this.selectedCategory = 'All';
    this.expandedFaqId = this.filteredFaqs[0]?.id || null;
  }

  setCategory(category: string): void {
    this.selectedCategory = category;
    this.expandedFaqId = this.filteredFaqs[0]?.id || null;
  }

  toggleFaq(id: number): void {
    this.expandedFaqId = this.expandedFaqId === id ? null : id;
  }

  clearSearch(): void {
    this.searchTerm = '';
  }

  isExpanded(id: number): boolean {
    return this.expandedFaqId === id;
  }

  private matchesAudience(faq: FaqItem): boolean {
    if (this.selectedAudience === 'all') {
      return true;
    }

    return faq.audience === 'all' || faq.audience === this.selectedAudience;
  }
}
