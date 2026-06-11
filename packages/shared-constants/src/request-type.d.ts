export declare const RequestType: {
    readonly LEAVE_CREATE: "LEAVE_CREATE";
    readonly LEAVE_MODIFY: "LEAVE_MODIFY";
    readonly LEAVE_DELETE: "LEAVE_DELETE";
    readonly SHIFT_CREATE: "SHIFT_CREATE";
    readonly SHIFT_MODIFY: "SHIFT_MODIFY";
    readonly SHIFT_DELETE: "SHIFT_DELETE";
    readonly ATTENDANCE_EDIT: "ATTENDANCE_EDIT";
    readonly ATTENDANCE_CREATE: "ATTENDANCE_CREATE";
    readonly ATTENDANCE_DELETE: "ATTENDANCE_DELETE";
    readonly DEVICE_CHANGE: "DEVICE_CHANGE";
    readonly OFFSITE_WORK: "OFFSITE_WORK";
    readonly CUSTOM: "CUSTOM";
};
export type RequestType = (typeof RequestType)[keyof typeof RequestType];
export declare const RequestStatus: {
    readonly PENDING: "PENDING";
    readonly APPROVED: "APPROVED";
    readonly FORCE_APPROVED: "FORCE_APPROVED";
    readonly REJECTED: "REJECTED";
    readonly FORCE_REJECTED: "FORCE_REJECTED";
    readonly CANCELLED: "CANCELLED";
};
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];
//# sourceMappingURL=request-type.d.ts.map