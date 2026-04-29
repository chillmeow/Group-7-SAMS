import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '../../../firebase.config';
import { AuthService } from '../../../services/auth.service';
import { UserRole } from '../../../models/user.model';

type ChatType = 'private' | 'group';
type NewChatMode = 'teacher' | 'classmate' | 'custom-group';

interface ReplyReference {
  messageId: string;
  senderId: string;
  senderName: string;
  text: string;
  isUnsent?: boolean;
}

interface ChatThread {
  id: string;
  type: ChatType;
  title: string;
  subtitle: string;
  subjectCode?: string;
  subjectName?: string;
  sectionId?: string;
  sectionName?: string;
  teacherId?: string;
  teacherName?: string;
  studentId?: string;
  studentName?: string;
  createdBy?: string;
  participantIds: string[];
  participantNames?: string[];
  participantRoles: string[];
  lastMessage: string;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole | string;
  text: string;
  createdAt: string;
  replyTo?: ReplyReference | null;
  isUnsent?: boolean;
  unsentAt?: string;

  delivered?: boolean;
  seen?: boolean;
  seenAt?: string;
}

interface StudentProfile {
  id: string;
  userId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  sectionId?: string;
  sectionName?: string;
  studentNumber?: string;
  yearLevel?: string;
}

interface TeacherProfile {
  id: string;
  userId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

interface ClassOffering {
  id: string;
  subjectId?: string;
  subjectCode?: string;
  subjectName?: string;
  sectionId?: string;
  sectionName?: string;
  teacherId?: string;
  teacherName?: string;
  schoolYear?: string;
  semester?: string;
  status?: string;
}

interface AvailableChat {
  id: string;
  type: ChatType;
  mode: NewChatMode;
  title: string;
  subtitle: string;
  offering?: ClassOffering;
  student?: StudentProfile;
}

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './messages.html',
  styleUrl: './messages.scss',
})
export class Messages implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageScroll') messageScroll?: ElementRef<HTMLDivElement>;

  currentUser: any = null;
  currentRole: UserRole | null = null;

  currentProfileId = '';
  currentDisplayName = 'User';

  studentProfile: StudentProfile | null = null;
  teacherProfile: TeacherProfile | null = null;

  loading = true;
  loadingMessages = false;
  errorMessage = '';

  searchTerm = '';
  availableSearchTerm = '';
  newMessage = '';

  activeTab: 'all' | 'private' | 'group' = 'all';
  showNewChatPanel = false;
  newChatMode: NewChatMode = 'teacher';

  threads: ChatThread[] = [];
  messages: ChatMessage[] = [];
  availableChats: AvailableChat[] = [];
  classmates: StudentProfile[] = [];
  selectedClassmateIds = new Set<string>();

  selectedThread: ChatThread | null = null;
  replyToMessage: ChatMessage | null = null;
  showEmojiPanel = false;

  readonly emojiList: string[] = [
    '😀',
    '😁',
    '😂',
    '🤣',
    '😊',
    '😍',
    '🥰',
    '😎',
    '😢',
    '😭',
    '😡',
    '👍',
    '👎',
    '👏',
    '🙏',
    '💪',
    '❤️',
    '🔥',
    '✨',
    '🎉',
    '✅',
    '❌',
    '📌',
    '📚',
    '📝',
    '💬',
    '👀',
    '🤝',
  ];

  private unsubscribeThreads?: () => void;
  private unsubscribeMessages?: () => void;
  private shouldScrollToBottom = false;

  constructor(
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.initializeMessages();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    this.unsubscribeThreads?.();
    this.unsubscribeMessages?.();
  }

  get filteredThreads(): ChatThread[] {
    const term = this.searchTerm.trim().toLowerCase();

    return this.threads.filter((thread) => {
      const matchesTab = this.activeTab === 'all' || thread.type === this.activeTab;

      const matchesSearch =
        !term ||
        thread.title.toLowerCase().includes(term) ||
        thread.subtitle.toLowerCase().includes(term) ||
        thread.lastMessage.toLowerCase().includes(term) ||
        String(thread.subjectCode || '')
          .toLowerCase()
          .includes(term) ||
        String(thread.sectionName || '')
          .toLowerCase()
          .includes(term);

      return matchesTab && matchesSearch;
    });
  }

  get filteredAvailableChats(): AvailableChat[] {
    const term = this.availableSearchTerm.trim().toLowerCase();

    return this.availableChats.filter((chat) => {
      const matchesMode = chat.mode === this.newChatMode;

      const matchesSearch =
        !term ||
        chat.title.toLowerCase().includes(term) ||
        chat.subtitle.toLowerCase().includes(term) ||
        String(chat.offering?.subjectCode || '')
          .toLowerCase()
          .includes(term) ||
        String(chat.offering?.sectionName || '')
          .toLowerCase()
          .includes(term) ||
        String(chat.student?.studentNumber || '')
          .toLowerCase()
          .includes(term);

      return matchesMode && matchesSearch;
    });
  }

  get filteredClassmates(): StudentProfile[] {
    const term = this.availableSearchTerm.trim().toLowerCase();

    return this.classmates.filter((student) => {
      const name = this.buildName(student.firstName, student.lastName, student.email).toLowerCase();

      return (
        !term ||
        name.includes(term) ||
        String(student.studentNumber || '')
          .toLowerCase()
          .includes(term) ||
        String(student.email || '')
          .toLowerCase()
          .includes(term)
      );
    });
  }

  get emptyTitle(): string {
    if (this.activeTab === 'private') return 'No private messages yet';
    if (this.activeTab === 'group') return 'No group chats yet';
    return 'No conversations yet';
  }

  get selectedClassmateCount(): number {
    return this.selectedClassmateIds.size;
  }

  async initializeMessages(): Promise<void> {
    try {
      this.loading = true;
      this.errorMessage = '';
      this.cdr.detectChanges();

      this.currentUser = this.authService.getCurrentUser();
      this.currentRole = this.authService.getUserRole();

      if (!this.currentUser || !this.currentRole) {
        this.errorMessage = 'Unable to load messages. Please log in again.';
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      if (this.currentRole === 'teacher') {
        this.newChatMode = 'custom-group';
      }

      this.currentProfileId = String(this.currentUser.id || '').trim();
      this.currentDisplayName = this.buildName(
        this.currentUser.firstName,
        this.currentUser.lastName,
        this.currentUser.email,
      );

      await this.resolveCurrentProfile();
      await this.loadAvailableChats();
      this.listenToThreads();

      this.loading = false;
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Messages initialization error:', error);
      this.errorMessage = 'Something went wrong while loading messages.';
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  selectTab(tab: 'all' | 'private' | 'group'): void {
    this.activeTab = tab;
  }

  toggleNewChatPanel(): void {
    this.showNewChatPanel = !this.showNewChatPanel;
    this.availableSearchTerm = '';

    if (this.currentRole === 'teacher') {
      this.newChatMode = 'custom-group';
    }
  }

  setNewChatMode(mode: NewChatMode): void {
    this.newChatMode = mode;
    this.availableSearchTerm = '';
    this.selectedClassmateIds.clear();
  }

  async openAvailableChat(chat: AvailableChat): Promise<void> {
    try {
      const threadId = this.generateThreadId(chat);
      const existingThread = this.threads.find((thread) => thread.id === threadId);

      if (existingThread) {
        this.selectThread(existingThread);
        this.showNewChatPanel = false;
        return;
      }

      const threadPayload = await this.buildThreadPayload(chat);
      await setDoc(doc(db, 'chatThreads', threadId), threadPayload);

      const createdThread: ChatThread = {
        id: threadId,
        ...threadPayload,
      };

      this.selectThread(createdThread);
      this.showNewChatPanel = false;
    } catch (error) {
      console.error('Create/open chat error:', error);
      this.errorMessage = 'Unable to open this conversation.';
      this.cdr.detectChanges();
    }
  }

  toggleClassmateSelection(studentId: string): void {
    if (this.selectedClassmateIds.has(studentId)) {
      this.selectedClassmateIds.delete(studentId);
    } else {
      this.selectedClassmateIds.add(studentId);
    }
  }

  isClassmateSelected(studentId: string): boolean {
    return this.selectedClassmateIds.has(studentId);
  }

  async createCustomGroupChat(): Promise<void> {
    try {
      const selectedIds = Array.from(this.selectedClassmateIds);

      if (selectedIds.length === 0) {
        this.errorMessage = 'Please select at least one classmate.';
        return;
      }

      const now = new Date().toISOString();

      const selectedStudents = this.classmates.filter((student) =>
        selectedIds.includes(student.id),
      );

      const memberNames = [
        this.currentDisplayName,
        ...selectedStudents.map((student) =>
          this.buildName(student.firstName, student.lastName, student.email),
        ),
      ];

      const participantIds = Array.from(new Set([this.currentProfileId, ...selectedIds]));

      const threadId = `custom_group_${this.currentProfileId}_${now.replace(/[^0-9]/g, '')}`;

      const threadPayload: Omit<ChatThread, 'id'> = {
        type: 'group',
        title: `Group Chat (${participantIds.length} members)`,
        subtitle: `Classmate group • ${this.studentProfile?.sectionName || 'Same section'}`,
        sectionId: this.studentProfile?.sectionId || '',
        sectionName: this.studentProfile?.sectionName || '',
        createdBy: this.currentProfileId,
        participantIds,
        participantNames: memberNames,
        participantRoles: ['student'],
        lastMessage: '',
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      };

      await setDoc(doc(db, 'chatThreads', threadId), threadPayload);

      const createdThread: ChatThread = {
        id: threadId,
        ...threadPayload,
      };

      this.selectedClassmateIds.clear();
      this.showNewChatPanel = false;
      this.selectThread(createdThread);
    } catch (error) {
      console.error('Create group chat error:', error);
      this.errorMessage = 'Unable to create group chat.';
      this.cdr.detectChanges();
    }
  }

  selectThread(thread: ChatThread): void {
    this.selectedThread = thread;
    this.messages = [];
    this.loadingMessages = true;
    this.replyToMessage = null;
    this.showEmojiPanel = false;
    this.cdr.detectChanges();

    this.unsubscribeMessages?.();

    const messagesRef = collection(db, 'chatThreads', thread.id, 'messages');
    const messagesQuery = query(messagesRef, orderBy('createdAt', 'asc'), limit(200));

    this.unsubscribeMessages = onSnapshot(
      messagesQuery,
      (snapshot) => {
        this.ngZone.run(() => {
          this.messages = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            threadId: thread.id,
            ...(docSnap.data() as Omit<ChatMessage, 'id' | 'threadId'>),
          }));

          this.loadingMessages = false;
          this.shouldScrollToBottom = true;
          this.cdr.detectChanges();
        });
      },
      (error) => {
        this.ngZone.run(() => {
          console.error('Message listener error:', error);
          this.loadingMessages = false;
          this.errorMessage = 'Unable to load messages for this conversation.';
          this.cdr.detectChanges();
        });
      },
    );

    const unseenMessages = this.messages.filter(
      (message) => message.senderId !== this.currentProfileId && !message.seen && !message.isUnsent,
    );

    unseenMessages.forEach(async (message) => {
      try {
        await updateDoc(doc(db, 'chatThreads', thread.id, 'messages', message.id), {
          seen: true,
          seenAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Seen update error:', error);
      }
    });
  }

  async sendMessage(): Promise<void> {
    const text = this.newMessage.trim();

    if (!text || !this.selectedThread || !this.currentRole) {
      return;
    }

    const thread = this.selectedThread;
    const now = new Date().toISOString();

    const replyReference: ReplyReference | null = this.replyToMessage
      ? {
          messageId: this.replyToMessage.id,
          senderId: this.replyToMessage.senderId,
          senderName: this.replyToMessage.senderName,
          text: this.replyToMessage.isUnsent ? 'This message was unsent' : this.replyToMessage.text,
          isUnsent: !!this.replyToMessage.isUnsent,
        }
      : null;

    this.newMessage = '';
    this.replyToMessage = null;
    this.showEmojiPanel = false;
    this.cdr.detectChanges();

    const messagePayload: Omit<ChatMessage, 'id' | 'threadId'> = {
      senderId: this.currentProfileId,
      senderName: this.currentDisplayName,
      senderRole: this.currentRole,
      text,
      createdAt: now,
      replyTo: replyReference,
      isUnsent: false,

      delivered: true,
      seen: false,
      seenAt: '',
    };

    await addDoc(collection(db, 'chatThreads', thread.id, 'messages'), messagePayload);

    await updateDoc(doc(db, 'chatThreads', thread.id), {
      lastMessage: text,
      lastMessageAt: now,
      updatedAt: now,
    });
  }

  handleMessageKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  setReplyMessage(message: ChatMessage): void {
    if (message.isUnsent) return;

    this.replyToMessage = message;
    this.showEmojiPanel = false;
  }

  cancelReply(): void {
    this.replyToMessage = null;
  }

  toggleEmojiPanel(): void {
    this.showEmojiPanel = !this.showEmojiPanel;
  }

  addEmoji(emoji: string): void {
    this.newMessage = `${this.newMessage}${emoji}`;
  }

  async unsendMessage(message: ChatMessage): Promise<void> {
    if (!this.selectedThread || !this.canUnsendMessage(message)) return;

    const now = new Date().toISOString();

    try {
      await updateDoc(doc(db, 'chatThreads', this.selectedThread.id, 'messages', message.id), {
        text: '',
        isUnsent: true,
        unsentAt: now,
      });

      if (this.selectedThread.lastMessage === message.text) {
        await updateDoc(doc(db, 'chatThreads', this.selectedThread.id), {
          lastMessage: 'Message unsent',
          updatedAt: now,
        });
      }
    } catch (error) {
      console.error('Unsend message error:', error);
      this.errorMessage = 'Unable to unsend this message.';
      this.cdr.detectChanges();
    }
  }

  canUnsendMessage(message: ChatMessage): boolean {
    return this.isOwnMessage(message) && !message.isUnsent;
  }

  trackThread(index: number, thread: ChatThread): string {
    return thread.id || `${thread.title}-${index}`;
  }

  trackMessage(index: number, message: ChatMessage): string {
    return message.id || `${message.createdAt}-${index}`;
  }

  trackAvailableChat(index: number, chat: AvailableChat): string {
    return chat.id || `${chat.title}-${index}`;
  }

  trackClassmate(index: number, student: StudentProfile): string {
    return student.id || `${student.email}-${index}`;
  }

  isOwnMessage(message: ChatMessage): boolean {
    return String(message.senderId) === String(this.currentProfileId);
  }

  getReplyPreviewText(message: ChatMessage): string {
    if (message.isUnsent) return 'This message was unsent';
    return message.text || 'Message';
  }

  formatTime(value: string): string {
    if (!value) return '';

    return new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private listenToThreads(): void {
    this.unsubscribeThreads?.();

    const threadsRef = collection(db, 'chatThreads');
    const threadsQuery = query(
      threadsRef,
      where('participantIds', 'array-contains', this.currentProfileId),
    );

    this.unsubscribeThreads = onSnapshot(
      threadsQuery,
      (snapshot) => {
        this.ngZone.run(() => {
          this.threads = snapshot.docs
            .map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as Omit<ChatThread, 'id'>),
            }))
            .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

          if (this.selectedThread) {
            const updatedSelected = this.threads.find(
              (thread) => thread.id === this.selectedThread?.id,
            );

            if (updatedSelected) {
              this.selectedThread = updatedSelected;
            }
          }

          this.errorMessage = '';
          this.cdr.detectChanges();
        });
      },
      (error) => {
        this.ngZone.run(() => {
          console.error('Thread listener error:', error);
          this.errorMessage = 'Unable to load conversations.';
          this.cdr.detectChanges();
        });
      },
    );
  }

  private async resolveCurrentProfile(): Promise<void> {
    if (this.currentRole === 'student') {
      this.studentProfile = await this.findStudentProfile();

      if (this.studentProfile) {
        this.currentProfileId = this.studentProfile.id;
        this.currentDisplayName = this.buildName(
          this.studentProfile.firstName,
          this.studentProfile.lastName,
          this.studentProfile.email,
        );
      }

      return;
    }

    if (this.currentRole === 'teacher') {
      this.teacherProfile = await this.findTeacherProfile();

      if (this.teacherProfile) {
        this.currentProfileId = this.teacherProfile.id;
        this.currentDisplayName = this.buildName(
          this.teacherProfile.firstName,
          this.teacherProfile.lastName,
          this.teacherProfile.email,
        );
      }
    }
  }

  private async loadAvailableChats(): Promise<void> {
    if (this.currentRole === 'student') {
      await this.loadStudentAvailableChats();
      return;
    }

    if (this.currentRole === 'teacher') {
      await this.loadTeacherAvailableChats();
      return;
    }

    this.availableChats = [];
  }

  private async loadStudentAvailableChats(): Promise<void> {
    if (!this.studentProfile) {
      this.availableChats = [];
      this.classmates = [];
      return;
    }

    const offerings = await this.getClassOfferingsForStudent(this.studentProfile);
    this.classmates = await this.getClassmatesForStudent(this.studentProfile);

    const teacherChats: AvailableChat[] = offerings.map((offering) => ({
      id: `teacher-${offering.id}`,
      type: 'private',
      mode: 'teacher',
      title: offering.teacherName || 'Assigned Teacher',
      subtitle: `${offering.subjectCode || 'Subject'} • ${offering.sectionName || 'Section'}`,
      offering,
    }));

    const classmateChats: AvailableChat[] = this.classmates.map((student) => ({
      id: `classmate-${student.id}`,
      type: 'private',
      mode: 'classmate',
      title: this.buildName(student.firstName, student.lastName, student.email),
      subtitle: `${student.studentNumber || 'Student'} • ${student.sectionName || 'Same section'}`,
      student,
    }));

    const classGroupChats: AvailableChat[] = offerings.map((offering) => ({
      id: `group-${offering.id}`,
      type: 'group',
      mode: 'custom-group',
      title: `${offering.subjectCode || 'Subject'} Class Group`,
      subtitle: `${offering.sectionName || 'Section'} • ${offering.teacherName || 'Teacher'}`,
      offering,
    }));

    this.availableChats = [...teacherChats, ...classmateChats, ...classGroupChats];
  }

  private async loadTeacherAvailableChats(): Promise<void> {
    if (!this.teacherProfile?.id) {
      this.availableChats = [];
      return;
    }

    const offerings = await this.getClassOfferingsForTeacher(this.teacherProfile);

    this.availableChats = offerings.map((offering) => ({
      id: `group-${offering.id}`,
      type: 'group',
      mode: 'custom-group',
      title: `${offering.subjectCode || 'Subject'} Class Group`,
      subtitle: `${offering.sectionName || 'Section'} • ${offering.subjectName || ''}`,
      offering,
    }));
  }

  private generateThreadId(chat: AvailableChat): string {
    if (chat.mode === 'classmate' && chat.student) {
      const ids = [this.currentProfileId, chat.student.id].sort();
      return `private_classmate_${ids[0]}_${ids[1]}`;
    }

    const offeringId = String(chat.offering?.id || '').trim();

    if (chat.type === 'group') {
      return `group_${offeringId}`;
    }

    const studentId = this.studentProfile?.id || this.currentProfileId;
    const teacherId = String(chat.offering?.teacherId || '').trim();

    return `private_teacher_${offeringId}_${studentId}_${teacherId}`;
  }

  private async buildThreadPayload(chat: AvailableChat): Promise<Omit<ChatThread, 'id'>> {
    const now = new Date().toISOString();

    if (chat.mode === 'classmate' && chat.student) {
      const classmateName = this.buildName(
        chat.student.firstName,
        chat.student.lastName,
        chat.student.email,
      );

      return {
        type: 'private',
        title: classmateName,
        subtitle: `Classmate • ${chat.student.sectionName || 'Same section'}`,
        studentId: chat.student.id,
        studentName: classmateName,
        sectionId: this.studentProfile?.sectionId || chat.student.sectionId || '',
        sectionName: this.studentProfile?.sectionName || chat.student.sectionName || '',
        participantIds: [this.currentProfileId, chat.student.id],
        participantNames: [this.currentDisplayName, classmateName],
        participantRoles: ['student'],
        lastMessage: '',
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      };
    }

    const offering = chat.offering;
    const teacherId = String(offering?.teacherId || '').trim();
    const teacherName = String(offering?.teacherName || 'Teacher').trim();

    const participantIds =
      chat.type === 'group'
        ? await this.buildGroupParticipantIds(offering)
        : [this.studentProfile?.id || this.currentProfileId, teacherId].filter(Boolean);

    return {
      type: chat.type,
      title: chat.title,
      subtitle: chat.subtitle,
      subjectCode: offering?.subjectCode || '',
      subjectName: offering?.subjectName || '',
      sectionId: String(offering?.sectionId || ''),
      sectionName: offering?.sectionName || '',
      teacherId,
      teacherName,
      studentId: chat.type === 'private' ? this.studentProfile?.id || this.currentProfileId : '',
      studentName: chat.type === 'private' ? this.currentDisplayName : '',
      participantIds,
      participantRoles: ['teacher', 'student'],
      lastMessage: '',
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  private async buildGroupParticipantIds(offering?: ClassOffering): Promise<string[]> {
    const ids = new Set<string>();

    const teacherId = String(offering?.teacherId || '').trim();

    if (teacherId) {
      ids.add(teacherId);
    }

    const sectionId = String(offering?.sectionId || '').trim();

    if (sectionId) {
      const studentsRef = collection(db, 'students');
      const studentsQuery = query(studentsRef, where('sectionId', '==', sectionId));
      const snapshot = await getDocs(studentsQuery);

      snapshot.docs.forEach((docSnap) => {
        ids.add(docSnap.id);
      });
    }

    if (this.studentProfile?.id) {
      ids.add(this.studentProfile.id);
    }

    if (this.teacherProfile?.id) {
      ids.add(this.teacherProfile.id);
    }

    return Array.from(ids).filter(Boolean);
  }

  private async findStudentProfile(): Promise<StudentProfile | null> {
    const currentUserId = String(this.currentUser?.id || '').trim();
    const currentEmail = String(this.currentUser?.email || '')
      .toLowerCase()
      .trim();

    const studentsRef = collection(db, 'students');

    if (currentUserId) {
      const userQuery = query(studentsRef, where('userId', '==', currentUserId));
      const userSnapshot = await getDocs(userQuery);

      if (!userSnapshot.empty) {
        const docSnap = userSnapshot.docs[0];
        return { id: docSnap.id, ...(docSnap.data() as Omit<StudentProfile, 'id'>) };
      }
    }

    if (currentEmail) {
      const emailQuery = query(studentsRef, where('email', '==', currentEmail));
      const emailSnapshot = await getDocs(emailQuery);

      if (!emailSnapshot.empty) {
        const docSnap = emailSnapshot.docs[0];
        return { id: docSnap.id, ...(docSnap.data() as Omit<StudentProfile, 'id'>) };
      }
    }

    return null;
  }

  private async findTeacherProfile(): Promise<TeacherProfile | null> {
    const currentUserId = String(this.currentUser?.id || '').trim();
    const currentEmail = String(this.currentUser?.email || '')
      .toLowerCase()
      .trim();

    const teachersRef = collection(db, 'teachers');

    if (currentUserId) {
      const userQuery = query(teachersRef, where('userId', '==', currentUserId));
      const userSnapshot = await getDocs(userQuery);

      if (!userSnapshot.empty) {
        const docSnap = userSnapshot.docs[0];
        return { id: docSnap.id, ...(docSnap.data() as Omit<TeacherProfile, 'id'>) };
      }
    }

    if (currentEmail) {
      const emailQuery = query(teachersRef, where('email', '==', currentEmail));
      const emailSnapshot = await getDocs(emailQuery);

      if (!emailSnapshot.empty) {
        const docSnap = emailSnapshot.docs[0];
        return { id: docSnap.id, ...(docSnap.data() as Omit<TeacherProfile, 'id'>) };
      }
    }

    return null;
  }

  private async getClassOfferingsForStudent(student: StudentProfile): Promise<ClassOffering[]> {
    const sectionId = String(student.sectionId || '').trim();
    const sectionName = String(student.sectionName || '')
      .trim()
      .toLowerCase();

    const offeringsRef = collection(db, 'classOfferings');
    const snapshot = await getDocs(offeringsRef);

    return snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<ClassOffering, 'id'>),
      }))
      .filter((offering) => {
        const status = String(offering.status || 'active').toLowerCase();
        if (status === 'inactive' || status === 'archived') return false;

        const offeringSectionId = String(offering.sectionId || '').trim();
        const offeringSectionName = String(offering.sectionName || '')
          .trim()
          .toLowerCase();

        return (
          (!!sectionId && offeringSectionId === sectionId) ||
          (!!sectionName && offeringSectionName === sectionName)
        );
      })
      .sort((a, b) =>
        `${a.subjectCode || ''} ${a.sectionName || ''}`.localeCompare(
          `${b.subjectCode || ''} ${b.sectionName || ''}`,
        ),
      );
  }

  private async getClassOfferingsForTeacher(teacher: TeacherProfile): Promise<ClassOffering[]> {
    const teacherId = String(teacher.id || '').trim();
    const teacherName = this.buildName(teacher.firstName, teacher.lastName, teacher.email)
      .toLowerCase()
      .trim();

    const offeringsRef = collection(db, 'classOfferings');
    const snapshot = await getDocs(offeringsRef);

    return snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<ClassOffering, 'id'>),
      }))
      .filter((offering) => {
        const status = String(offering.status || 'active').toLowerCase();
        if (status === 'inactive' || status === 'archived') return false;

        const offeringTeacherId = String(offering.teacherId || '').trim();
        const offeringTeacherName = String(offering.teacherName || '')
          .toLowerCase()
          .trim();

        return (
          (!!teacherId && offeringTeacherId === teacherId) ||
          (!!teacherName && offeringTeacherName === teacherName)
        );
      })
      .sort((a, b) =>
        `${a.subjectCode || ''} ${a.sectionName || ''}`.localeCompare(
          `${b.subjectCode || ''} ${b.sectionName || ''}`,
        ),
      );
  }

  private async getClassmatesForStudent(student: StudentProfile): Promise<StudentProfile[]> {
    const sectionId = String(student.sectionId || '').trim();
    const sectionName = String(student.sectionName || '')
      .trim()
      .toLowerCase();

    const studentsRef = collection(db, 'students');
    const snapshot = await getDocs(studentsRef);

    return snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<StudentProfile, 'id'>),
      }))
      .filter((item) => {
        if (item.id === student.id) return false;

        const itemSectionId = String(item.sectionId || '').trim();
        const itemSectionName = String(item.sectionName || '')
          .trim()
          .toLowerCase();

        return (
          (!!sectionId && itemSectionId === sectionId) ||
          (!!sectionName && itemSectionName === sectionName)
        );
      })
      .sort((a, b) =>
        this.buildName(a.firstName, a.lastName, a.email).localeCompare(
          this.buildName(b.firstName, b.lastName, b.email),
        ),
      );
  }

  buildName(firstName?: string, lastName?: string, fallback?: string): string {
    const name = `${firstName || ''} ${lastName || ''}`.trim();
    return name || fallback || 'User';
  }

  private scrollToBottom(): void {
    const element = this.messageScroll?.nativeElement;
    if (!element) return;

    element.scrollTop = element.scrollHeight;
  }
}
