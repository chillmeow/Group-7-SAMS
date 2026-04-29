import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
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
    const payload = this.buildParentPayload(parent);

    return from(addDoc(this.parentsCollection, payload)).pipe(
      map((ref) => ({
        id: ref.id,
        ...payload,
      })),
    );
  }

  updateParent(parent: Parent): Observable<Parent> {
    if (!parent.id) {
      return throwError(() => new Error('Parent ID is required for update.'));
    }

    const payload = this.buildParentPayload(parent);

    return from(updateDoc(doc(db, this.collectionName, parent.id), payload)).pipe(
      map(() => ({
        id: parent.id,
        ...payload,
      })),
    );
  }

  deleteParent(id: string): Observable<void> {
    return from(deleteDoc(doc(db, this.collectionName, id))).pipe(map(() => void 0));
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
      createdAt: parent.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
