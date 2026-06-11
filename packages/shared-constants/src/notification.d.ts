export declare const NotificationChannelType: {
    readonly DISCORD: "discord";
    readonly EMAIL: "email";
    readonly IN_APP: "in_app";
};
export type NotificationChannelType = (typeof NotificationChannelType)[keyof typeof NotificationChannelType];
export declare const DomainEvent: {
    readonly ATTENDANCE_CLOCK_IN: "attendance.clock_in";
    readonly ATTENDANCE_CLOCK_OUT: "attendance.clock_out";
    readonly ATTENDANCE_LATE: "attendance.late";
    readonly ATTENDANCE_ABSENT: "attendance.absent";
    readonly LEAVE_REQUESTED: "leave.requested";
    readonly LEAVE_APPROVED: "leave.approved";
    readonly LEAVE_REJECTED: "leave.rejected";
    readonly SHIFT_REQUESTED: "shift.requested";
    readonly ATTENDANCE_REQUESTED: "attendance.requested";
    readonly DEVICE_CHANGE_REQUESTED: "device.change_requested";
    readonly REQUEST_FORCE_APPROVED: "request.force_approved";
    readonly DOCUMENT_SUBMITTED: "document.submitted";
    readonly DOCUMENT_STEP_APPROVED: "document.step_approved";
    readonly DOCUMENT_STEP_REJECTED: "document.step_rejected";
    readonly DOCUMENT_PREV_RETURNED: "document.prev_returned";
    readonly DOCUMENT_APPROVED: "document.approved";
    readonly DOCUMENT_REJECTED: "document.rejected";
    readonly DOCUMENT_RECALLED: "document.recalled";
    readonly DOCUMENT_CANCELLED: "document.cancelled";
};
export type DomainEvent = (typeof DomainEvent)[keyof typeof DomainEvent];
//# sourceMappingURL=notification.d.ts.map