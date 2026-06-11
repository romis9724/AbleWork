export declare const ShiftStatus: {
    readonly DRAFT: "draft";
    readonly CONFIRMED: "confirmed";
    readonly CANCELLED: "cancelled";
};
export type ShiftStatus = (typeof ShiftStatus)[keyof typeof ShiftStatus];
export declare const ShiftTypeCategory: {
    readonly REGULAR: "REGULAR";
    readonly OVERTIME: "OVERTIME";
    readonly NIGHT: "NIGHT";
    readonly HOLIDAY: "HOLIDAY";
    readonly REMOTE: "REMOTE";
    readonly OFFSITE: "OFFSITE";
    readonly PAID_LEAVE: "PAID_LEAVE";
    readonly UNPAID_LEAVE: "UNPAID_LEAVE";
};
export type ShiftTypeCategory = (typeof ShiftTypeCategory)[keyof typeof ShiftTypeCategory];
export declare const HolidayHandling: {
    readonly SKIP_AND_SHIFT: "skip_and_shift";
    readonly SKIP_AND_KEEP: "skip_and_keep";
    readonly NO_SKIP: "no_skip";
};
export type HolidayHandling = (typeof HolidayHandling)[keyof typeof HolidayHandling];
//# sourceMappingURL=shift.d.ts.map