import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Observable, from, map, throwError } from 'rxjs';

import { db } from '../firebase.config';
import { Parent } from '../models/parent.model';

@Injectable({
  providedIn: 'root',
})
export class ParentService {
  private readonly collectionName = 'parents';
  private readonly parentsCollection = collection(db, this.collectionName);

  getParents(): Observable<Parent[]> {
    return from(getDocs(this.parentsCollection)).pipe(
      map((snapshot) =>
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Parent, 'id'>),
        })),
      ),
    );
  }

  addParent(parent: Parent): Observable<Parent> {
    return from(this.addParentSafely(parent));
  }

  updateParent(parent: Parent): Observable<Parent> {
    return from(this.updateParentSafely(parent));
  }

  deleteParent(id: string): Observable<void> {
    return from(this.archiveParent(id));
  }

  private async addParentSafely(parent: Parent): Promise<Parent> {
    const payload = this.buildParentPayload(parent);

    const existingParent = await this.findParentByEmail(payload.email);

    if (existingParent) {
      throw new Error(`Parent email ${payload.email} already exists.`);
    }

    const now = new Date().toISOString();

    const finalPayload: Omit<Parent, 'id'> = {
      ...payload,
      isArchived: false,
      archivedAt: '',
      createdAt: now,
      updatedAt: now,
    };

    const ref = await addDoc(this.parentsCollection, finalPayload);

    return {
      id: ref.id,
      ...finalPayload,
    };
  }

  private async updateParentSafely(parent: Parent): Promise<Parent> {
    if (!parent.id) {
      throw new Error('Parent ID is required for update.');
    }

    const parentRef = doc(db, this.collectionName, parent.id);
    const existingDoc = await getDoc(parentRef);

    if (!existingDoc.exists()) {
      throw new Error('Parent record not found.');
    }

    const existingParent = {
      id: existingDoc.id,
      ...existingDoc.data(),
    } as Parent;

    const payload = this.buildParentPayload(parent);

    const duplicateParent = await this.findParentByEmail(payload.email);

    if (duplicateParent && duplicateParent.id !== parent.id) {
      throw new Error(`Parent email ${payload.email} already belongs to another parent.`);
    }

    const updatedPayload: Omit<Parent, 'id'> = {
      ...payload,
      isArchived: parent.isArchived ?? existingParent.isArchived ?? false,
      archivedAt: parent.archivedAt ?? existingParent.archivedAt ?? '',
      createdAt: parent.createdAt ?? existingParent.createdAt ?? '',
      updatedAt: new Date().toISOString(),
    };

    await updateDoc(parentRef, updatedPayload);

    return {
      id: parent.id,
      ...updatedPayload,
    };
  }

  private async archiveParent(id: string): Promise<void> {
    if (!id.trim()) {
      throw new Error('Parent ID is required.');
    }

    const parentRef = doc(db, this.collectionName, id);
    const parentSnapshot = await getDoc(parentRef);

    if (!parentSnapshot.exists()) {
      throw new Error('Parent record not found.');
    }

    await updateDoc(parentRef, {
      status: 'archived',
      isArchived: true,
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async createOrLinkParentForStudent(data: {
    studentId: string;
    parentFirstName: string;
    parentLastName: string;
    parentEmail: string;
    parentContactNumber: string;
    parentRelationship: string;
  }): Promise<Parent> {
    const parentEmail = data.parentEmail.trim().toLowerCase();

    if (!data.studentId?.trim()) {
      throw new Error('Student ID is required to link parent.');
    }

    if (
      !data.parentFirstName?.trim() ||
      !data.parentLastName?.trim() ||
      !parentEmail ||
      !data.parentContactNumber?.trim() ||
      !data.parentRelationship?.trim()
    ) {
      throw new Error('Complete parent details are required.');
    }

    const existingParent = await this.findParentByEmail(parentEmail);
    const now = new Date().toISOString();

    if (existingParent) {
      const existingStudentIds = existingParent.studentIds || [];
      const hasStudent = existingStudentIds.includes(data.studentId);

      const updatedStudentIds = hasStudent
        ? existingStudentIds
        : [...existingStudentIds, data.studentId];

      const updatedParent: Parent = {
        ...existingParent,
        studentId: existingParent.studentId || data.studentId,
        studentIds: updatedStudentIds,
        firstName: data.parentFirstName.trim(),
        lastName: data.parentLastName.trim(),
        email: parentEmail,
        contactNumber: data.parentContactNumber.trim(),
        relationship: data.parentRelationship.trim(),
        status: existingParent.status || 'active',
        isArchived: existingParent.isArchived ?? false,
        archivedAt: existingParent.archivedAt ?? '',
        createdAt: existingParent.createdAt ?? now,
        updatedAt: now,
      };

      await updateDoc(doc(db, this.collectionName, existingParent.id as string), {
        studentId: updatedParent.studentId,
        studentIds: updatedParent.studentIds,
        firstName: updatedParent.firstName,
        lastName: updatedParent.lastName,
        email: updatedParent.email,
        contactNumber: updatedParent.contactNumber,
        relationship: updatedParent.relationship,
        status: updatedParent.status,
        isArchived: updatedParent.isArchived,
        archivedAt: updatedParent.archivedAt,
        createdAt: updatedParent.createdAt,
        updatedAt: updatedParent.updatedAt,
      });

      return updatedParent;
    }

    const newParentPayload: Omit<Parent, 'id'> = {
      userId: '',
      studentId: data.studentId,
      studentIds: [data.studentId],
      firstName: data.parentFirstName.trim(),
      lastName: data.parentLastName.trim(),
      email: parentEmail,
      contactNumber: data.parentContactNumber.trim(),
      relationship: data.parentRelationship.trim(),
      status: 'active',
      isArchived: false,
      archivedAt: '',
      createdAt: now,
      updatedAt: now,
    };

    const parentRef = await addDoc(this.parentsCollection, newParentPayload);

    return {
      id: parentRef.id,
      ...newParentPayload,
    };
  }

  async findParentByEmail(email: string): Promise<Parent | null> {
    const parentQuery = query(
      this.parentsCollection,
      where('email', '==', email.trim().toLowerCase()),
    );

    const snapshot = await getDocs(parentQuery);

    if (snapshot.empty) {
      return null;
    }

    const docSnap = snapshot.docs[0];

    return {
      id: docSnap.id,
      ...(docSnap.data() as Omit<Parent, 'id'>),
    };
  }

  private buildParentPayload(parent: Parent): Omit<Parent, 'id'> {
    return {
      userId: parent.userId?.trim() || '',
      studentId: parent.studentId?.trim() || '',
      studentIds: parent.studentIds || (parent.studentId ? [parent.studentId] : []),
      firstName: parent.firstName.trim(),
      lastName: parent.lastName.trim(),
      email: parent.email.trim().toLowerCase(),
      contactNumber: parent.contactNumber.trim(),
      relationship: parent.relationship.trim(),
      status: parent.status?.trim().toLowerCase() || 'active',
      isArchived: parent.isArchived ?? false,
      archivedAt: parent.archivedAt ?? '',
      createdAt: parent.createdAt || '',
      updatedAt: parent.updatedAt || '',
    };
  }
}
