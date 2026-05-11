import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SearchService {
  normalizeSearchTerm(term: string): string {
    return term.trim().toLowerCase();
  }

  includesSearchTerm(value: unknown, searchTerm: string): boolean {
    const normalizedTerm = this.normalizeSearchTerm(searchTerm);

    if (!normalizedTerm) {
      return true;
    }

    if (value === null || value === undefined) {
      return false;
    }

    return String(value).toLowerCase().includes(normalizedTerm);
  }

  searchByFields<T extends Record<string, unknown>>(
    items: T[],
    searchTerm: string,
    fields: Array<keyof T>,
  ): T[] {
    const normalizedTerm = this.normalizeSearchTerm(searchTerm);

    if (!normalizedTerm) {
      return items;
    }

    return items.filter((item) =>
      fields.some((field) => this.includesSearchTerm(item[field], normalizedTerm)),
    );
  }

  searchByAnyValue<T extends Record<string, unknown>>(items: T[], searchTerm: string): T[] {
    const normalizedTerm = this.normalizeSearchTerm(searchTerm);

    if (!normalizedTerm) {
      return items;
    }

    return items.filter((item) =>
      Object.values(item).some((value) => this.includesSearchTerm(value, normalizedTerm)),
    );
  }

  sortByTextField<T extends Record<string, unknown>>(
    items: T[],
    field: keyof T,
    direction: 'asc' | 'desc' = 'asc',
  ): T[] {
    return [...items].sort((a, b) => {
      const valueA = String(a[field] ?? '').toLowerCase();
      const valueB = String(b[field] ?? '').toLowerCase();

      const comparison = valueA.localeCompare(valueB);

      return direction === 'asc' ? comparison : -comparison;
    });
  }

  sortByDateField<T extends Record<string, unknown>>(
    items: T[],
    field: keyof T,
    direction: 'asc' | 'desc' = 'desc',
  ): T[] {
    return [...items].sort((a, b) => {
      const dateA = new Date(String(a[field] ?? '')).getTime();
      const dateB = new Date(String(b[field] ?? '')).getTime();

      const safeDateA = Number.isNaN(dateA) ? 0 : dateA;
      const safeDateB = Number.isNaN(dateB) ? 0 : dateB;

      return direction === 'asc' ? safeDateA - safeDateB : safeDateB - safeDateA;
    });
  }
}
