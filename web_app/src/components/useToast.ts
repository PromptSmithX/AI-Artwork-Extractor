import { createContext, useContext } from 'react'
import type { ApiErrorKind } from '../core/api/errors'

export interface ToastItem {
  id: string
  title?: string
  message: string
  kind?: 'info' | 'success' | 'warning' | 'error'
  durationMs?: number
}

export interface ToastContextType {
  toasts: ToastItem[]
  showToast: (toast: Omit<ToastItem, 'id'>) => void
  showApiErrorToast: (kind: ApiErrorKind, detail?: string) => void
  removeToast: (id: string) => void
}

export const ToastContext = createContext<ToastContextType | null>(null)

export const formatApiErrorMessage = (kind: ApiErrorKind, detail?: string): string => {
  switch (kind) {
    case 'disconnected':
      return 'Không thể kết nối tới server. Tunnel Colab đã đổi URL? Vui lòng dán URL mới.'
    case 'auth':
      return 'Lỗi xác thực (401): Token API không đúng hoặc đã hết hạn.'
    case 'busy':
      return 'Server đang bận xử lý yêu cầu khác (409). Vui lòng đợi trong giây lát.'
    case 'too_large':
      return 'File ảnh quá lớn (> 20MB). Vui lòng chọn ảnh dung lượng nhỏ hơn.'
    case 'unsupported_media':
      return 'Định dạng file không hỗ trợ. Vui lòng tải file JPG, PNG hoặc WebP.'
    case 'validation':
      return `Dữ liệu không hợp lệ: ${detail || 'vui lòng kiểm tra lại prompt hoặc box.'}`
    case 'assistant_bad_output':
      return 'Prompt Assistant trả về phản hồi không hợp lệ. Vui lòng thử lại.'
    case 'assistant_unavailable':
      return 'Prompt Assistant tạm thời không khả dụng — dùng prompt thủ công.'
    case 'sam_unavailable':
      return 'SAM 3 chưa sẵn sàng hoặc gặp sự cố VRAM trên Colab.'
    case 'server':
    default:
      return detail || 'Đã xảy ra lỗi máy chủ trong quá trình xử lý.'
  }
}

export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
