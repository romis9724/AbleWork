"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HolidayHandling = exports.ShiftTypeCategory = exports.ShiftStatus = void 0;
exports.ShiftStatus = {
    DRAFT: 'draft',
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled',
};
exports.ShiftTypeCategory = {
    REGULAR: 'REGULAR',
    OVERTIME: 'OVERTIME',
    NIGHT: 'NIGHT',
    HOLIDAY: 'HOLIDAY',
    REMOTE: 'REMOTE',
    OFFSITE: 'OFFSITE',
    PAID_LEAVE: 'PAID_LEAVE',
    UNPAID_LEAVE: 'UNPAID_LEAVE',
};
exports.HolidayHandling = {
    SKIP_AND_SHIFT: 'skip_and_shift',
    SKIP_AND_KEEP: 'skip_and_keep',
    NO_SKIP: 'no_skip',
};
//# sourceMappingURL=shift.js.map