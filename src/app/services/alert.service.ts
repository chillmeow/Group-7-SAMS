import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';

@Injectable({
  providedIn: 'root',
})
export class AlertService {
  success(title: string, text?: string): void {
    Swal.fire({
      icon: 'success',
      title,
      text,
      confirmButtonColor: '#2563eb',
    });
  }

  error(title: string, text?: string): void {
    Swal.fire({
      icon: 'error',
      title,
      text,
      confirmButtonColor: '#dc2626',
    });
  }

  warning(title: string, text?: string): void {
    Swal.fire({
      icon: 'warning',
      title,
      text,
      confirmButtonColor: '#f59e0b',
    });
  }

  info(title: string, text?: string): void {
    Swal.fire({
      icon: 'info',
      title,
      text,
      confirmButtonColor: '#2563eb',
    });
  }

  confirm(title: string, text?: string): Promise<boolean> {
    return Swal.fire({
      icon: 'question',
      title,
      text,
      showCancelButton: true,
      confirmButtonText: 'Yes',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#6b7280',
    }).then((result) => result.isConfirmed);
  }
}
