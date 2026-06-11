"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestStatus = exports.RequestType = void 0;
exports.RequestType = {
    LEAVE_CREATE: 'LEAVE_CREATE',
    LEAVE_MODIFY: 'LEAVE_MODIFY',
    LEAVE_DELETE: 'LEAVE_DELETE',
    SHIFT_CREATE: 'SHIFT_CREATE',
    SHIFT_MODIFY: 'SHIFT_MODIFY',
    SHIFT_DELETE: 'SHIFT_DELETE',
    ATTENDANCE_EDIT: 'ATTENDANCE_EDIT',
    ATTENDANCE_CREATE: 'ATTENDANCE_CREATE',
    ATTENDANCE_DELETE: 'ATTENDANCE_DELETE',
    DEVICE_CHANGE: 'DEVICE_CHANGE',
    OFFSITE_WORK: 'OFFSITE_WORK',
    CUSTOM: 'CUSTOM',
};
exports.RequestStatus = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    FORCE_APPROVED: 'FORCE_APPROVED',
    REJECTED: 'REJECTED',
    FORCE_REJECTED: 'FORCE_REJECTED',
    CANCELLED: 'CANCELLED',
};
//# sourceMappingURL=request-type.js.map